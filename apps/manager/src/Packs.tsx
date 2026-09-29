import { useState } from "react";
import { MAX_BUTTONS } from "@comms/protocol";
import type { Channel, KeyMode, PackKey, PackLiveState, PublicPack } from "@comms/protocol";
import { api } from "./api.ts";
import {
  DraftInput,
  Head,
  MODE_LABEL,
  PhonePreview,
  Switch,
  TYPE_LABEL,
  TrimControl,
  buttonCount,
  defaultKeyFor,
  isButton,
  relativeTime,
  typeClass,
} from "./common.tsx";

export function Packs({
  packs,
  channels,
  live,
  systemName,
  selected,
  onSelect,
  onError,
}: {
  packs: PublicPack[];
  channels: Channel[];
  live: Record<string, PackLiveState>;
  systemName: string;
  selected?: string;
  onSelect(id: string | undefined): void;
  onError(message: string): void;
}) {
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const [newlyCreated, setNewlyCreated] = useState<string>();
  const pack = packs.find((p) => p.id === selected) ?? packs[0];
  const guard = <T,>(promise: Promise<T>) => promise.catch((error: Error) => onError(error.message));

  const item = (p: PublicPack) => (
    <button key={p.id} className={`item${p.id === pack?.id ? " on" : ""}`} onClick={() => onSelect(p.id)}>
      <span className={`dot${live[p.id]?.connected ? "" : " off"}`} />
      <div className="m">
        {p.name}
        <span className="s">
          {p.keys.map((key) => channels.find((c) => c.id === key.channelId)?.name).filter(Boolean).join(", ") || "No keys"}
        </span>
      </div>
      <span className="k num">{p.keys.length}</span>
    </button>
  );
  const match = (p: PublicPack) => p.name.toLowerCase().includes(search.toLowerCase());

  return (
    <section className="tab">
      <Head
        title="Packs"
        sub="One pack per person or hardware node. Give it keys, in the order they'll appear on the phone."
        action={
          <button
            className="btn primary"
            onClick={() =>
              void guard(
                api.createPack({ name: "New pack" }).then((created) => {
                  setNewlyCreated(created.id);
                  onSelect(created.id);
                }),
              )
            }
          >
            New pack
          </button>
        }
      />
      <div className="pane">
        <div className="list">
          <input placeholder="Search" aria-label="Search packs" value={search} onChange={(e) => setSearch(e.target.value)} />
          <div className="grp">People</div>
          {packs.filter((p) => p.type === "human" && match(p)).map(item)}
          <div className="grp">Hardware</div>
          {packs.filter((p) => p.type === "hardware" && match(p)).map(item)}
        </div>
        {pack ? (
          <Editor
            key={pack.id}
            pack={pack}
            packs={packs}
            channels={channels}
            state={live[pack.id]}
            systemName={systemName}
            focusName={newlyCreated === pack.id}
            adding={adding}
            setAdding={setAdding}
            guard={guard}
            onRemoved={() => onSelect(undefined)}
          />
        ) : (
          <div className="editor">
            <p className="empty">No packs yet. Use New pack to add one.</p>
          </div>
        )}
      </div>
    </section>
  );
}

