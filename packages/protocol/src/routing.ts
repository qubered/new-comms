import type { Crosspoint, Function as PortFunction, Gate, Port, Trigger } from './generated.ts';

export const DEFAULT_VOX = { threshold: -40, attack: 20, hang: 600 };
export const hasInput = (p: Port) => ['station', 'input', 'conference', 'ifb'].includes(p.type);
export const hasOutput = (p: Port) => ['station', 'output', 'conference', 'ifb'].includes(p.type);
export const isBus = (p: Port) => p.type === 'conference' || p.type === 'ifb';
export const functionTarget = (f: PortFunction): string | undefined => {
  switch (f.fn) {
    case 'callToPort': case 'routeAudio': return f.to;
    case 'callToConference': return f.conf;
    case 'callToGroup': return f.group;
    case 'callToIFB': return f.ifb;
    case 'listenToPort': return f.from;
    case 'reply': return undefined;
  }
};
export function gateFor(port: string, trigger: Trigger): Gate {
  if (trigger.kind === 'always') return 'always';
  return { port, trigger: trigger.kind === 'key' ? { kind: 'key', key: trigger.key } : { kind: trigger.kind } };
}

/** Pure expansion. Ownership indices let matrix cells navigate back to their function.
 * Reply is resolved at runtime; it must never capture a stale last caller in configuration.
 */
export function expand(ports: Port[]): Crosspoint[] {
  const byId = new Map(ports.map(p => [p.id, p]));
  const result: Crosspoint[] = [];
  for (const p of ports) {
    p.triggers.forEach((t, triggerIndex) => t.functions.forEach((f, functionIndex) => {
      const gate = gateFor(p.id, t);
      const push = (source: string, destination: string, role: Crosspoint['role'] = 'audio', g = gate) => {
        result.push({ source, destination, level: f.level ?? 0, gate: g, owner: p.id, triggerIndex, functionIndex, role });
      };
      switch (f.fn) {
        case 'callToPort': push(p.id, f.to, 'call'); break;
        case 'callToConference':
          if (hasInput(p)) push(p.id, f.conf);
          if (hasOutput(p)) push(f.conf, p.id, 'audio', 'always');
          break;
        case 'callToGroup':
          for (const member of byId.get(f.group)?.group?.members ?? []) push(p.id, member, 'call');
          break;
        case 'callToIFB': push(p.id, f.ifb, 'interrupt'); break;
        case 'listenToPort': push(f.from, p.id); break;
        case 'routeAudio': push(f.from, f.to); break;
        case 'reply': break;
      }
    }));
    if (p.type === 'ifb' && p.ifb) {
      result.push({ source: p.ifb.program, destination: p.id, level: 0, gate: 'always', owner: p.id, role: 'program' });
      // An explicit listen to the IFB already supplies this feed: do not double it.
      const explicit = ports.some(q => q.triggers.some(t => t.functions.some(f =>
        (f.fn === 'listenToPort' && q.id === p.ifb!.destination && f.from === p.id) ||
        (f.fn === 'routeAudio' && f.from === p.id && f.to === p.ifb!.destination))));
      if (!explicit) result.push({ source: p.id, destination: p.ifb.destination, level: 0, gate: 'always', owner: p.id, role: 'audio' });
    }
  }
  return result;
}

