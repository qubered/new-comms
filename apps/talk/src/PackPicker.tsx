import { useState } from "react";
import type { Port } from "@comms/protocol";
import { AudioDevices } from "./AudioDevices.tsx";
import { TopBar } from "./TopBar.tsx";
import { keyTarget, stationKeys } from "./stationView.ts";

export function PackPicker({
  name,
  online,
  loaded,
  ports,
  onPick,
}: {
  name: string;
  online: boolean;
  loaded: boolean;
  ports: Port[];
  onPick(port: Port): void;
}) {
  const stations = ports.filter((port) => port.type === "station");
  const [audioOpen, setAudioOpen] = useState(false);
  return (
    <section className="screen on">
      <TopBar
        tone={online && loaded ? "" : "wait"}
        text={!loaded ? "Connecting…" : online ? name : "Reconnecting…"}
        items={[
          { label: "Audio devices", onClick: () => setAudioOpen(true) },
          { label: "Reload", onClick: () => location.reload() },
          {
            label: "Latency test",
            onClick: () => (location.hash = "#latency"),
          },
        ]}
      />
      <AudioDevices open={audioOpen} onClose={() => setAudioOpen(false)} />
      <div className="packrow">
        <span className="name">Choose your station</span>
      </div>
      <div className="scroll">
        <div className="packs">
          {loaded && stations.length === 0 && (
            <div className="empty">No stations yet. Add one in Manager.</div>
          )}
          {stations.map((station) => (
            <button
              key={station.id}
              className="pack"
              disabled={!online}
              onClick={() => onPick(station)}
            >
              <div className="nm">{station.label}</div>
              <div className="chs">
                {stationKeys(station)
                  .map(
                    (key) =>
                      keyTarget(station, key.key, ports)?.label ??
                      `Key ${key.key}`,
                  )
                  .join(", ")}
              </div>
              {station.hasPin && <span className="pinmark">PIN</span>}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
