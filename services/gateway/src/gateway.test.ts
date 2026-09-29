import { EventEmitter } from 'node:events';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { demoShow, type Port, type Crosspoint, type ShowEvent } from '@comms/protocol';
import { Gateway } from './gateway.ts';
import type { MixRouter } from './router.ts';
import { buildServer, describeClient } from './server.ts';
import { Store } from './store.ts';
class FakeRouter extends EventEmitter {
  ready = true;
  configured = 0;
  ports: Port[] = [];
  crosspoints: Crosspoint[] = [];
  closed: string[] = [];
  configurePorts(ports: Port[], crosspoints: Crosspoint[]) { this.ports = ports; this.crosspoints = crosspoints; this.configured++; }
  async open() { return 'v=0\r\na=rtpmap:111 opus/48000/2\r\n'; }
  close(id: string) { this.closed.push(id); }
}
function setup() {
  const router = new FakeRouter(); const path = join(mkdtempSync(join(tmpdir(), 'comms-v2-')), 'state.json');
  const store = new Store(path); const gateway = new Gateway(store, router as unknown as MixRouter, 'Test');
  return { gateway, router, store, path, app: buildServer(gateway, { mediaIp: '127.0.0.1' }) };
}
const station = (name: string) => ({ name, type: 'station', triggers: [] });
const write = (p: Port) => { const { id, hasPin, ...body } = p; return body; };

