import type { Channel, Pack, Port, Show, Trigger } from './generated.ts';

/** Convert saved v1 configuration without mutating it. Runtime state is never migrated. */
export function migrateV1(config: { name?: string; channels: Channel[]; packs: Pack[] }): Show {
  const ports: Port[] = [];
  const used = new Set(config.packs.map(p => p.id));
  const allocate = (preferred: string): string => {
    let id = preferred;
    for (let n = 2; used.has(id); n++) id = `${preferred}-${n}`;
    used.add(id);
    return id;
  };
  const channels = new Map<string, string>();
  for (const c of config.channels.filter(c => c.type !== 'direct')) {
    const id = allocate(c.id);
    channels.set(c.id, id);
    ports.push({ id, name: c.name, label: c.name, subtitle: c.subText, type: 'conference', triggers: [] });
  }
  const nodes: Show['nodes'] = [];
  const packPorts = new Map<string, { input: Port; output: Port }>();
  for (const pack of config.packs) {
    if (pack.type === 'human') {
      const station: Port = { id: pack.id, name: pack.name, label: pack.name, type: 'station', station: {
        ...(pack.pin ? { pin: pack.pin } : {}), masterVolume: pack.masterVolume, volumes: {}, replyMode: 'ptt',
      }, triggers: [] };
      ports.push(station);
      packPorts.set(pack.id, { input: station, output: station });
    } else {
      const d = pack.device;
      nodes.push({ id: pack.id, name: pack.name, address: d?.address ?? '', lastSeen: 0,
        inputs: [{ channel: 1, name: d?.input ?? d?.inputs[0] ?? 'Input 1', inUse: true, trim: d?.inputTrim ?? 0 }],
        outputs: [{ channel: 1, name: d?.output ?? d?.outputs[0] ?? 'Output 1', inUse: true, trim: d?.outputTrim ?? 0 }] });
      const input: Port = { id: allocate(`${pack.id}-in1`), name: `${pack.name} in 01`, label: `${pack.name} in`, type: 'input',
        hardware: { nodeId: pack.id, channel: 1, trim: d?.inputTrim ?? 0 }, triggers: [] };
      const output: Port = { id: allocate(`${pack.id}-out1`), name: `${pack.name} out 01`, label: `${pack.name} out`, type: 'output',
        hardware: { nodeId: pack.id, channel: 1, trim: d?.outputTrim ?? 0 }, triggers: [] };
      ports.push(input, output);
      packPorts.set(pack.id, { input, output });
    }
  }
  const standing = (p: Port, f: Trigger['functions'][number]) => {
    let t = p.triggers.find(t => t.kind === 'always');
    if (!t) { t = { kind: 'always', functions: [] }; p.triggers.push(t); }
    t.functions.push(f);
  };
  for (const pack of config.packs) {
    const own = packPorts.get(pack.id)!;
    let number = 0;
    const seen = new Set<string>();
    for (const k of pack.keys) {
      if (seen.has(k.channelId)) continue;
      seen.add(k.channelId);
      const channel = config.channels.find(c => c.id === k.channelId);
      if (!channel) continue;
      const conf = channels.get(channel.id)!;
      if (channel.type === 'pgm') {
        if (pack.type === 'hardware') standing(own.input, { fn: 'callToConference', conf });
        standing(own.output, { fn: 'listenToPort', from: conf });
        continue;
      }
      const functions: Trigger['functions'] = channel.type === 'partyline'
        ? [{ fn: 'callToConference', conf }]
        : config.packs.filter(other => other.id !== pack.id && other.keys.some(key => key.channelId === channel.id))
          .map(other => ({ fn: 'callToPort' as const, to: packPorts.get(other.id)!.output.id }));
      if (pack.type === 'hardware') {
        functions.forEach(f => standing(own.input, f));
        if (channel.type === 'partyline') standing(own.output, { fn: 'callToConference', conf });
      } else {
        if (!functions.length) continue;
        if (++number > 6) throw new Error(`Cannot migrate ${pack.name}: a station has at most six key triggers.`);
        own.input.triggers.push({ kind: 'key', key: number, mode: k.mode, functions });
        if (channel.type === 'partyline') own.input.station!.volumes[conf] = k.volume;
        else for (const other of config.packs.filter(other => other.id !== pack.id && other.keys.some(key => key.channelId === channel.id))) {
          // Levels address sources heard, which are the input side of a hardware circuit.
          own.input.station!.volumes[packPorts.get(other.id)!.input.id] = k.volume;
        }
      }
    }
    if (pack.type === 'human') own.input.triggers.push({ kind: 'reply', mode: 'ptt', functions: [{ fn: 'reply' }] });
  }
  return { version: 2, name: config.name ?? 'Stage A', ports, nodes };
}
