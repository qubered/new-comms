import type { Channel, PackLiveState, PublicPack } from "@comms/protocol";
import { api } from "./api.ts";
import { Head, TrimControl, relativeTime, typeClass } from "./common.tsx";

export function Hardware({
  packs,
  channels,
  live,
  onOpen,
  onError,
}: {
  packs: PublicPack[];
  channels: Channel[];
  live: Record<string, PackLiveState>;
  onOpen(packId: string): void;
  onError(message: string): void;
}) {
  const nodes = packs.filter((p) => p.type === "hardware");
  const set = (pack: PublicPack, field: "input" | "output", value: string) =>
    api.updatePack(pack.id, { device: { [field]: value } }).catch((error: Error) => onError(error.message));

  return (
    <section className="tab">
      <Head title="Hardware" sub="Boxes that bridge a physical circuit into a channel. Point a node at this gateway and it shows up here as a pack." />
      <div className="cards">
        {nodes.map((pack) => {
          const online = Boolean(live[pack.id]?.connected);
          const mapped = pack.keys.map((key) => channels.find((c) => c.id === key.channelId)).filter((c): c is Channel => Boolean(c));
          const select = (field: "input" | "output") => (
            <select className="sel" aria-label={field === "input" ? "Input" : "Output"} value={pack.device?.[field] ?? ""} onChange={(e) => void set(pack, field, e.target.value)}>
              {((field === "input" ? pack.device?.inputs : pack.device?.outputs) ?? []).map((name) => (
                <option key={name}>{name}</option>
              ))}
              <option value="">None</option>
            </select>
          );
          return (
            <div className="card" key={pack.id}>
              <div className="ch">
                <b>{pack.name}</b>
                <span className="status">
                  <span className={`dot${online ? "" : " off"}`} />
                  {online ? "Online" : pack.device ? `Offline, last seen ${relativeTime(pack.device.lastSeen)}` : "Waiting for a node"}
                </span>
              </div>
              <div className="kv">
                <span>Device</span>
                <span>{pack.device?.name ?? "–"}</span>
                <span>Address</span>
                <span className="num">{pack.device?.address ?? "–"}</span>
                <span>Input</span>
                {select("input")}
                <span>Output</span>
                {select("output")}
                <span>Input trim</span>
                <TrimControl
                  label="Input trim"
                  value={pack.device?.inputTrim}
                  disabled={!pack.device}
                  onCommit={(inputTrim) => void api.updatePack(pack.id, { device: { inputTrim } }).catch((error: Error) => onError(error.message))}
                />
                <span>Output trim</span>
                <TrimControl
                  label="Output trim"
                  value={pack.device?.outputTrim}
                  disabled={!pack.device}
                  onCommit={(outputTrim) => void api.updatePack(pack.id, { device: { outputTrim } }).catch((error: Error) => onError(error.message))}
                />
                <span>Channels</span>
                <div>
                  {mapped.length ? (
                    mapped.map((channel) => (
                      <div key={channel.id}>
                        <i className={`sw ${typeClass(channel.type)}`} />
                        {channel.name} <i className="dim" style={{ fontStyle: "normal" }}>{channel.type === "pgm" ? "feed" : "always keyed"}</i>
                      </div>
                    ))
                  ) : (
                    <i className="dim" style={{ fontStyle: "normal" }}>Not assigned</i>
                  )}
                </div>
              </div>
              <div>
                <button className="btn" onClick={() => onOpen(pack.id)}>
                  Open pack
                </button>
              </div>
            </div>
          );
        })}
        <div className="card" style={{ borderStyle: "dashed", justifyContent: "center", color: "var(--fg-3)", fontSize: 13.5 }}>
          Nothing to pair. A node given this gateway's address registers itself and appears here.
        </div>
      </div>
    </section>
  );
}