export interface ConstraintIssue { portId: string; message: string; severity: 'error' | 'attention' }
/** Structural errors reject writes. Empty conferences remain editable and appear in Needs attention. */
export function checkPorts(ports: Port[]): ConstraintIssue[] {
  const issues: ConstraintIssue[] = [];
  const byId = new Map(ports.map(p => [p.id, p]));
  const add = (p: Port, message: string, severity: ConstraintIssue['severity'] = 'error') => issues.push({ portId: p.id, message, severity });
  const ids = new Set<string>();
  for (const p of ports) {
    if (ids.has(p.id)) add(p, 'Port IDs must be unique.');
    ids.add(p.id);
    if (p.type === 'station' && !p.station) add(p, 'A station needs station settings.');
    if (['input', 'output'].includes(p.type) && !p.hardware) add(p, 'An I/O port needs a hardware channel.');
    if (p.station && p.type !== 'station') add(p, 'Only stations have station settings.');
    if (p.hardware && !['input', 'output'].includes(p.type)) add(p, 'Only I/O ports have hardware channels.');
    if (p.group && p.type !== 'group') add(p, 'Only groups have members.');
    if (p.ifb && p.type !== 'ifb') add(p, 'Only IFBs have program and destination settings.');
    if (p.triggers.filter(t => t.kind === 'key').length > 6) add(p, 'A station has at most six key triggers.');
    const seen = new Set<string>();
    for (const t of p.triggers) {
      const token = t.kind === 'key' ? `key:${t.key}` : t.kind;
      if (seen.has(token)) add(p, 'Each trigger may be configured only once.');
      seen.add(token);
      if (['conference', 'group', 'ifb'].includes(p.type)) add(p, 'Conferences, groups and IFBs have no triggers.');
      if ((t.kind === 'key' || t.kind === 'reply') && p.type !== 'station') add(p, 'Only stations have keys and Reply.');
      if (t.kind === 'key' && (!Number.isInteger(t.key) || t.key < 1 || t.key > 6)) add(p, 'Key numbers must be 1–6.');
      if (t.kind === 'vox' && !['station', 'input'].includes(p.type)) add(p, 'Only stations and inputs have Vox.');
      if (t.kind === 'reply' && (t.functions.length !== 1 || t.functions[0].fn !== 'reply')) add(p, 'Reply has only the reply function.');
      for (const f of t.functions) {
        if (f.fn === 'reply') {
          if (t.kind !== 'reply') add(p, 'The reply function needs the Reply trigger.');
          continue;
        }
        const target = byId.get(functionTarget(f)!);
        if (!target) { add(p, 'The function target does not exist.'); continue; }
        if (['callToPort', 'callToGroup', 'callToIFB'].includes(f.fn) && !hasInput(p)) add(p, 'This function needs an input.');
        if (f.fn === 'callToPort' && !['station', 'output'].includes(target.type)) add(p, 'Call to port needs a station or output.');
        if (f.fn === 'callToConference' && target.type !== 'conference') add(p, 'Call to conference needs a conference.');
        if (f.fn === 'callToGroup' && target.type !== 'group') add(p, 'Call to group needs a group.');
        if (f.fn === 'callToIFB' && target.type !== 'ifb') add(p, 'Call to IFB needs an IFB.');
        if (f.fn === 'listenToPort' && !hasOutput(p)) add(p, 'Listening needs an output.');
        if (f.fn === 'routeAudio' && !byId.has(f.from)) add(p, 'The route source does not exist.');
      }
    }
    if (p.type === 'group') {
      if (!p.group?.members.length) add(p, 'A group needs members.');
      if (new Set(p.group?.members).size !== p.group?.members.length) add(p, 'Group members must be unique.');
      for (const id of p.group?.members ?? []) if (!['station', 'output'].includes(byId.get(id)?.type ?? '')) add(p, 'Group members must be stations or outputs.');
    }
    if (p.type === 'ifb') {
      if (!p.ifb || !byId.has(p.ifb.program) || !byId.has(p.ifb.destination)) add(p, 'An IFB needs a program and a destination.');
      else {
        if (!['input', 'station', 'conference'].includes(byId.get(p.ifb.program)!.type)) add(p, 'IFB program needs an input, station or conference.');
        if (!['station', 'output'].includes(byId.get(p.ifb.destination)!.type)) add(p, 'IFB destination needs a station or output.');
      }
    }
  }
  const crosspoints = expand(ports);
  for (const x of crosspoints) {
    const source = byId.get(x.source), destination = byId.get(x.destination), owner = byId.get(x.owner)!;
    if (!source || !destination) continue;
    if (source.type === 'group') add(owner, 'Groups are never sources.');
    else if (!hasInput(source)) add(owner, 'The source has no audio to route.');
    if (destination.type === 'input' || destination.type === 'group') add(owner, 'The destination cannot receive audio.');
    // Program is the deliberate bus-to-IFB edge; arbitrary bus chains remain forbidden.
    if (isBus(source) && isBus(destination) && x.role !== 'program') add(owner, 'No conference/IFB → conference/IFB crosspoints.');
  }
  for (const p of ports.filter(p => p.type === 'conference')) {
    if (!crosspoints.some(x => x.destination === p.id)) add(p, 'A conference needs at least one talker.', 'attention');
  }
  return issues.filter((issue, i, all) => all.findIndex(other => other.portId === issue.portId && other.message === issue.message) === i);
}
