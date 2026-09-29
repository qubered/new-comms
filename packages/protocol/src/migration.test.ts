import { describe, expect, it } from 'vitest';
import { migrateV1 } from './migration.ts';
import { checkShow, expand } from './routing.ts';
import type { Channel, Pack } from './generated.ts';

const channels: Channel[] = [
  { id: 'show', name: 'Show', type: 'partyline', members: [] },
  { id: 'direct', name: 'Direct', type: 'direct', members: [] },
  { id: 'pgm', name: 'Program', type: 'pgm', members: [] },
];
const phone: Pack = { id: 'phone', name: 'Phone', type: 'human', masterVolume: 80,
  keys: channels.map(c => ({ channelId: c.id, mode: 'ptt', volume: 37 })) };
const rack = (): Pack => ({ id: 'rack', name: 'Rack', type: 'hardware', masterVolume: 100,
  keys: channels.map(c => ({ channelId: c.id, mode: 'ptt', volume: 100 })),
  device: { name: 'Rack', address: 'local', inputs: ['In 1', 'In 2', 'In 3'],
    outputs: ['Out 1', 'Out 2', 'Out 3', 'Out 4'], input: 'In 3', output: 'Out 4',
    inputTrim: 6, outputTrim: -6, lastSeen: 0 } });

describe('hardware migration', () => {
  it('preserves physical channel selections, inventory, trims and direct receive levels', () => {
    const hardware = rack();
    const before = JSON.stringify(hardware);
    const show = migrateV1({ channels, packs: [phone, hardware] });
    expect(checkShow(show).filter(i => i.severity === 'error')).toEqual([]);
    expect(show.nodes[0].inputs.map(c => [c.channel, c.inUse, c.trim])).toEqual([[1, false, 0], [2, false, 0], [3, true, 6]]);
    expect(show.nodes[0].outputs.map(c => [c.channel, c.inUse, c.trim])).toEqual([[1, false, 0], [2, false, 0], [3, false, 0], [4, true, -6]]);
    expect(show.ports.find(p => p.id === 'rack-in3')?.hardware?.channel).toBe(3);
    expect(show.ports.find(p => p.id === 'rack-out4')?.hardware?.channel).toBe(4);
    expect(show.ports.find(p => p.id === 'phone')?.station?.volumes).toEqual({ show: 37, 'rack-in3': 37 });
    expect(expand(show.ports)).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: 'phone', destination: 'rack-out4', role: 'call' }),
      expect.objectContaining({ source: 'rack-in3', destination: 'phone', role: 'call' }),
      expect.objectContaining({ source: 'rack-in3', destination: 'pgm' }),
    ]));
    expect(JSON.stringify(hardware)).toBe(before);
  });

  it('keeps disabled capture disabled while preserving playback routes', () => {
    const hardware = rack(); delete hardware.device!.input;
    const show = migrateV1({ channels, packs: [phone, hardware] });
    expect(checkShow(show).filter(i => i.severity === 'error')).toEqual([]);
    expect(show.nodes[0].inputs.every(c => !c.inUse)).toBe(true);
    expect(show.ports.some(p => p.type === 'input')).toBe(false);
    expect(expand(show.ports)).toContainEqual(expect.objectContaining({ source: 'phone', destination: 'rack-out4', role: 'call' }));
    expect(show.ports.find(p => p.id === 'phone')?.station?.volumes).toEqual({ show: 37 });
  });

  it('keeps disabled playback disabled while preserving input direct calls', () => {
    const hardware = rack(); delete hardware.device!.output;
    const show = migrateV1({ channels, packs: [phone, hardware] });
    expect(checkShow(show).filter(i => i.severity === 'error')).toEqual([]);
    expect(show.nodes[0].outputs.every(c => !c.inUse)).toBe(true);
    expect(show.ports.find(p => p.id === 'phone')?.station?.volumes).toEqual({ show: 37, 'rack-in3': 37 });
    expect(show.ports.some(p => p.type === 'output')).toBe(false);
    expect(expand(show.ports)).toContainEqual(expect.objectContaining({ source: 'rack-in3', destination: 'phone', role: 'call' }));
  });

  it('does not activate audio for an unregistered hardware pack', () => {
    const hardware = rack(); delete hardware.device;
    const show = migrateV1({ channels, packs: [phone, hardware] });
    expect(checkShow(show).filter(i => i.severity === 'error')).toEqual([]);
    expect(show.nodes[0]).toMatchObject({ inputs: [], outputs: [] });
    expect(show.ports.some(p => p.hardware)).toBe(false);
  });

  it.each(['Truck', 'In 0', 'In 4'])('rejects an ambiguous or unavailable input selection %s', input => {
    const hardware = rack(); hardware.device!.input = input;
    expect(() => migrateV1({ channels, packs: [hardware] })).toThrow(/Cannot migrate Rack: input selection.*Correct the v1 selection/);
  });
});
