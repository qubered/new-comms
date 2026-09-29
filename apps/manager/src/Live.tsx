import { useEffect, useMemo, useRef, useState } from "react";
import type { Channel, PackLiveState, PublicPack } from "@comms/protocol";
import { MODE_LABEL, TYPE_LABEL, typeClass, relativeTime } from "./common.tsx";

const AUDIBLE = 0.04;

interface Attention {
  title: string;
  detail: string;
  open: { tab: "packs" | "channels" | "hardware"; packId?: string; channelId?: string };
}

function elapsed(since: number, now: number): string {
  const seconds = Math.max(0, Math.floor((now - since) / 1000));
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

export function Live({
  packs,
  channels,
  live,
  levels,
  onOpen,
}: {
  packs: PublicPack[];
  channels: Channel[];
  live: Record<string, PackLiveState>;
  levels: Record<string, number>;
  onOpen(target: Attention["open"]): void;
}) {
  const people = packs.filter((pack) => pack.type === "human");
  const hardware = packs.filter((pack) => pack.type === "hardware");
  const online = packs.filter((pack) => live[pack.id]?.connected).length;

  // Track when each pack first appeared keyed on each channel, for "Talking now".
  const since = useRef(new Map<string, number>());
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const talking = useMemo(() => {
    const rows: { key: string; pack: PublicPack; channel: Channel; hardware: boolean }[] = [];
    for (const pack of packs) {
      const state = live[pack.id];
      if (!state?.connected) continue;
      for (const channel of channels) {
        if (channel.type === "pgm" || !pack.keys.some((key) => key.channelId === channel.id)) continue;
        const active =
          pack.type === "hardware" ? (levels[pack.id] ?? 0) > AUDIBLE : Boolean(state.keyed[channel.id]) && !state.micOff;
        if (active) rows.push({ key: `${pack.id}:${channel.id}`, pack, channel, hardware: pack.type === "hardware" });
      }
    }
    const active = new Set(rows.map((row) => row.key));
    for (const key of [...since.current.keys()]) if (!active.has(key)) since.current.delete(key);
    for (const row of rows) if (!since.current.has(row.key)) since.current.set(row.key, Date.now());
    return rows;
  }, [packs, channels, live, levels]);

  const attention: Attention[] = [];
  for (const pack of hardware) {
    if (!live[pack.id]?.connected) {
      const fed = pack.keys.map((key) => channels.find((c) => c.id === key.channelId)?.name).filter(Boolean).join(", ");
      attention.push({
        title: `${pack.name} is offline`,
        detail: `${pack.device ? `Last seen ${relativeTime(pack.device.lastSeen)}.` : "No node has claimed it yet."}${fed ? ` ${fed} has no audio from it.` : ""}`,
        open: { tab: "hardware" },
      });
    }
  }
  for (const pack of people) {
    if (pack.keys.length === 0) {
      attention.push({ title: `${pack.name} has no keys`, detail: "They can pick the pack but there is nothing on it.", open: { tab: "packs", packId: pack.id } });
    }
  }
  for (const channel of channels) {
    if (channel.type === "direct" && channel.members.length !== 2) {
      attention.push({
        title: `${channel.name} has ${channel.members.length} pack${channel.members.length === 1 ? "" : "s"}`,
        detail: "A direct line needs exactly two.",
        open: { tab: "channels", channelId: channel.id },
      });
    }
    if (channel.type === "pgm" && !channel.members.some((id) => packs.find((p) => p.id === id)?.type === "hardware")) {
      attention.push({ title: `${channel.name} has no feed`, detail: "Add a hardware node to give it audio.", open: { tab: "channels", channelId: channel.id } });
    }
  }

  const cell = (pack: PublicPack, channel: Channel) => {
    const key = pack.keys.find((k) => k.channelId === channel.id);
    if (!key) return <span className="cell none">·</span>;
    const state = live[pack.id];
    if (pack.type === "hardware") {
      if (channel.type === "pgm") return <span className="cell src">Feed</span>;
      return (state?.connected && (levels[pack.id] ?? 0) > AUDIBLE) ? <span className="cell on">Talking</span> : <span className="cell src">Always on</span>;
    }
    if (channel.type === "pgm") {
      const muted = key.pgmListen === "toggle" && state?.pgmOn[channel.id] === false;
      return <span className={`cell${muted ? " muted" : ""}`}>{muted ? "Off" : "Listen"}</span>;
    }
    const keyed = Boolean(state?.keyed[channel.id]) && !state?.micOff;
    return <span className={`cell${keyed ? " on" : ""}`}>{keyed ? "Talking" : MODE_LABEL[key.mode]}</span>;
  };

  const row = (pack: PublicPack) => {
    const state = live[pack.id];
    const isOn = Boolean(state?.connected);
    const meta = [pack.type === "hardware" ? "Hardware" : isOn ? state?.client : "", pack.hasPin ? "PIN" : "", isOn ? "" : "offline"].filter(Boolean).join(" · ");
    return (
      <tr key={pack.id} className={isOn ? "" : "offline"}>
        <th>
          <div className="pk">
            <span className={`dot${isOn ? "" : " off"}`} />
            <button onClick={() => onOpen({ tab: "packs", packId: pack.id })}>
              {pack.name}
              <small>{meta}</small>
            </button>
          </div>
        </th>
        {channels.map((channel) => (
          <td key={channel.id}>{cell(pack, channel)}</td>
        ))}
      </tr>
    );
  };

  return (
    <section className="tab">
      <div className="head">
        <div>
          <h1>Live</h1>
          <div className="sub">Packs down the side, channels across the top. A red cell is someone keyed right now. Click a pack name to open it.</div>
        </div>
      </div>
      <div className="summary">
        <b>
          {online} of {packs.length}
        </b>{" "}
        packs online. <b>{talking.length}</b> keyed.
      </div>
      <div className="live">
        <div>
          <div className="matrix-wrap">
            {packs.length === 0 || channels.length === 0 ? (
              <p className="empty" style={{ padding: 18 }}>
                Nothing to show yet. Add channels and packs, then give each pack some keys.
              </p>
            ) : (
              <table className="matrix">
                <thead>
                  <tr>
                    <th>Pack</th>
                    {channels.map((channel) => (
                      <th key={channel.id}>
                        <span className={`sw ${typeClass(channel.type)}`} />
                        {channel.name}
                        <span className="ty">{channel.subText || TYPE_LABEL[channel.type]}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {people.map(row)}
                  {hardware.length > 0 && (
                    <tr className="group">
                      <th>Hardware</th>
                      <td colSpan={channels.length} />
                    </tr>
                  )}
                  {hardware.map(row)}
                </tbody>
              </table>
            )}
          </div>
          <p className="legend">
            Hold, Tap and Tap/hold are how the key behaves for that pack. Feed is a hardware node supplying the channel. Struck out means the pack has muted that feed for themselves.
          </p>
        </div>
        <div className="rail">
          <div>
            <h2>
              Needs attention {attention.length > 0 && <span className="badge warn">{attention.length}</span>}
            </h2>
            <div className="attn">
              {attention.length === 0 && <div className="empty">Nothing right now.</div>}
              {attention.map((item, i) => (
                <div className="it" key={i}>
                  <span className="dot warn" />
                  <div>
                    {item.title}
                    <small>{item.detail}</small>
                    <button onClick={() => onOpen(item.open)}>Open</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div>
            <h2>Talking now</h2>
            <div className="talkers">
              {talking.length === 0 && <div className="empty">Nobody is keyed.</div>}
              {talking.map((row) => (
                <div className="talker" key={row.key}>
                  <div>
                    {row.pack.name}
                    <div className="c">{row.channel.name}</div>
                  </div>
                  <span className="t num">{elapsed(since.current.get(row.key) ?? now, now)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