it('creates a v2 show by REST and removes v1 routes', async () => {
  const { app, router } = setup();
  const conf = (await app.inject({ method: 'POST', url: '/api/v2/ports', payload: { name: 'Show', type: 'conference', triggers: [] } })).json();
  const response = await app.inject({ method: 'POST', url: '/api/v2/ports', payload: { ...station('SM'), triggers: [{ kind: 'key', key: 1, mode: 'ptt', functions: [{ fn: 'callToConference', conf: conf.id }] }] } });
  expect(response.statusCode).toBe(201);
  expect(router.crosspoints).toHaveLength(2);
  expect((await app.inject('/api/v2/state')).json().ports).toHaveLength(2);
  expect((await app.inject('/api/v1/packs')).statusCode).toBe(404);
});
it('rejects malformed schema bodies and semantic constraints without partial writes', async () => {
  const { app, gateway, router } = setup(); const before = router.configured;
  const invalid = await app.inject({ method: 'POST', url: '/api/v2/ports', payload: { ...station('SM'), surprise: true } });
  expect(invalid.statusCode).toBe(400);
  const dangling = await app.inject({ method: 'POST', url: '/api/v2/ports', payload: { ...station('SM'), triggers: [{ kind: 'key', key: 1, functions: [{ fn: 'callToPort', to: 'missing' }] }] } });
  expect(dangling.statusCode).toBe(409); expect(dangling.json().error).toContain('target does not exist');
  expect(gateway.ports).toHaveLength(0); expect(router.configured).toBe(before);
});
it('keeps station PINs out of snapshots, replies and events', async () => {
  const { app, gateway } = setup(); const events: ShowEvent[] = []; gateway.on('event', e => events.push(e));
  const p = gateway.createPort({ ...station('Private'), station: { pin: '1234', masterVolume: 80, volumes: {}, replyMode: 'ptt' } });
  expect(p.hasPin).toBe(true); expect(JSON.stringify(p)).not.toContain('1234'); expect(JSON.stringify(events)).not.toContain('1234');
  expect(JSON.stringify(gateway.snapshot())).not.toContain('1234');
  expect((await app.inject({ method: 'POST', url: '/api/v2/media/sessions', payload: { portId: p.id, offer: 'offer', pin: '0000' } })).statusCode).toBe(403);
  const response = await app.inject({ method: 'POST', url: '/api/v2/media/sessions', payload: { portId: p.id, offer: 'offer', pin: '1234' } });
  expect(response.statusCode).toBe(201); expect(response.json().answer).toContain('a=ptime:10');
  gateway.updatePort(p.id, { ...write(p), label: 'New' }); expect(() => gateway.verifyPin(p.id, '0000')).toThrow('Wrong PIN');
  gateway.clearPin(p.id); expect(() => gateway.verifyPin(p.id, undefined)).not.toThrow();
});
it('fan-outs numbered keys, Vox and incoming callers and persists operator levels', () => {
  const { gateway, router, store, path } = setup(); gateway.replaceShow(demoShow()); const events: ShowEvent[] = []; gateway.on('event', e => events.push(e));
  router.emit('event', { event: 'portState', portId: 'sm', keys: { '1': true }, micOff: false, voxOpen: true, incoming: ['director'], lastCaller: 'director', volumes: { show: 45 }, masterVolume: 70, audible: ['show'] });
  expect(gateway.live.get('sm')?.keys['1']).toBe(true);
  router.emit('event', { event: 'levels', levels: { sm: 0.2 } });
  expect(events.at(-1)).toEqual({ type: 'levels', levels: { sm: 0.2 }, vox: { sm: true } });
  store.flush(); expect(JSON.parse(readFileSync(path, 'utf8')).ports.find((p: Port) => p.id === 'sm').station.volumes.show).toBe(45);
});
it('rebuilds live sessions after gateway reconnect and ignores an old session closing', async () => {
  const { gateway, router } = setup(); gateway.replaceShow(demoShow());
  router.emit('event', { event: 'sync', sessions: [{ sessionId: 'old', packId: 'sm' }] });
  expect(gateway.live.get('sm')?.connected).toBe(true);
  const next = await gateway.openSession('sm', 'offer', undefined, '127.0.0.1', 'Test');
  router.emit('event', { event: 'connected', sessionId: next.sessionId, packId: 'sm' });
  router.emit('event', { event: 'closed', sessionId: 'old', packId: 'sm', reason: 'replaced' });
  expect(gateway.live.get('sm')?.connected).toBe(true);
  router.emit('exit'); expect(gateway.live.get('sm')?.connected).toBe(false); expect(gateway.sessions.size).toBe(0);
});
describe('hardware channels', () => {
  it('preserves in-use channels, trims and function ownership across registration and restart', () => {
    const { gateway, router, store, path } = setup();
    const registration = { nodeId: 'rack', name: 'Rack', address: 'local', inputs: ['In 1', 'In 2'], outputs: ['Out 1', 'Out 2'] };
    gateway.registerNode(registration); expect(gateway.ports).toHaveLength(0);
    const node = structuredClone(gateway.nodes[0]); node.inputs[0].inUse = true; node.inputs[0].trim = 6; node.outputs[1].inUse = true;
    gateway.updateNode(node.id, { name: node.name, inputs: node.inputs, outputs: node.outputs });
    expect(gateway.ports.map(p => p.type)).toEqual(['input', 'output']);
    const input = gateway.ports[0], output = gateway.ports[1];
    gateway.updatePort(input.id, { ...write(input), triggers: [{ kind: 'always', functions: [{ fn: 'callToPort', to: output.id }] }] });
    const configured = router.configured; gateway.registerNode(registration); expect(router.configured).toBe(configured); expect(gateway.ports[0].id).toBe(input.id); expect(gateway.ports[0].hardware?.trim).toBe(6); expect(router.crosspoints).toHaveLength(1);
    store.flush(); const restored = new Store(path); expect(restored.config.ports[0].triggers).toHaveLength(1);
    router.emit('event', { event: 'connected', sessionId: 'node-session', packId: 'rack' });
    expect(gateway.ports.every(p => gateway.live.get(p.id)?.connected)).toBe(true);
  });
  it('refuses to remove a referenced hardware channel atomically', () => {
    const { gateway } = setup(); gateway.registerNode({ nodeId: 'rack', name: 'Rack', address: '', inputs: ['In'], outputs: ['Out'] });
    const node = structuredClone(gateway.nodes[0]); node.inputs[0].inUse = true; node.outputs[0].inUse = true;
    gateway.updateNode(node.id, { name: node.name, inputs: node.inputs, outputs: node.outputs });
    const [input, output] = gateway.ports;
    gateway.updatePort(input.id, { ...write(input), triggers: [{ kind: 'always', functions: [{ fn: 'callToPort', to: output.id }] }] });
    node.outputs[0].inUse = false;
    expect(() => gateway.updateNode(node.id, { name: node.name, inputs: node.inputs, outputs: node.outputs })).toThrow('channel is routed');
    expect(gateway.nodes[0].outputs[0].inUse).toBe(true);
  });
});
it('automatically migrates v1 persistence and preserves the original backup', () => {
  const path = join(mkdtempSync(join(tmpdir(), 'comms-migration-')), 'state.json');
  const original = JSON.stringify({ channels: [{ id: 'show', name: 'Show', type: 'partyline', members: ['sm'] }], packs: [{ id: 'sm', name: 'Stage Manager', type: 'human', masterVolume: 80, keys: [{ channelId: 'show', mode: 'auto', volume: 75 }] }] });
  writeFileSync(path, original); const store = new Store(path);
  expect(store.config.version).toBe(2); expect(store.config.ports).toHaveLength(2); expect(readFileSync(`${path}.v1.json`, 'utf8')).toBe(original);
  expect(new Store(path).config).toEqual(store.config);
});
it('rejects deletion that would orphan another port’s function', () => {
  const { gateway } = setup(); gateway.replaceShow(demoShow());
  expect(() => gateway.deletePort('show')).toThrow('target does not exist'); expect(gateway.ports.some(p => p.id === 'show')).toBe(true);
});
it('identifies browser clients', () => { expect(describeClient('iPhone Safari/')).toBe('iPhone, Safari'); expect(describeClient('Macintosh Chrome/')).toBe('Mac, Chrome'); });

