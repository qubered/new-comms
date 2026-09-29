import type { Channel, PackLiveState, PublicPack } from "@comms/protocol";
import { api } from "./api.ts";
import { Head, relativeTime, typeClass } from "./common.tsx";

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
          const key = pack.keys[0];
          const channel = key && channels.find((c) => c.id === key.channelId);
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
                  {online ? "Online" : `Offline, last seen ${relativeTime(pack.device?.lastSeen)}`}
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
                <span>Channel</span>
                <span>
                  {channel ? (
                    <>
                      <span className={`sw ${typeClass(channel.type)}`} />
                      {channel.name} <span className="dim">{channel.type === "pgm" ? "feed" : "always keyed"}</span>
                    </>
                  ) : (
                    <span className="dim">Not assigned</span>
                  )}
                </span>
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
