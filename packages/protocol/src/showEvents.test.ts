import { expect, it } from 'vitest';
import { applyShowEvent } from './showEvents.ts';
import { demoShow } from './demo.ts';
import { expand } from './routing.ts';
import type { ShowSnapshot } from './generated.ts';
it('resynchronizes revision gaps and prunes deleted ports while preserving live state', () => {
  const show = demoShow(); const state: ShowSnapshot = { rev: 3, name: show.name, ports: show.ports, nodes: [], crosspoints: expand(show.ports), live: { sm: { portId: 'sm', connected: true, keys: { '1': true }, micOff: false, voxOpen: false, incoming: [], volumes: {}, masterVolume: 80, audible: ['show'] } } };
  const config = { type: 'config' as const, rev: 4, name: 'New name', ports: show.ports, nodes: [], crosspoints: state.crosspoints };
  expect((applyShowEvent(state, config) as ShowSnapshot).name).toBe('New name');
  expect(applyShowEvent(state, { ...config, rev: 5 })).toBe('resync');
  expect(applyShowEvent(null, config)).toBe('resync');
  expect((applyShowEvent(state, config) as ShowSnapshot).live.sm.keys['1']).toBe(true);
  expect((applyShowEvent(state, { ...config, ports: show.ports.filter(p => p.id !== 'sm') }) as ShowSnapshot).live.sm).toBeUndefined();
  expect(applyShowEvent(state, { type: 'levels', levels: { sm: 0.2 }, vox: { sm: true } })).toBe(state);
  expect(applyShowEvent(null, { type: 'snapshot', ...state })).toEqual(state);
});