it('rejects inconsistent imported inventories and saved shows without partial writes', () => {
  const { gateway, path, router } = setup();
  gateway.registerNode({ nodeId: 'rack', name: 'Rack', address: '', inputs: ['In'], outputs: [] });
  const before = structuredClone(gateway.store.config), configured = router.configured;
  const duplicate = structuredClone(before); duplicate.nodes[0].inputs.push({ ...duplicate.nodes[0].inputs[0] });
  expect(() => gateway.replaceShow(duplicate)).toThrow('channel numbers must be unique');
  const missing = structuredClone(before); missing.nodes[0].inputs[0].inUse = true;
  expect(() => gateway.replaceShow(missing)).toThrow('channel in use needs exactly one');
  const collision = structuredClone(before); collision.ports.push({ id: 'rack', name: 'Phone', label: 'Phone', type: 'station', station: { masterVolume: 80, volumes: {}, replyMode: 'ptt' }, triggers: [] });
  expect(() => gateway.replaceShow(collision)).toThrow('Node and port IDs must be distinct');
  expect(gateway.store.config).toEqual(before); expect(router.configured).toBe(configured);
  writeFileSync(path, JSON.stringify(duplicate)); expect(() => new Store(path)).toThrow('channel numbers must be unique');
});

it('preserves edited node names and IDs across channel reorder, registration and restart', () => {
  const { gateway, store, path, router } = setup();
  const registration = { nodeId: 'rack', name: 'Hardware name', address: 'local', inputs: ['In 1', 'In 2'], outputs: [] };
  gateway.registerNode(registration);
  gateway.registerNode({ nodeId: 'other', name: 'Other', address: 'local', inputs: [], outputs: [] });
  const node = structuredClone(gateway.nodes[0]); node.inputs[0].inUse = true;
  gateway.updateNode(node.id, { name: 'Stage rack', inputs: node.inputs.reverse(), outputs: [] });
  const id = gateway.ports[0].id, configured = router.configured;
  gateway.registerNode(registration);
  expect(gateway.nodes.map(n => n.id)).toEqual(['rack', 'other']);
  expect(gateway.nodes[0].name).toBe('Stage rack'); expect(gateway.nodes[0].inputs.map(c => c.channel)).toEqual([1, 2]);
  expect(gateway.ports[0].id).toBe(id); expect(router.configured).toBe(configured);
  store.flush(); expect(new Store(path).config).toEqual(store.config);
});

