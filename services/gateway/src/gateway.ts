import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { checkPorts, expand, functionTarget, type Port, type PortWrite, type PortLiveState, type Show, type ShowSnapshot, type ShowEvent, type Node, type NodeWrite, type V2NodeRegistration } from '@comms/protocol';
import { HttpError } from './errors.ts';
import { MixRouter, type RouterEvent } from './router.ts';
import { validate } from './validate.ts';
import { Store } from './store.ts';
export { HttpError };
const emptyLive = (p: Port): PortLiveState => ({ portId: p.id, connected: false, micOff: false, keys: {}, voxOpen: false, incoming: [], audible: [], volumes: p.station?.volumes ?? {}, masterVolume: p.station?.masterVolume ?? 100 });

export class Gateway extends EventEmitter {
  rev = 1;
  live = new Map<string, PortLiveState>();
  levels: Record<string, number> = {};
  mixerStats?: { tickAvgUs: number; tickMaxUs: number; peers: number; queues?: unknown };
  sessions = new Map<string, string>();
  constructor(readonly store: Store, readonly router: MixRouter, readonly name?: string) {
    super();
    router.on('event', (event: RouterEvent) => this.onRouter(event));
    router.on('exit', () => this.allOffline());
    this.pushConfig();
  }
  get ports() { return this.store.config.ports; }
  get nodes() { return this.store.config.nodes; }
  publicPort(p: Port): Port {
    const result = structuredClone(p);
    result.hasPin = !!result.station?.pin;
    if (result.station) delete result.station.pin;
    return result;
  }
  snapshot(): ShowSnapshot {
    return { rev: this.rev, name: this.name ?? this.store.config.name, ports: this.ports.map(p => this.publicPort(p)), nodes: this.nodes,
      crosspoints: expand(this.ports), live: Object.fromEntries(this.ports.map(p => [p.id, this.live.get(p.id) ?? emptyLive(p)])) };
  }
  private broadcast(event: ShowEvent) { this.emit('event', event); }
  private pushConfig() {
    this.store.save();
    for (const id of this.live.keys()) if (!this.ports.some(p => p.id === id)) this.live.delete(id);
    const crosspoints = expand(this.ports);
    this.router.configurePorts(this.ports, crosspoints);
    this.broadcast({ type: 'config', rev: ++this.rev, ports: this.ports.map(p => this.publicPort(p)), nodes: this.nodes, crosspoints });
  }
  private commit(next: Show) {
    validate<Show>('Show', next);
    const errors = checkPorts(next.ports).filter(i => i.severity === 'error');
    if (errors.length) throw new HttpError(409, errors.map(i => `${next.ports.find(p => p.id === i.portId)?.label}: ${i.message}`).join(' '));
    const nodeIds = new Set(next.nodes.map(n => n.id));
    if (nodeIds.size !== next.nodes.length) throw new HttpError(409, 'Node IDs must be unique.');
    const circuits = new Set<string>();
    for (const p of next.ports) if (p.hardware) {
      const node = next.nodes.find(n => n.id === p.hardware!.nodeId);
      const channel = node?.[p.type === 'input' ? 'inputs' : 'outputs'].find(c => c.channel === p.hardware!.channel && c.inUse);
      const circuit = `${p.hardware.nodeId}:${p.type}:${p.hardware.channel}`;
      if (!channel || circuits.has(circuit)) throw new HttpError(409, 'Each I/O port needs a unique channel in use on a registered node.');
      circuits.add(circuit);
    }
    this.store.config = next;
    this.pushConfig();
  }
  replaceShow(raw: unknown) { const next = validate<Show>('Show', raw); this.commit(structuredClone(next)); return this.snapshot(); }
  private findPort(id: string) { const p = this.ports.find(p => p.id === id); if (!p) throw new HttpError(404, 'No such port.'); return p; }
  private setLive(id: string, patch: Partial<PortLiveState>) {
    const p = this.ports.find(p => p.id === id); if (!p) return;
    const next = { ...(this.live.get(id) ?? emptyLive(p)), ...patch };
    this.live.set(id, next);
    this.broadcast({ type: 'live', rev: ++this.rev, portId: id, live: next });
  }
  private sessionPorts(id: string) { return this.ports.filter(p => p.id === id || p.hardware?.nodeId === id); }
  private allOffline() {
    for (const p of this.ports) this.setLive(p.id, { connected: false, keys: {}, voxOpen: false, incoming: [], audible: [], client: undefined });
    this.sessions.clear(); this.levels = {}; this.mixerStats = undefined;
    this.broadcast({ type: 'levels', levels: {}, vox: {} });
  }
  private onRouter(event: RouterEvent) {
    switch (event.event) {
      case 'sync':
        this.sessions.clear();
        for (const session of event.sessions) this.sessions.set(session.sessionId, session.packId);
        for (const p of this.ports) this.setLive(p.id, { connected: [...this.sessions.values()].includes(p.hardware?.nodeId ?? p.id) });
        break;
      case 'connected':
        this.sessions.set(event.sessionId, event.packId);
        for (const p of this.sessionPorts(event.packId)) this.setLive(p.id, { connected: true });
        break;
      case 'closed':
        this.sessions.delete(event.sessionId);
        if (![...this.sessions.values()].includes(event.packId)) for (const p of this.sessionPorts(event.packId)) this.setLive(p.id, { connected: false, keys: {}, voxOpen: false, incoming: [], audible: [], client: undefined });
        break;
      case 'portState': {
        const p = this.ports.find(p => p.id === event.portId); if (!p) break;
        if (p.station) { p.station.masterVolume = event.masterVolume; p.station.volumes = event.volumes; this.store.save(); }
        const { event: _event, lastCaller, ...state } = event;
        this.setLive(p.id, { ...state, lastCaller: lastCaller ?? undefined });
        break;
      }
      case 'levels':
        this.levels = event.levels;
        this.broadcast({ type: 'levels', levels: event.levels, vox: Object.fromEntries([...this.live].map(([id, s]) => [id, s.voxOpen])) });
        break;
      case 'stats': this.mixerStats = event; break;
    }
  }
  createPort(raw: unknown) {
    const body = validate<PortWrite>('PortWrite', raw);
    if (body.type === 'input' || body.type === 'output') throw new HttpError(409, 'I/O ports come from channels in use on a node.');
    const p: Port = { ...body, id: randomUUID(), label: body.label || body.name,
      ...(body.type === 'station' ? { station: body.station ?? { masterVolume: 80, volumes: {}, replyMode: 'ptt' } } : {}) };
    const next = structuredClone(this.store.config); next.ports.push(p); this.commit(next); return this.publicPort(p);
  }
  updatePort(id: string, raw: unknown) {
    const body = validate<PortWrite>('PortWrite', raw); const old = this.findPort(id);
    if (old.type !== body.type) throw new HttpError(409, 'Create a new port to change its type.');
    const p: Port = { ...body, id, label: body.label || body.name };
    // Hardware identity is owned by registration; labels, trims and functions remain editable.
    if (old.hardware && (p.hardware?.nodeId !== old.hardware.nodeId || p.hardware?.channel !== old.hardware.channel)) throw new HttpError(409, 'A hardware port cannot move to another channel.');
    const next = structuredClone(this.store.config);
    if (p.hardware) {
      const channel = next.nodes.find(n => n.id === p.hardware!.nodeId)![p.type === 'input' ? 'inputs' : 'outputs'].find(c => c.channel === p.hardware!.channel)!;
      channel.trim = p.hardware.trim; channel.shortName = p.hardware.shortName;
    }
    // Public snapshots omit the PIN. An omitted PIN keeps it; an empty station PIN is not accepted by the schema.
    if (old.station?.pin && p.station && !('pin' in p.station)) p.station.pin = old.station.pin;
    next.ports = next.ports.map(q => q.id === id ? p : q); this.commit(next); return this.publicPort(p);
  }
  deletePort(id: string) {
    const p = this.findPort(id);
    if (p.hardware) throw new HttpError(409, 'Untick the channel in I/O nodes to remove this port.');
    const next = structuredClone(this.store.config); next.ports = next.ports.filter(p => p.id !== id);
    this.commit(next); // Refuse dangling routes; tell the user which owners need editing.
    for (const [session, owner] of this.sessions) if (owner === id) this.router.close(session);
  }
  clearPin(id: string) {
    this.findPort(id);
    const next = structuredClone(this.store.config);
    const station = next.ports.find(p => p.id === id)?.station;
    if (station) delete station.pin;
    this.commit(next);
  }
  verifyPin(id: string, pin: unknown) { const p = this.findPort(id); if (p.station?.pin && p.station.pin !== pin) throw new HttpError(403, 'Wrong PIN.'); }
  async openSession(id: string, offer: string, pin: string | undefined, candidateIp: string, client: string) {
    const station = this.ports.find(p => p.id === id && p.type === 'station'); const node = this.nodes.find(n => n.id === id);
    if (!station && !node) throw new HttpError(404, 'No such station or node.');
    if (station) this.verifyPin(id, pin);
    if (node && !this.sessionPorts(id).length) throw new HttpError(409, 'Select at least one channel in use on this node.');
    const sessionId = randomUUID(); this.sessions.set(sessionId, id);
    try {
      const answer = await this.router.open(sessionId, id, offer, candidateIp);
      for (const p of this.sessionPorts(id)) this.setLive(p.id, { client });
      return { sessionId, answer };
    } catch (e) { this.sessions.delete(sessionId); throw new HttpError(502, (e as Error).message); }
  }
  closeSession(id: string) { if (this.sessions.has(id)) this.router.close(id); }
  registerNode(raw: unknown) {
    const body = validate<V2NodeRegistration>('V2NodeRegistration', raw); const next = structuredClone(this.store.config);
    const old = next.nodes.find(n => n.id === body.nodeId);
    const channels = (dir: 'inputs' | 'outputs') => body[dir].map((name, i) => ({ channel: i + 1, inUse: false, trim: 0, ...old?.[dir].find(c => c.channel === i + 1), name }));
    const node: Node = { id: body.nodeId, name: body.name, address: body.address, lastSeen: Date.now(), inputs: channels('inputs'), outputs: channels('outputs') };
    next.nodes = [...next.nodes.filter(n => n.id !== node.id), node];
    this.reconcileNode(next, node); this.commit(next);
    return { nodeId: node.id, ports: next.ports.filter(p => p.hardware?.nodeId === node.id) };
  }
  updateNode(id: string, raw: unknown) {
    const body = validate<NodeWrite>('NodeWrite', raw); const next = structuredClone(this.store.config); const node = next.nodes.find(n => n.id === id);
    if (!node) throw new HttpError(404, 'No such node.');
    for (const dir of ['inputs', 'outputs'] as const) {
      if (body[dir].length !== node[dir].length || new Set(body[dir].map(c => c.channel)).size !== body[dir].length || body[dir].some(c => !node[dir].some(old => old.channel === c.channel))) throw new HttpError(409, 'Only registered hardware channels can be selected.');
      node[dir] = body[dir];
    }
    node.name = body.name; this.reconcileNode(next, node); this.commit(next); return node;
  }
  private reconcileNode(next: Show, node: Node) {
    const retained = new Set<string>();
    for (const [dir, type] of [['inputs', 'input'], ['outputs', 'output']] as const) for (const channel of node[dir]) {
      if (!channel.inUse) continue;
      const p = next.ports.find(p => p.type === type && p.hardware?.nodeId === node.id && p.hardware.channel === channel.channel);
      if (p) { p.hardware!.trim = channel.trim; p.hardware!.shortName = channel.shortName; if (channel.shortName) p.label = channel.shortName; retained.add(p.id); }
      else {
        const id = randomUUID(); retained.add(id);
        next.ports.push({ id, name: `${node.name} ${type === 'input' ? 'in' : 'out'} ${String(channel.channel).padStart(2, '0')}`, label: channel.shortName || `${node.name} ${type === 'input' ? 'in' : 'out'} ${channel.channel}`, type, hardware: { nodeId: node.id, channel: channel.channel, trim: channel.trim, shortName: channel.shortName }, triggers: [] });
      }
    }
    const removed = next.ports.filter(p => p.hardware?.nodeId === node.id && !retained.has(p.id)).map(p => p.id);
    for (const id of removed) {
      const used = next.ports.some(p => p.id !== id && (p.group?.members.includes(id) || p.ifb?.program === id || p.ifb?.destination === id || p.triggers.some(t => t.functions.some(f => functionTarget(f) === id || f.fn === 'routeAudio' && f.from === id))));
      if (used) throw new HttpError(409, 'This channel is routed. Remove its incoming routes before turning it off.');
    }
    next.ports = next.ports.filter(p => !removed.includes(p.id));
  }
}
