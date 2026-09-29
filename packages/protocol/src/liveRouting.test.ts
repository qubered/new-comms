import { describe, expect, it } from 'vitest';
import type { Crosspoint, Port, PortLiveState } from './generated.ts';
import { openCrosspoints } from './liveRouting.ts';

const port = (id: string, type: Port['type'] = 'station'): Port => ({ id, name: id, label: id, type, triggers: [] });
const livePort = (portId: string): PortLiveState => ({ portId, connected: true, micOff: false, keys: {}, voxOpen: false, incoming: [], audible: [], volumes: {}, masterVolume: 100 });
const route = (source: string, destination: string, gate: Crosspoint['gate'] = 'always', role: Crosspoint['role'] = 'audio'): Crosspoint => ({ source, destination, gate, role, level: 0, owner: source });

describe('open function routes', () => {
  it('closes disconnected physical calls and interrupts but keeps sessionless bus routes', () => {
    const ports = [port('mic', 'input'), port('station'), port('ifb', 'ifb'), port('show', 'conference')];
    const live = { mic: { ...livePort('mic'), connected: false }, station: livePort('station') };
    const call = route('mic', 'station', 'always', 'call');
    const interrupt = route('mic', 'ifb', 'always', 'interrupt');
    const program = route('show', 'ifb', 'always', 'program');
    const feed = route('ifb', 'station');
    const state = { ports, live, crosspoints: [call, interrupt, program, feed] };
    expect(openCrosspoints(state)).toEqual([program, feed]);
    live.mic.connected = true;
    expect(openCrosspoints(state)).toEqual(state.crosspoints);
    live.mic.micOff = true;
    expect(openCrosspoints(state)).toEqual([program, feed]);
  });

  it('resolves On Call in one pass without stale incoming or offline callers', () => {
    const ports = ['a', 'b', 'c', 'd'].map(id => port(id));
    const live = Object.fromEntries(ports.map(p => [p.id, livePort(p.id)]));
    live.a.keys[1] = true;
    // The router publishes second-pass incoming too; this cannot drive a chain.
    live.c.incoming = ['b'];
    const first = route('a', 'b', { port: 'a', trigger: { kind: 'key', key: 1 } }, 'call');
    const second = route('b', 'c', { port: 'b', trigger: { kind: 'onCall' } }, 'call');
    const chain = route('c', 'd', { port: 'c', trigger: { kind: 'onCall' } });
    const state = { ports, live, crosspoints: [first, second, chain] };
    expect(openCrosspoints(state)).toEqual([first, second]);
    live.a.connected = false;
    expect(openCrosspoints(state)).toEqual([]);
  });

  it('retains parallel open function metadata and distinguishes key and Vox gates', () => {
    const ports = [port('a'), port('b')];
    const live = { a: livePort('a'), b: livePort('b') };
    const quiet = { ...route('a', 'b'), level: -12 };
    const keyed = route('a', 'b', { port: 'a', trigger: { kind: 'key', key: 2 } });
    const vox = route('a', 'b', { port: 'a', trigger: { kind: 'vox' } });
    const state = { ports, live, crosspoints: [quiet, keyed, vox] };
    expect(openCrosspoints(state)).toEqual([quiet]);
    live.a.keys[2] = true;
    live.a.voxOpen = true;
    // Matrix shows both functions open; audio uses the highest gain once.
    expect(openCrosspoints(state)).toEqual([quiet, keyed, vox]);
  });
});
