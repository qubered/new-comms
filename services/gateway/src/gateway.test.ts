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
