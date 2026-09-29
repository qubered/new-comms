import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Channel, PackKey, PackLiveState, PeerMessage, PeerState, PublicPack } from "@comms/protocol";
import { AudioDevices } from "./AudioDevices.tsx";
import { loadPrefs } from "./audioPrefs.ts";
import type { Intercom, Status } from "./intercom.ts";
import { TopBar } from "./TopBar.tsx";

const TAP_MS = 350;
const RECONCILE_MS = 400;
const noop = () => {};

interface Held {
  keyed: boolean;
  latched: boolean;
  at: number;
}

const BAR_FACTORS = [0.6, 0.9, 1, 0.8, 0.65];

function Bars({ level }: { level: number }) {
  return (
    <span className="bars">
      {BAR_FACTORS.map((factor, i) => (
        <i key={i} style={{ height: `${Math.round(20 + 80 * Math.min(1, level * 2.5 * factor))}%` }} />
      ))}
    </span>
  );
}

/** Sends at most every `ms`, always delivering the latest value. */
function useThrottled<T>(send: (value: T) => void, ms = 60) {
  const last = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  return useCallback(
    (value: T) => {
      clearTimeout(timer.current);
      const wait = last.current + ms - performance.now();
      if (wait <= 0) {
        last.current = performance.now();
        send(value);
      } else {
        timer.current = setTimeout(() => {
          last.current = performance.now();
          send(value);
        }, wait);
      }
    },
    [send, ms],
  );
}

