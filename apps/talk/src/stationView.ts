import { functionTarget, type Port, type Crosspoint, type PortLiveState, type Trigger } from "@comms/protocol";

export const stationKeys = (station: Port) =>
  station.triggers
    .filter((trigger) => trigger.kind === "key")
    .sort((a, b) => a.key - b.key);
export const keyTarget = (station: Port, key: number, ports: Port[]) => {
  const trigger = stationKeys(station).find((item) => item.key === key);
  const target = trigger?.functions[0];
  return ports.find((port) => port.id === (target && functionTarget(target)));
};
/** Every incoming source has one operator fader, including returns gated by other ports. */
export function heardSources(
  station: Port,
  ports: Port[],
  crosspoints: Crosspoint[],
  audible: string[] = [],
) {
  const ids = new Set([
    ...crosspoints
      .filter((point) => point.destination === station.id)
      .map((point) => point.source),
    ...audible,
  ]);
  return ports.filter((port) => port.id !== station.id && ids.has(port.id));
}
export function alwaysListens(station: Port, ports: Port[]) {
  const ids = new Set(
    station.triggers
      .filter((trigger) => trigger.kind === "always")
      .flatMap((trigger) =>
        trigger.functions
          .filter((fn) => fn.fn === "listenToPort")
          .map((fn) => fn.from),
      ),
  );
  return ports.filter((port) => ids.has(port.id));
}

/** A raw route can open this station's microphone just like a call function. */
export function keyOpensMic(station: Port, trigger: Trigger): boolean {
  return trigger.functions.some((fn) =>
    fn.fn.startsWith("callTo") || fn.fn === "reply" ||
    (fn.fn === "routeAudio" && fn.from === station.id),
  );
}

/** Conference returns are permanent; activity belongs to their individual contributors. */
export function conferenceTalkers(
  station: Port,
  conference: Port,
  ports: Port[],
  crosspoints: Crosspoint[],
  live: Record<string, PortLiveState>,
  levels: Record<string, number>,
): { name: string; level: number }[] {
  const open = (point: Crosspoint, allowOnCall = true): boolean => {
    if (live[point.source]?.micOff) return false;
    if (point.gate === "always") return true;
    const { port, trigger } = point.gate;
    const state = live[port];
    switch (trigger.kind) {
      case "key": return !!state?.keys[trigger.key];
      case "reply": return !!state?.keys.reply;
      case "vox": return !!state?.voxOpen;
      case "onCall": return allowOnCall && crosspoints.some((call) =>
        call.destination === port && call.role === "call" && open(call, false),
      );
    }
  };
  const ids = new Set(crosspoints.filter((point) =>
    point.destination === conference.id && point.source !== station.id && open(point) &&
    live[point.source]?.connected &&
    // Standing microphones should not claim to be speaking during silence.
    (point.gate !== "always" || (levels[point.source] ?? 0) > 0.01),
  ).map((point) => point.source));
  return ports.filter((port) => ids.has(port.id)).map((port) => ({
    name: port.label,
    level: levels[port.id] ?? 0,
  }));
}