function Editor({
  pack,
  packs,
  channels,
  state,
  systemName,
  focusName,
  adding,
  setAdding,
  guard,
  onRemoved,
}: {
  pack: PublicPack;
  packs: PublicPack[];
  channels: Channel[];
  state?: PackLiveState;
  systemName: string;
  focusName: boolean;
  adding: boolean;
  setAdding(value: boolean): void;
  guard<T>(promise: Promise<T>): Promise<T | void>;
  onRemoved(): void;
}) {
  const hardware = pack.type === "hardware";
  const online = Boolean(state?.connected);
  const assigned = pack.keys
    .map((key) => ({ key, channel: channels.find((c) => c.id === key.channelId) }))
    .filter((k): k is { key: PackKey; channel: Channel } => Boolean(k.channel));
  const available = channels.filter((c) => !pack.keys.some((key) => key.channelId === c.id));
  const saveKeys = (keys: PackKey[]) => guard(api.updatePack(pack.id, { keys }));
  const patchKey = (channelId: string, patch: Partial<PackKey>) =>
    saveKeys(pack.keys.map((key) => (key.channelId === channelId ? { ...key, ...patch } : key)));

  // A person's phone has six buttons; PGM mappings play straight in and are not buttons. A node has neither limit.
  const used = buttonCount(pack, channels);
  const full = !hardware && used >= MAX_BUTTONS;
  const groups: { title?: string; rows: typeof assigned }[] = hardware
    ? [{ rows: assigned }]
    : [
        { title: "Buttons", rows: assigned.filter(({ key }) => isButton(key, channels)) },
        { title: "Listening only (PGM)", rows: assigned.filter(({ key }) => !isButton(key, channels)) },
      ].filter((group) => group.rows.length > 0);
  /** Swap a row with its neighbour inside its own group. */
  const move = (rows: typeof assigned, index: number, by: number) => {
    const a = pack.keys.findIndex((key) => key.channelId === rows[index]!.key.channelId);
    const b = pack.keys.findIndex((key) => key.channelId === rows[index + by]!.key.channelId);
    const keys = [...pack.keys];
    [keys[a], keys[b]] = [keys[b]!, keys[a]!];
    void saveKeys(keys);
  };

  return (
    <div className="editor">
      <div className="ed-head">
        <div className="title">
          <DraftInput
            className="name-in"
            aria-label="Pack name"
            value={pack.name}
            autoFocus={focusName}
            onFocus={(event) => focusName && event.target.select()}
            onCommit={(name) => name.trim() && void guard(api.updatePack(pack.id, { name }))}
          />
        </div>
        <span className="status">
          <span className={`dot${online ? "" : " off"}`} />
          {online ? `Online${state?.client ? `, ${state.client}` : ""}${hardware && pack.device ? `, ${pack.device.address}` : ""}` : `Offline${hardware && pack.device ? `, last seen ${relativeTime(pack.device.lastSeen)}` : ""}`}
        </span>
        <div className="seg" role="group" aria-label="Type">
          {(["human", "hardware"] as const).map((type) => (
            <button
              key={type}
              className={pack.type === type ? "on" : ""}
              disabled={Boolean(pack.device) && pack.type !== type}
              title={pack.device && pack.type !== type ? "This pack belongs to a registered node" : undefined}
              onClick={() => pack.type !== type && void guard(api.updatePack(pack.id, { type }))}
            >
              {type === "human" ? "Person" : "Hardware node"}
            </button>
          ))}
        </div>
      </div>
      {hardware && !pack.device && (
        <div className="offline-note">
          Waiting for a node. Start comms-node with <b>--name "{pack.name}"</b> and it takes over this pack, keeping its channel.
        </div>
      )}

      {hardware ? (
        <section className="blk">
          <h3>Interface</h3>
          <div className="fields">
            <div className="field">
              <label>Device</label>
              <input className="in" value={pack.device?.name ?? ""} readOnly />
            </div>
            <div className="field">
              <label>Input</label>
              <DeviceSelect pack={pack} field="input" guard={guard} />
              <div className="help">What this node sends into its channel.</div>
            </div>
            <div className="field">
              <label>Output</label>
              <DeviceSelect pack={pack} field="output" guard={guard} />
              <div className="help">Where the channel mix comes out.</div>
            </div>
            <div className="field">
              <label>Input trim</label>
              <TrimControl
                label="Input trim"
                value={pack.device?.inputTrim}
                disabled={!pack.device}
                onCommit={(inputTrim) => void guard(api.updatePack(pack.id, { device: { inputTrim } }))}
              />
              <div className="help">Gain on what the node sends in, −24 to +24 dB.</div>
            </div>
            <div className="field">
              <label>Output trim</label>
              <TrimControl
                label="Output trim"
                value={pack.device?.outputTrim}
                disabled={!pack.device}
                onCommit={(outputTrim) => void guard(api.updatePack(pack.id, { device: { outputTrim } }))}
              />
              <div className="help">Gain on what the node is sent, −24 to +24 dB.</div>
            </div>
          </div>
        </section>
      ) : (
        <section className="blk">
          <h3>Picking the pack</h3>
          <div className="fields">
            <div className="field">
              <label>PIN</label>
              <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                <PinField pack={pack} guard={guard} />
              </div>
              <div className="help">Without one, anyone on the network can pick this pack.</div>
            </div>
            <div className="field">
              <label htmlFor="pk-master">Starting volume</label>
              <DraftInput
                id="pk-master"
                className="in num"
                style={{ width: 100 }}
                inputMode="numeric"
                value={String(Math.round(pack.masterVolume))}
                onCommit={(value) => void guard(api.updatePack(pack.id, { masterVolume: Number(value) || 0 }))}
              />
              <div className="help">They can change it. It's remembered per pack.</div>
            </div>
          </div>
        </section>
      )}

      <section className="blk">
        <h3>Keys</h3>
        <div className="keys-wrap">
          <div>
            {assigned.length ? (
              <div style={{ overflowX: "auto", display: "flex", flexDirection: "column", gap: 18 }}>
                {groups.map((group) => (
                  <table className="tbl" key={group.title ?? "all"}>
                    <thead>
                      <tr>
                        <th style={{ width: 28 }}>#</th>
                        <th>
                          {group.title ?? "Channel"}
                          {group.title === "Buttons" && (
                            <span className={`count${full ? " full" : ""}`}>
                              {"  "}
                              {used} of {MAX_BUTTONS}
                            </span>
                          )}
                        </th>
                        <th>{hardware ? "Role" : group.title === "Buttons" ? "Key" : ""}</th>
                        <th>{group.title === "Buttons" ? "Level" : ""}</th>
                        <th style={{ width: 96 }} />
                      </tr>
                    </thead>
                    <tbody>
                      {group.rows.map(({ key, channel }, i) => {
                        const feed = channel.type === "pgm";
                        return (
                          <tr key={key.channelId}>
                            <td className="dim num">{i + 1}</td>
                            <td className="chn">
                              <span className={`sw ${typeClass(channel.type)}`} />
                              {channel.name}
                              {channel.subText && <small>{channel.subText}</small>}
                            </td>
                            <td>
                              {hardware ? (
                                <span className={`cell${feed ? " src" : ""}`}>{feed ? "Feed" : "Always keyed"}</span>
                              ) : feed ? (
                                <span className="cell src">Listens</span>
                              ) : (
                                <select
                                  className="sel"
                                  aria-label={`${channel.name} key`}
                                  value={key.mode}
                                  onChange={(e) => void patchKey(key.channelId, { mode: e.target.value as KeyMode })}
                                >
                                  {(Object.keys(MODE_LABEL) as KeyMode[]).map((mode) => (
                                    <option key={mode} value={mode}>
                                      {MODE_LABEL[mode]}
                                    </option>
                                  ))}
                                </select>
                              )}
                            </td>
                            <td>
                              {hardware || feed ? (
                                <span className="dim">–</span>
                              ) : (
                                <DraftInput
                                  className="in num num-in"
                                  inputMode="numeric"
                                  aria-label={`${channel.name} level`}
                                  value={String(Math.round(key.volume))}
                                  onCommit={(value) => void patchKey(key.channelId, { volume: Math.min(100, Math.max(0, Number(value) || 0)) })}
                                />
                              )}
                            </td>
                            <td className="rowact">
                              <button aria-label="Move up" disabled={i === 0} onClick={() => move(group.rows, i, -1)}>
                                ↑
                              </button>
                              <button aria-label="Move down" disabled={i === group.rows.length - 1} onClick={() => move(group.rows, i, 1)}>
                                ↓
                              </button>
                              <button aria-label="Remove" onClick={() => void saveKeys(pack.keys.filter((k) => k.channelId !== key.channelId))}>
                                ×
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                ))}
              </div>
            ) : (
              <p className="empty">No keys yet. Add a channel and it appears on {hardware ? "this node" : "their phone"}.</p>
            )}
            <div className="addrow" style={{ marginTop: 12 }}>
              <button className="btn" disabled={!available.length} onClick={() => setAdding(!adding)}>
                Add channel
              </button>
              {adding && available.length > 0 && (
                <div className="addmenu">
                  {available.map((channel) => {
                    const blocked = full && channel.type !== "pgm";
                    return (
                      <button
                        key={channel.id}
                        disabled={blocked}
                        title={blocked ? `All ${MAX_BUTTONS} buttons are used. PGM channels are not limited.` : undefined}
                        style={blocked ? { opacity: 0.4 } : undefined}
                        onClick={() => {
                          setAdding(false);
                          void saveKeys([...pack.keys, defaultKeyFor(channel)]);
                        }}
                      >
                        <span className={`sw ${typeClass(channel.type)}`} />
                        {channel.name}
                        <span className="dim">
                          &nbsp;{TYPE_LABEL[channel.type]}
                          {channel.subText ? `, ${channel.subText}` : ""}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
              {available.length === 0 ? (
                <span className="dim">This pack has every channel.</span>
              ) : full ? (
                <span className="dim">All {MAX_BUTTONS} buttons are used. PGM channels can still be added.</span>
              ) : hardware ? (
                <span className="dim">A node can be on any number of channels.</span>
              ) : null}
            </div>
          </div>
          <PhonePreview pack={pack} packs={packs} channels={channels} keyed={state?.keyed ?? {}} systemName={systemName} />
        </div>
      </section>

      <div className="footer">
        <span className="dim">Changes save as you make them.</span>
        <span className="grow" />
        <button
          className="btn danger"
          onClick={() => {
            if (window.confirm(`Remove ${pack.name}? Anyone using it is disconnected.`)) void guard(api.deletePack(pack.id).then(onRemoved));
          }}
        >
          Remove pack
        </button>
      </div>
    </div>
  );
}

function PinField({ pack, guard }: { pack: PublicPack; guard<T>(p: Promise<T>): Promise<T | void> }) {
  const [entering, setEntering] = useState(false);
  const on = pack.hasPin || entering;
  return (
    <>
      <Switch
        on={on}
        label="Ask for a PIN"
        onClick={() => {
          if (pack.hasPin) void guard(api.updatePack(pack.id, { pin: "" }));
          else setEntering(!entering);
        }}
      />
      {on && (
        <DraftInput
          className="in num"
          style={{ width: 100 }}
          inputMode="numeric"
          maxLength={4}
          aria-label="PIN"
          placeholder={pack.hasPin ? "Set" : "4 digits"}
          value=""
          onCommit={(pin) => {
            if (/^\d{4}$/.test(pin)) void guard(api.updatePack(pack.id, { pin }).then(() => setEntering(false)));
          }}
        />
      )}
      {pack.hasPin && <span className="dim">PIN is set. Type four digits to change it.</span>}
    </>
  );
}

function DeviceSelect({ pack, field, guard }: { pack: PublicPack; field: "input" | "output"; guard<T>(p: Promise<T>): Promise<T | void> }) {
  const device = pack.device;
  const options = (field === "input" ? device?.inputs : device?.outputs) ?? [];
  return (
    <select
      className="sel"
      aria-label={field === "input" ? "Input" : "Output"}
      value={device?.[field] ?? ""}
      disabled={!device}
      onChange={(e) => void guard(api.updatePack(pack.id, { device: { [field]: e.target.value } }))}
    >
      {options.map((name) => (
        <option key={name}>{name}</option>
      ))}
      <option value="">None</option>
    </select>
  );
}
