import type { Crosspoint, ShowSnapshot } from './generated.ts';

type RoutingState = Pick<ShowSnapshot, 'ports' | 'crosspoints' | 'live'>;

/** Open function routes, before parallel routes select their highest effective gain.
 * Physical sources must be connected. Buses exist independently of media sessions.
 * On Call uses first-pass calls only, matching the router's non-chaining evaluation.
 */
export function openCrosspoints({ ports, crosspoints, live }: RoutingState): Crosspoint[] {
  const byId = new Map(ports.map(port => [port.id, port]));
  const sourceReady = (point: Crosspoint) => {
    const source = byId.get(point.source);
    if (!source || live[point.source]?.micOff) return false;
    if (source.type === 'station' || source.type === 'input') return !!live[source.id]?.connected;
    return source.type === 'conference' || source.type === 'ifb';
  };
  const firstPass = (point: Crosspoint): boolean => {
    if (!sourceReady(point)) return false;
    if (point.gate === 'always') return true;
    const { port, trigger } = point.gate;
    switch (trigger.kind) {
      case 'key': return !!live[port]?.keys[trigger.key];
      case 'reply': return !!live[port]?.keys.reply;
      case 'vox': return !!live[port]?.voxOpen;
      case 'onCall': return false;
    }
  };
  const opened = new Set(crosspoints.filter(firstPass));
  const called = new Set([...opened].filter(point => point.role === 'call').map(point => point.destination));
  return crosspoints.filter(point => opened.has(point) || (
    point.gate !== 'always' && point.gate.trigger.kind === 'onCall' &&
    sourceReady(point) && called.has(point.gate.port)
  ));
}