it('refuses to silently discard a channel’s own routing functions on removal', () => {
  const { gateway } = setup();
  const target = gateway.createPort(station('Target'));
  const registration = { nodeId: 'rack', name: 'Rack', address: '', inputs: ['In'], outputs: [] };
  gateway.registerNode(registration);
  const node = structuredClone(gateway.nodes[0]); node.inputs[0].inUse = true;
  gateway.updateNode(node.id, { name: node.name, inputs: node.inputs, outputs: [] });
  const input = gateway.ports.find(p => p.type === 'input')!;
  gateway.updatePort(input.id, { ...write(input), triggers: [{ kind: 'vox', functions: [{ fn: 'callToPort', to: target.id }] }] });
  node.inputs[0].inUse = false;
  expect(() => gateway.updateNode(node.id, { name: node.name, inputs: node.inputs, outputs: [] })).toThrow('channel is routed');
  expect(() => gateway.registerNode({ ...registration, inputs: [] })).toThrow('channel is routed');
  expect(gateway.ports.find(p => p.id === input.id)?.triggers).toHaveLength(1);
  expect(gateway.nodes[0].inputs[0].inUse).toBe(true);
});

it('does not count a pending replacement as a connected station', async () => {
  const { gateway, router } = setup(); const p = gateway.createPort(station('Phone'));
  router.emit('event', { event: 'connected', sessionId: 'old', packId: p.id });
  const replacement = await gateway.openSession(p.id, 'offer', undefined, '127.0.0.1', 'Test');
  router.emit('event', { event: 'closed', sessionId: 'old', packId: p.id, reason: 'replaced' });
  expect(gateway.live.get(p.id)?.connected).toBe(false);
  router.emit('event', { event: 'connected', sessionId: replacement.sessionId, packId: p.id });
  expect(gateway.live.get(p.id)?.connected).toBe(true);
  router.emit('event', { event: 'sync', sessions: [] });
  expect(gateway.live.get(p.id)?.connected).toBe(false); expect(gateway.live.get(p.id)?.keys).toEqual({});
});

it('normalizes live references and operator levels on edits while the router is offline', () => {
  const { gateway, router } = setup(); const a = gateway.createPort(station('A')), b = gateway.createPort(station('B'));
  router.emit('event', { event: 'portState', portId: b.id, keys: { '1': true }, micOff: false, voxOpen: false, incoming: [a.id], lastCaller: a.id, audible: [a.id], volumes: { [a.id]: 25 }, masterVolume: 70 });
  gateway.deletePort(a.id);
  expect(gateway.live.get(b.id)).toMatchObject({ keys: {}, incoming: [], audible: [], volumes: {} });
  expect(gateway.live.get(b.id)?.lastCaller).toBeUndefined();
  gateway.updatePort(b.id, { ...write(gateway.ports.find(p => p.id === b.id)!), station: { masterVolume: 43, volumes: {}, replyMode: 'ptt' } });
  expect(gateway.live.get(b.id)?.masterVolume).toBe(43);
  router.emit('event', { event: 'levels', levels: { [a.id]: 0.4, [b.id]: 0.2 } });
  expect(gateway.levels).toEqual({ [b.id]: 0.2 });
});

it('retains omitted station PINs when a public show snapshot is imported', () => {
  const { gateway, path } = setup();
  const p = gateway.createPort({ ...station('Private'), station: { pin: '1234', masterVolume: 80, volumes: {}, replyMode: 'ptt' } });
  const snapshot = gateway.snapshot();
  gateway.replaceShow({ version: 2, name: snapshot.name, ports: snapshot.ports, nodes: snapshot.nodes });
  expect(() => gateway.verifyPin(p.id, '0000')).toThrow('Wrong PIN');
  expect(() => gateway.verifyPin(p.id, '1234')).not.toThrow();
  gateway.store.flush(); const loaded = new Store(path);
  expect(loaded.config.ports.find(port => port.id === p.id)?.station?.pin).toBe('1234');
});