export function TalkScreen({
  pack,
  packs,
  channels,
  live,
  levels,
  systemName,
  intercom,
  onLeave,
}: {
  pack: PublicPack;
  packs: PublicPack[];
  channels: Channel[];
  live: Record<string, PackLiveState>;
  levels: Record<string, number>;
  systemName: string;
  intercom: Intercom;
  onLeave(): void;
}) {
  const [status, setStatus] = useState<Status>(intercom.status);
  const [detail, setDetail] = useState(intercom.detail);
  const [peer, setPeer] = useState<PeerState | undefined>(intercom.lastState);
  const [held, setHeld] = useState<Record<string, Held>>({});
  const [micOff, setMicOff] = useState(false);
  const [levelsMode, setLevelsMode] = useState(false);
  const [volumes, setVolumes] = useState<Record<string, number>>(() =>
    Object.fromEntries(pack.keys.map((key) => [key.channelId, key.volume])),
  );
  const [master, setMaster] = useState(pack.masterVolume);
  const [micAvailable, setMicAvailable] = useState(intercom.micAvailable);
  const [audioOpen, setAudioOpen] = useState(false);
  const lastEdit = useRef(0);

  useEffect(() => {
    intercom.handlers = {
      onStatus: (next, why) => {
        setStatus(next);
        setDetail(why);
      },
      onState: setPeer,
      onMic: setMicAvailable,
    };
    setStatus(intercom.status);
    setDetail(intercom.detail);
    setPeer(intercom.lastState);
    setMicAvailable(intercom.micAvailable);
    intercom.setLabel(pack.name);
    return () => {
      intercom.handlers = { onStatus: noop, onState: noop };
    };
  }, [intercom, pack.name]);

  const connected = status === "connected";

  // Whatever the link does, a lost connection drops every key on this phone too.
  useEffect(() => {
    if (!connected) setHeld({});
  }, [connected]);

  // Take the server's word for volumes and the mic switch, unless the user is mid-edit.
  useEffect(() => {
    if (!peer) return;
    setMicOff(peer.micOff);
    if (performance.now() - lastEdit.current > 800) {
      setVolumes(peer.volumes);
      setMaster(peer.masterVolume);
    }
    // A key we think is hot but the server says is off (and not just pressed) is off.
    setHeld((current) => {
      let changed = false;
      const next = { ...current };
      for (const [id, key] of Object.entries(current)) {
        if (key.keyed && !peer.keyed[id] && performance.now() - key.at > RECONCILE_MS) {
          next[id] = { keyed: false, latched: false, at: performance.now() };
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [peer]);

  const send = useCallback((message: PeerMessage) => intercom.send(message), [intercom]);
  const sendVolume = useThrottled(useCallback((value: { channelId: string; volume: number }) => send({ type: "volume", ...value }), [send]));
  const sendMaster = useThrottled(useCallback((volume: number) => send({ type: "masterVolume", volume }), [send]));

  const setKey = useCallback(
    (channelId: string, keyed: boolean, latched = false) => {
      setHeld((current) => {
        if ((current[channelId]?.keyed ?? false) === keyed && (current[channelId]?.latched ?? false) === latched) return current;
        return { ...current, [channelId]: { keyed, latched, at: performance.now() } };
      });
      send({ type: "key", channelId, on: keyed });
    },
    [send],
  );

  const toggleMic = () => {
    if (!micAvailable) {
      // No microphone: try to get one, and if that fails show the device picker to say why.
      void intercom.acquireMic(loadPrefs().inputId).then((ok) => !ok && setAudioOpen(true));
      return;
    }
    const next = !micOff;
    setMicOff(next);
    intercom.setMicEnabled(!next);
    if (next) setHeld({});
    send({ type: "micOff", on: next });
  };

  const channelById = useMemo(() => new Map(channels.map((channel) => [channel.id, channel])), [channels]);
  const packName = (id: string) => packs.find((p) => p.id === id)?.name ?? "";

  /** Other packs currently audible on a channel, for the talker line on each key. */
  const talkers = (channel: Channel) =>
    channel.members
      .filter((id) => id !== pack.id)
      .map((id) => ({ id, pack: packs.find((p) => p.id === id), live: live[id] }))
      .filter(({ pack: other, live: state }) => {
        if (!other || !state?.connected) return false;
        if (other.type === "hardware") return channel.type !== "pgm" && (levels[other.id] ?? 0) > 0.04;
        return Boolean(state.keyed[channel.id]) && !state.micOff;
      });

  // A phone has six buttons. PGM channels are not buttons: they play straight in, at full level.
  const buttons = pack.keys.filter((key) => channelById.get(key.channelId)?.type !== "pgm");
  const feeds = pack.keys.map((key) => channelById.get(key.channelId)).filter((c): c is Channel => c?.type === "pgm");

  const hint = levelsMode
    ? "How loud each channel is for you"
    : !micAvailable && connected
      ? "Listening only. The microphone isn’t available."
      : micOff
        ? "Your mic is off"
        : "";
  const tone = status === "connected" ? "" : status === "reconnecting" ? "warn" : "wait";
  const text = status === "connected" ? systemName : status === "reconnecting" ? "Reconnecting…" : `Connecting to ${systemName}…`;

  if (status === "error") {
    return (
      <section className="screen on">
        <div className="err-screen">
          <b>Couldn’t join</b>
          <span>{detail}</span>
          <button className="btn-solid" onClick={onLeave}>
            Choose your pack
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="screen on">
      <div className={`app${connected ? "" : " offline"}${micOff || !micAvailable ? " micoff" : ""}${levelsMode ? " levels" : ""}`}>
        <TopBar
          tone={tone}
          text={text}
          title={pack.name}
          items={[
            { label: "Audio devices", onClick: () => setAudioOpen(true) },
            { label: "Switch pack", onClick: onLeave },
          ]}
        />
        <AudioDevices open={audioOpen} onClose={() => setAudioOpen(false)} intercom={intercom} micAvailable={micAvailable} />
        <div className="packrow">
          <span className="name">{pack.name}</span>
          <button
            className={`lvbtn${levelsMode ? " on" : ""}`}
            aria-pressed={levelsMode}
            onClick={() => setLevelsMode((on) => !on)}
          >
            {levelsMode ? "Done" : "Levels"}
          </button>
        </div>
        <div className={`banner${status === "reconnecting" ? " on" : ""}`}>Lost the connection. Keys are off until it comes back.</div>
        <div className="hint">{hint}</div>
        <div className="scroll">
          <div className="grid">
            {buttons.map((key) => {
              const channel = channelById.get(key.channelId);
              if (!channel) return null;
              return (
                <KeyTile
                  key={key.channelId}
                  keyConfig={key}
                  channel={channel}
                  heading={channel.type === "direct" ? packName(channel.members.find((id) => id !== pack.id) ?? "") || channel.name : channel.name}
                  held={held[key.channelId]}
                  ownLevel={levels[pack.id] ?? 0}
                  talkers={talkers(channel).map(({ id, pack: other }) => ({ name: other!.name, level: levels[id] ?? (live[id]?.keyed[channel.id] ? 0.1 : 0) }))}
                  volume={volumes[key.channelId] ?? key.volume}
                  enabled={connected && micAvailable && !micOff && !levelsMode}
                  onKey={(on, latched) => setKey(key.channelId, on, latched)}
                  onVolume={(volume) => {
                    lastEdit.current = performance.now();
                    setVolumes((current) => ({ ...current, [key.channelId]: volume }));
                    sendVolume({ channelId: key.channelId, volume });
                  }}
                />
              );
            })}
          </div>
          {feeds.length > 0 && !levelsMode && <div className="also">Also hearing: {feeds.map((c) => c.name).join(", ")}</div>}
        </div>
        <div className="dock">
          <button className={`mic${!micAvailable ? " nomic" : micOff ? " off" : ""}`} aria-pressed={micAvailable && micOff} onClick={toggleMic}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="3" width="6" height="11" rx="3" />
              <path d="M5 11a7 7 0 0 0 14 0M12 18v3M8 21h8" />
              {(micOff || !micAvailable) && <path d="M4 4l16 16" />}
            </svg>
            <span>{!micAvailable ? "No mic" : micOff ? "Mic off" : "Mic on"}</span>
          </button>
          <div className="master">
            <div className="row">
              <span>Volume</span>
              <b className="num">{Math.round(master)}</b>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={master}
              aria-label="Volume"
              style={{ "--v": `${master}%` } as React.CSSProperties}
              onChange={(event) => {
                const value = Number(event.target.value);
                lastEdit.current = performance.now();
                setMaster(value);
                sendMaster(value);
              }}
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function KeyTile({
  keyConfig,
  channel,
  heading,
  held,
  ownLevel,
  talkers,
  volume,
  enabled,
  onKey,
  onVolume,
}: {
  keyConfig: PackKey;
  channel: Channel;
  heading: string;
  held?: Held;
  ownLevel: number;
  talkers: { name: string; level: number }[];
  volume: number;
  enabled: boolean;
  onKey(on: boolean, latched?: boolean): void;
  onVolume(volume: number): void;
}) {
  const typeClass = channel.type === "partyline" ? "pl" : channel.type;
  const hot = Boolean(held?.keyed);
  const latched = hot && Boolean(held?.latched);

  // Gesture bookkeeping lives in refs so pointer events never see stale state.
  const down = useRef({ at: 0, handled: false });
  const live = useRef({ hot, latched });
  live.current = { hot, latched };

  const press = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!enabled) return;
    event.preventDefault();
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      /* not capturable */
    }
    down.current = { at: performance.now(), handled: false };
    const { mode } = keyConfig;
    if (mode === "ptt") onKey(true);
    else if (mode === "latch") {
      const next = !live.current.hot;
      onKey(next, next);
      down.current.handled = true;
    } else if (live.current.hot && live.current.latched) {
      onKey(false);
      down.current.handled = true;
    } else onKey(true);
  };
  const release = () => {
    if (!live.current.hot && keyConfig.mode !== "auto") return;
    if (keyConfig.mode === "ptt") return onKey(false);
    if (keyConfig.mode === "auto" && !down.current.handled) {
      down.current.handled = true;
      if (performance.now() - down.current.at < TAP_MS) onKey(true, true);
      else onKey(false);
    }
  };
  const cancel = () => {
    if (keyConfig.mode === "ptt" && live.current.hot) onKey(false);
  };
  const keyboard = (event: React.KeyboardEvent) => {
    if (event.key !== " " && event.key !== "Enter") return;
    event.preventDefault();
    if (event.type === "keydown" && !event.repeat) press({ preventDefault() {}, currentTarget: { setPointerCapture() {} }, pointerId: 0 } as unknown as React.PointerEvent<HTMLDivElement>);
    if (event.type === "keyup") release();
  };

  const classes = ["key", typeClass];
  if (hot) classes.push("hot");

  const who = talkers[0];
  return (
    <div
      className={classes.join(" ")}
      role="button"
      tabIndex={0}
      onPointerDown={press}
      onPointerUp={release}
      onPointerCancel={cancel}
      onLostPointerCapture={cancel}
      onContextMenu={(event) => event.preventDefault()}
      onKeyDown={keyboard}
      onKeyUp={keyboard}
    >
      <div className="cap">{heading}</div>
      <div className="full">{channel.subText ?? ""}</div>
      {!hot && who && (
        <div className="who">
          <Bars level={who.level} />
          <span>{talkers.length > 1 ? `${who.name} +${talkers.length - 1}` : who.name}</span>
        </div>
      )}
      {!hot && !who && <div className="who" />}
      <div className="state">
        <Bars level={ownLevel} />
        <span>{latched ? "Latched" : "Talking"}</span>
      </div>
      <div className="lvl">
        <div className="row">
          <span>Level</span>
          <b className="num">{Math.round(volume)}</b>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          value={volume}
          aria-label={`${heading} level`}
          style={{ "--v": `${volume}%` } as React.CSSProperties}
          onChange={(event) => onVolume(Number(event.target.value))}
        />
      </div>
    </div>
  );
}
