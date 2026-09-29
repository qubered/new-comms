import type { Channel, Pack, Port, Show, Trigger, NodeChannel } from './generated.ts';

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
  const packPorts = new Map<string, { input?: Port; output?: Port }>();
  for (const pack of config.packs) {
    if (pack.type === 'human') {
      const station: Port = { id: pack.id, name: pack.name, label: pack.name, type: 'station', station: {
        ...(pack.pin ? { pin: pack.pin } : {}), masterVolume: pack.masterVolume, volumes: {}, replyMode: 'ptt',
      }, triggers: [] };
      ports.push(station);
      packPorts.set(pack.id, { input: station, output: station });
    } else {
      const d = pack.device;
      const circuit = (direction: 'input' | 'output'): { channels: NodeChannel[]; port?: Port } => {
        const prefix = direction === 'input' ? 'In' : 'Out';
        const labels = d?.[direction === 'input' ? 'inputs' : 'outputs'] ?? [];
        const selected = d?.[direction];
        // v1 comms-node interpreted the numeric In N / Out N label, not its array position.
        // An omitted selection never opened an audio stream.
        const number = selected?.startsWith(prefix) ? selected.slice(prefix.length).trim() : '';
        const channel = /^\+?[0-9]+$/.test(number) ? Number(number) : undefined;
        if (selected !== undefined && (!channel || !Number.isSafeInteger(channel) || channel > labels.length)) {
          throw new Error(`Cannot migrate ${pack.name}: ${direction} selection "${selected}" is not a valid ${prefix} N channel in its inventory. Correct the v1 selection before migrating.`);
        }
        const trim = d?.[direction === 'input' ? 'inputTrim' : 'outputTrim'] ?? 0;
        const channels = labels.map((name, index) => ({ channel: index + 1, name, inUse: index + 1 === channel, trim: index + 1 === channel ? trim : 0 }));
        if (!channel) return { channels };
        const suffix = direction === 'input' ? 'in' : 'out';
        const port: Port = { id: allocate(`${pack.id}-${suffix}${channel}`), name: `${pack.name} ${suffix} ${String(channel).padStart(2, '0')}`, label: `${pack.name} ${suffix}`, type: direction,
          hardware: { nodeId: pack.id, channel, trim }, triggers: [] };
        ports.push(port);
        return { channels, port };
      };
      const input = circuit('input'), output = circuit('output');
      nodes.push({ id: pack.id, name: pack.name, address: d?.address ?? '', lastSeen: 0,
        inputs: input.channels, outputs: output.channels });
      packPorts.set(pack.id, { input: input.port, output: output.port });
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
        if (pack.type === 'hardware' && own.input) standing(own.input, { fn: 'callToConference', conf });
        if (own.output) standing(own.output, { fn: 'listenToPort', from: conf });
        continue;
      }
      const functions: Trigger['functions'] = channel.type === 'partyline'
        ? [{ fn: 'callToConference', conf }]
        : config.packs.filter(other => other.id !== pack.id && other.keys.some(key => key.channelId === channel.id))
          .flatMap(other => { const output = packPorts.get(other.id)!.output; return output ? [{ fn: 'callToPort' as const, to: output.id }] : []; });
      if (pack.type === 'hardware') {
        if (own.input) functions.forEach(f => standing(own.input!, f));
        if (channel.type === 'partyline' && own.output) standing(own.output, { fn: 'callToConference', conf });
      } else {
        if (channel.type === 'partyline') own.input!.station!.volumes[conf] = k.volume;
        else for (const other of config.packs.filter(other => other.id !== pack.id && other.keys.some(key => key.channelId === channel.id))) {
          // Levels address sources heard, which are the input side of a hardware circuit.
          const input = packPorts.get(other.id)!.input;
          if (input) own.input!.station!.volumes[input.id] = k.volume;
        }
        if (!functions.length) continue;
        if (++number > 6) throw new Error(`Cannot migrate ${pack.name}: a station has at most six key triggers.`);
        own.input!.triggers.push({ kind: 'key', key: number, mode: k.mode, functions });
      }
    }
    if (pack.type === 'human') own.input!.triggers.push({ kind: 'reply', mode: 'ptt', functions: [{ fn: 'reply' }] });
  }
  return { version: 2, name: config.name ?? 'Stage A', ports, nodes };
}
