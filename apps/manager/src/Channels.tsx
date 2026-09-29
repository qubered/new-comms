import { useState } from "react";
import type { Channel, ChannelType, PublicPack } from "@comms/protocol";
import { api } from "./api.ts";
import { DraftInput, Head, TYPE_LABEL, typeClass } from "./common.tsx";

export function Channels({
  packs,
  channels,
  selected,
  onSelect,
  onError,
}: {
  packs: PublicPack[];
  channels: Channel[];
  selected?: string;
  onSelect(id: string | undefined): void;
  onError(message: string): void;
}) {
  const [search, setSearch] = useState("");
  const [fresh, setFresh] = useState<string>();
  const channel = channels.find((c) => c.id === selected) ?? channels[0];
  const guard = <T,>(promise: Promise<T>) => promise.catch((error: Error) => onError(error.message));

  return (
    <section className="tab">
      <Head
        title="Channels"
        sub="Partylines are open to everyone on them. Direct lines join two packs. PGM is a feed people only listen to."
        action={
          <button
            className="btn primary"
            onClick={() =>
              void guard(
                api.createChannel({ name: "New channel", type: "partyline" }).then((created) => {
                  setFresh(created.id);
                  onSelect(created.id);
                }),
              )
            }
          >
            New channel
          </button>
        }
      />
      <div className="pane">
        <div className="list">
          <input placeholder="Search" aria-label="Search channels" value={search} onChange={(e) => setSearch(e.target.value)} />
          {channels
            .filter((c) => c.name.toLowerCase().includes(search.toLowerCase()))
            .map((c) => (
              <button key={c.id} className={`item${c.id === channel?.id ? " on" : ""}`} onClick={() => onSelect(c.id)}>
                <span className={`sw ${typeClass(c.type)}`} style={{ margin: 0 }} />
                <div className="m">
                  {c.name}
                  <span className="s">
                    {TYPE_LABEL[c.type]}
                    {c.subText ? `, ${c.subText}` : ""}
                  </span>
                </div>
                <span className="k num">{c.members.length}</span>
              </button>
            ))}
        </div>
        {channel ? (
          <Editor key={channel.id} channel={channel} packs={packs} focusName={fresh === channel.id} guard={guard} onRemoved={() => onSelect(undefined)} />
        ) : (
          <div className="editor">
            <p className="empty">No channels yet. Use New channel to add one.</p>
          </div>
        )}
      </div>
    </section>
  );
}

function Editor({
  channel,
  packs,
  focusName,
  guard,
  onRemoved,
}: {
  channel: Channel;
  packs: PublicPack[];
  focusName: boolean;
  guard<T>(p: Promise<T>): Promise<T | void>;
  onRemoved(): void;
}) {
  const members = channel.members.map((id) => packs.find((p) => p.id === id)).filter((p): p is PublicPack => Boolean(p));
  const direct = channel.type === "direct";
  const bad = direct && members.length !== 2;
  const feeds = members.filter((p) => p.type === "hardware");
  const setMembers = (ids: string[]) => guard(api.updateChannel(channel.id, { members: ids }));
  const note = direct
    ? bad
      ? `A direct line needs exactly two packs. This one has ${members.length}.`
      : "Direct lines join exactly two packs."
    : channel.type === "pgm"
      ? feeds.length
        ? `Feed from ${feeds.map((p) => p.name).join(", ")}. Everyone else only listens.`
        : "No feed yet. Add a hardware node to give this channel audio."
      : "Everyone here hears everyone else who is keyed.";

  return (
    <div className="editor">
      <div className="ed-head">
        <div className="title">
          <DraftInput
            className="name-in"
            aria-label="Channel name"
            value={channel.name}
            autoFocus={focusName}
            onFocus={(event) => focusName && event.target.select()}
            onCommit={(name) => name.trim() && void guard(api.updateChannel(channel.id, { name }))}
          />
        </div>
        <div className="seg" role="group" aria-label="Type">
          {(Object.keys(TYPE_LABEL) as ChannelType[]).map((type) => (
            <button key={type} className={channel.type === type ? "on" : ""} onClick={() => void guard(api.updateChannel(channel.id, { type }))}>
              {TYPE_LABEL[type]}
            </button>
          ))}
        </div>
      </div>

      <section className="blk">
        <h3>On the key</h3>
        <div className="keys-wrap" style={{ gridTemplateColumns: "minmax(0,1fr) 170px" }}>
          <div className="fields">
            <div className="field">
              <label htmlFor="ch-sub">Sub text</label>
              <DraftInput id="ch-sub" value={channel.subText ?? ""} placeholder="Optional" onCommit={(subText) => void guard(api.updateChannel(channel.id, { subText }))} />
              <div className="help">
                The small line under the heading. Who's on it, what it's for.
                {direct ? " On a direct line each side’s heading is the other person’s name." : ""}
              </div>
            </div>
          </div>
          <div className="keyprev">
            <div className={`pkey ${typeClass(channel.type)}`} style={{ minHeight: 72 }}>
              <div className="n" style={{ fontSize: 14 }}>
                {channel.name}
              </div>
              <div className="s" style={{ fontSize: 11 }}>
                {channel.subText ?? ""}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="blk">
        <h3>{channel.type === "pgm" ? "Who hears it" : "Who’s on it"}</h3>
        <div className="chips">
          {members.map((p) => (
            <span key={p.id} className={`chipx${p.type === "hardware" ? " hw" : ""}`}>
              {p.name}
              {p.type === "hardware" && <span className="dim"> {channel.type === "pgm" ? "feed" : "node"}</span>}
              <button aria-label={`Remove ${p.name}`} onClick={() => void setMembers(channel.members.filter((id) => id !== p.id))}>
                ×
              </button>
            </span>
          ))}
          <select
            className="sel"
            style={{ width: 170, height: 32 }}
            aria-label="Add a pack"
            value=""
            onChange={(e) => e.target.value && void setMembers([...channel.members, e.target.value])}
          >
            <option value="">Add a pack</option>
            {packs
              .filter((p) => !channel.members.includes(p.id))
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.type === "hardware" ? " (hardware)" : ""}
                </option>
              ))}
          </select>
        </div>
        <div className="help" style={{ fontSize: 12.5, color: bad ? "var(--warn)" : "var(--fg-3)" }}>
          {note}
        </div>
      </section>

      <div className="footer">
        <span className="dim">Changes save as you make them.</span>
        <span className="grow" />
        <button
          className="btn danger"
          onClick={() => {
            if (window.confirm(`Remove ${channel.name}? It disappears from every pack.`)) void guard(api.deleteChannel(channel.id).then(onRemoved));
          }}
        >
          Remove channel
        </button>
      </div>
    </div>
  );
}
