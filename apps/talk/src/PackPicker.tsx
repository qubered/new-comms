import type { Channel, PublicPack } from "@comms/protocol";
import { TopBar } from "./TopBar.tsx";

export function PackPicker({
  name,
  online,
  loaded,
  packs,
  channels,
  onPick,
}: {
  name: string;
  online: boolean;
  loaded: boolean;
  packs: PublicPack[];
  channels: Channel[];
  onPick(pack: PublicPack): void;
}) {
  const channelName = (id: string) => channels.find((channel) => channel.id === id)?.name ?? "";
  const people = packs.filter((pack) => pack.type === "human");
  const hardware = packs.filter((pack) => pack.type === "hardware");
  const status = !loaded ? "Connecting…" : online ? name : "Reconnecting…";
  return (
    <section className="screen on">
      <TopBar
        tone={online && loaded ? "" : "wait"}
        text={status}
        items={[
          { label: "Reload", onClick: () => location.reload() },
          { label: "Latency test", onClick: () => (location.hash = "#latency") },
        ]}
      />
      <div className="packrow">
        <span className="name">Choose your pack</span>
      </div>
      <div className="scroll">
        <div className="packs">
          {loaded && people.length === 0 && <div className="empty">No packs yet. Add one in Manager.</div>}
          {people.map((pack) => (
            <button key={pack.id} className="pack" onClick={() => onPick(pack)}>
              <div className="nm">{pack.name}</div>
              <div className="chs">{pack.keys.map((key) => channelName(key.channelId)).join(", ")}</div>
              {pack.hasPin && (
                <span className="pinmark">
                  <svg width="11" height="13" viewBox="0 0 12 14" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <rect x="1" y="6" width="10" height="7" rx="1.5" />
                    <path d="M3.5 6V4a2.5 2.5 0 0 1 5 0v2" />
                  </svg>
                  PIN
                </span>
              )}
            </button>
          ))}
          {hardware.length > 0 && <div className="sect">Hardware</div>}
          {hardware.map((pack) => (
            <div key={pack.id} className="pack hw">
              <div className="nm">{pack.name}</div>
              <div className="chs">{pack.keys.map((key) => channelName(key.channelId)).join(", ")}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
