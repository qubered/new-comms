import { useCallback, useEffect, useRef, useState } from "react";
import type {
  Port,
  Crosspoint,
  PortLiveState,
  PortPeerMessage,
  KeyMode,
} from "@comms/protocol";
import { AudioDevices } from "./AudioDevices.tsx";
import { loadPrefs } from "./audioPrefs.ts";
import type { Intercom, Status, StationPeerState } from "./intercom.ts";
import { TopBar } from "./TopBar.tsx";
import {
  alwaysListens,
  conferenceTalkers,
  keyOpensMic,
  heardSources,
  keyTarget,
  stationKeys,
} from "./stationView.ts";
const TAP_MS = 350;
interface Held {
  keyed: boolean;
  latched: boolean;
  at: number;
}
function Bars({ level }: { level: number }) {
  return (
    <span className="bars">
      {[0.6, 0.9, 1, 0.8, 0.65].map((factor, i) => (
        <i
          key={i}
          style={{
            height: `${Math.round(20 + 80 * Math.min(1, level * 2.5 * factor))}%`,
          }}
        />
      ))}
    </span>
  );
}
export function TalkScreen({
  pack,
  ports,
  crosspoints,
  live,
  levels,
  systemName,
  intercom,
  onLeave,
}: {
  pack: Port;
  ports: Port[];
  crosspoints: Crosspoint[];
  live: Record<string, PortLiveState>;
  levels: Record<string, number>;
  systemName: string;
  intercom: Intercom;
  onLeave(): void;
}) {
  const [status, setStatus] = useState<Status>(intercom.status);
  const [detail, setDetail] = useState(intercom.detail);
  const [peer, setPeer] = useState<StationPeerState | undefined>(
    intercom.lastState,
  );
  const [held, setHeld] = useState<Record<string, Held>>({});
  const [micOff, setMicOff] = useState(false);
  const [levelsMode, setLevelsMode] = useState(false);
  const [volumes, setVolumes] = useState(pack.station?.volumes ?? {});
  const [master, setMaster] = useState(pack.station?.masterVolume ?? 100);
  const [micAvailable, setMicAvailable] = useState(intercom.micAvailable);
  const [audioOpen, setAudioOpen] = useState(false);
  const lastEdit = useRef(0);
  const connected = status === "connected";
  const state = peer ?? live[pack.id];
  // A hidden or replaced screen must never leave an unattended microphone keyed.
  useEffect(() => () => intercom.releaseKeys(), [intercom]);
  useEffect(() => {
    intercom.handlers = {
      onStatus: (next, why) => {
        setStatus(next);
        setDetail(why);
      },
      onState: setPeer,
      onMic: setMicAvailable,
    };
    intercom.setLabel(pack.label);
    setStatus(intercom.status);
    setPeer(intercom.lastState);
    setMicAvailable(intercom.micAvailable);
    return () => {
      intercom.handlers = { onStatus() {}, onState() {} };
    };
  }, [intercom, pack.label]);
  useEffect(() => {
    if (!connected) {
      setHeld({});
      setPeer(undefined);
    }
  }, [connected]);
  useEffect(() => {
    if (!peer) return;
    setMicOff(peer.micOff);
    intercom.setMicEnabled(!peer.micOff);
    if (performance.now() - lastEdit.current > 800) {
      setVolumes(peer.volumes);
      setMaster(peer.masterVolume);
    }
    setHeld((current) =>
      Object.fromEntries(
        Object.entries(current).map(([id, key]) => [
          id,
          key.keyed && !peer.keys[id] && performance.now() - key.at > 400
            ? { keyed: false, latched: false, at: performance.now() }
            : key,
        ]),
      ),
    );
  }, [peer, intercom]);
  const send = useCallback(
    (message: PortPeerMessage) => intercom.send(message),
    [intercom],
  );
  const setKey = (key: number | "reply", on: boolean, latched = false) => {
    if (!send({ type: "key", key, on })) return;
    setHeld((current) => ({
      ...current,
      [key]: { keyed: on, latched, at: performance.now() },
    }));
  };
  const toggleMic = () => {
    if (!micAvailable) {
      void intercom
        .acquireMic(loadPrefs().inputId)
        .then((ok) => !ok && setAudioOpen(true));
      return;
    }
    const next = !micOff;
    setMicOff(next);
    intercom.setMicEnabled(!next);
    if (next) setHeld((current) => Object.fromEntries(
      Object.entries(current).filter(([id]) => {
        const trigger = pack.triggers.find((trigger) =>
          id === "reply" ? trigger.kind === "reply" : trigger.kind === "key" && trigger.key === Number(id),
        );
        return trigger && !keyOpensMic(pack, trigger);
      }),
    ));
    send({ type: "micOff", on: next });
  };
  const byId = (id: string) => ports.find((port) => port.id === id);
  const caller = state?.lastCaller ? byId(state.lastCaller) : undefined;
  const reply = pack.triggers.find((trigger) => trigger.kind === "reply");
  const replyAvailable =
    !!caller && caller.type !== "input" && caller.type !== "group";
  const incoming = (state?.incoming ?? []).map((id) => byId(id)?.label ?? id);
  const sources = heardSources(pack, ports, crosspoints, state?.audible);
  const feeds = alwaysListens(pack, ports);
  const hint = levelsMode
    ? "How loud each source is for you"
    : !micAvailable && connected
      ? "Listening only. The microphone isn’t available."
      : micOff
        ? "Your mic is off"
        : "";
  if (status === "error")
    return (
      <section className="screen on">
        <div className="err-screen">
          <b>Couldn’t join</b>
          <span>{detail}</span>
          <button className="btn-solid" onClick={onLeave}>
            Choose your station
          </button>
        </div>
      </section>
    );
  return (
    <section className="screen on">
      <div
        className={`app${connected ? "" : " offline"}${levelsMode ? " levels" : ""}`}
      >
        <TopBar
          tone={connected ? "" : "wait"}
          text={
            connected
              ? incoming.length
                ? `${incoming.join(", ")} calling`
                : systemName
              : status === "reconnecting"
                ? "Reconnecting…"
                : `Connecting to ${systemName}…`
          }
          title={pack.label}
          items={[
            { label: "Audio devices", onClick: () => setAudioOpen(true) },
            { label: "Switch station", onClick: onLeave },
          ]}
        />
        <AudioDevices
          open={audioOpen}
          onClose={() => setAudioOpen(false)}
          intercom={intercom}
          micAvailable={micAvailable}
        />
        <div className="packrow">
          <span className="name">{pack.label}</span>
          <button
            className={`lvbtn${levelsMode ? " on" : ""}`}
            aria-pressed={levelsMode}
            onClick={() => {
              if (!levelsMode) {
                intercom.releaseKeys();
                setHeld({});
              }
              setLevelsMode(!levelsMode);
            }}
          >
            {levelsMode ? "Done" : "Levels"}
          </button>
        </div>
        {status === "reconnecting" && (
          <div className="banner on">
            Lost the connection. Keys are off until it comes back.
          </div>
        )}
        <div className="hint">{hint}</div>
        <div className="scroll">
          <div className="grid">
            {levelsMode ? (
              sources.map((source) => (
                <div className="key" key={source.id}>
                  <div className="cap">{source.label}</div>
                  <div className="full">{source.subtitle}</div>
                  <div className="lvl">
                    <div className="row">
                      <span>Level</span>
                      <b>{Math.round(volumes[source.id] ?? 100)}</b>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={volumes[source.id] ?? 100}
                      aria-label={`${source.label} level`}
                      onChange={(event) => {
                        const volume = Number(event.target.value);
                        lastEdit.current = performance.now();
                        setVolumes((current) => ({
                          ...current,
                          [source.id]: volume,
                        }));
                        send({ type: "volume", source: source.id, volume });
                      }}
                    />
                  </div>
                </div>
              ))
            ) : (
              <>
                {stationKeys(pack).map((key) => {
                  const target = keyTarget(pack, key.key, ports);
                  const listenOnly = !keyOpensMic(pack, key);
                  const heard = target && state?.audible.includes(target.id);
                  return (
                    <KeyTile
                      key={key.key}
                      keyConfig={{ mode: key.mode ?? "ptt" }}
                      listenOnly={listenOnly}
                      subtitle={target?.subtitle ?? `Key ${key.key}`}
                      heading={target?.label ?? `Key ${key.key}`}
                      held={held[key.key]}
                      ownLevel={levels[pack.id] ?? 0}
                      talkers={
                        heard && target.type === "conference"
                          ? conferenceTalkers(pack, target, ports, crosspoints, live, levels)
                          : heard ? [
                              {
                                name: target.label,
                                level: levels[target.id] ?? 0,
                              },
                            ]
                          : []
                      }
                      volume={100}
                      enabled={
                        connected && (listenOnly || (micAvailable && !micOff))
                      }
                      onKey={(on, latched) => setKey(key.key, on, latched)}
                      onVolume={() => {}}
                    />
                  );
                })}
                {reply && (
                  <KeyTile
                    keyConfig={{ mode: pack.station?.replyMode ?? "ptt" }}
                    listenOnly={false}
                    heading="Reply"
                    subtitle={
                      replyAvailable ? caller.label : "No caller to reply to"
                    }
                    held={held.reply}
                    ownLevel={levels[pack.id] ?? 0}
                    talkers={[]}
                    volume={100}
                    enabled={
                      connected && micAvailable && !micOff && replyAvailable
                    }
                    onKey={(on, latched) => setKey("reply", on, latched)}
                    onVolume={() => {}}
                  />
                )}
              </>
            )}
            {levelsMode && !sources.length && (
              <div className="empty">No sources routed to this station.</div>
            )}
          </div>
          {!levelsMode && feeds.length > 0 && (
            <div className="also">
              Also hearing: {feeds.map((feed) => feed.label).join(", ")}
            </div>
          )}
        </div>
        <div className="dock">
          <button
            className={`mic${!micAvailable ? " nomic" : micOff ? " off" : ""}`}
            aria-pressed={micAvailable && micOff}
            onClick={toggleMic}
          >
            <span>
              {!micAvailable ? "No mic" : micOff ? "Mic off" : "Mic on"}
            </span>
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
                const volume = Number(event.target.value);
                lastEdit.current = performance.now();
                setMaster(volume);
                send({ type: "masterVolume", volume });
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
  listenOnly,
  subtitle,
  heading,
  held,
  ownLevel,
  talkers,
  volume,
  enabled,
  onKey,
  onVolume,
}: {
  keyConfig: { mode: KeyMode };
  listenOnly: boolean;
  subtitle?: string;
  heading: string;
  held?: Held;
  ownLevel: number;
  talkers: { name: string; level: number }[];
  volume: number;
  enabled: boolean;
  onKey(on: boolean, latched?: boolean): void;
  onVolume(volume: number): void;
}) {
  const typeClass = listenOnly ? "listen" : "pl";
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
    if (
      (keyConfig.mode === "ptt" ||
        (keyConfig.mode === "auto" && !down.current.handled)) &&
      live.current.hot
    )
      onKey(false);
  };
  const keyboard = (event: React.KeyboardEvent) => {
    if (event.key !== " " && event.key !== "Enter") return;
    event.preventDefault();
    if (event.type === "keydown" && !event.repeat)
      press({
        preventDefault() {},
        currentTarget: { setPointerCapture() {} },
        pointerId: 0,
      } as unknown as React.PointerEvent<HTMLDivElement>);
    if (event.type === "keyup") release();
  };

  const classes = ["key", typeClass];
  if (hot) classes.push(listenOnly ? "monitoring" : "hot");

  const who = talkers[0];
  return (
    <div
      className={classes.join(" ")}
      role="button"
      tabIndex={enabled ? 0 : -1}
      aria-disabled={!enabled}
      aria-pressed={hot}
      onPointerDown={press}
      onPointerUp={release}
      onPointerCancel={cancel}
      onLostPointerCapture={cancel}
      onBlur={cancel}
      onContextMenu={(event) => event.preventDefault()}
      onKeyDown={keyboard}
      onKeyUp={keyboard}
    >
      <div className="cap">{heading}</div>
      <div className="full">{subtitle ?? ""}</div>
      {!hot && who && (
        <div className="who">
          <Bars level={who.level} />
          <span>
            {talkers.length > 1
              ? `${who.name} +${talkers.length - 1}`
              : who.name}
          </span>
        </div>
      )}
      {!hot && !who && <div className="who" />}
      <div className="state">
        <Bars level={ownLevel} />
        <span>
          {listenOnly ? "Listening" : latched ? "Latched" : "Talking"}
        </span>
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
