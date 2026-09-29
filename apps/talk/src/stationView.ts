import { functionTarget, type Port, type Crosspoint } from "@comms/protocol";

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
