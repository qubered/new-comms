import { useEffect, useState } from "react";
import { useServerState } from "@comms/protocol/react";
import { api } from "./api.ts";
import { Channels } from "./Channels.tsx";
import { Hardware } from "./Hardware.tsx";
import { Live } from "./Live.tsx";
import { Packs } from "./Packs.tsx";

type Tab = "live" | "packs" | "channels" | "hardware";

export function App() {
  const { state, online, levels } = useServerState();
  const [tab, setTab] = useState<Tab>("live");
  const [pack, setPack] = useState<string>();
  const [channel, setChannel] = useState<string>();
  const [error, setError] = useState<string>();
  const [health, setHealth] = useState<Awaited<ReturnType<typeof api.health>>>();

  useEffect(() => {
    const check = () => api.health().then(setHealth).catch(() => setHealth(undefined));
    check();
    const timer = setInterval(check, 5000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(undefined), 6000);
    return () => clearTimeout(timer);
  }, [error]);

  if (!state) {
    return (
      <main style={{ padding: 28 }}>
        <p className="muted">{online ? "Loading…" : "Can’t reach the gateway. Retrying…"}</p>
      </main>
    );
  }

  const { packs, channels, live } = state;
  const connected = packs.filter((p) => live[p.id]?.connected);
  const keyedCount = packs.reduce((n, p) => n + Object.values(live[p.id]?.keyed ?? {}).filter(Boolean).length, 0);
  const hardwareCount = packs.filter((p) => p.type === "hardware").length;

  const open = (target: { tab: Tab; packId?: string; channelId?: string }) => {
    if (target.packId) setPack(target.packId);
    if (target.channelId) setChannel(target.channelId);
    setTab(target.tab);
  };

  return (
    <div className="shell">
      <aside className="side">
        <div className="brand">
          <b>Manager</b>
          <span>{state.name}</span>
        </div>
        <nav className="nav">
          <button className={tab === "live" ? "on" : ""} onClick={() => setTab("live")}>
            Live {keyedCount > 0 && <span className="badge hot">{keyedCount}</span>}
          </button>
          <button className={tab === "packs" ? "on" : ""} onClick={() => setTab("packs")}>
            Packs <span className="dim">{packs.length}</span>
          </button>
          <button className={tab === "channels" ? "on" : ""} onClick={() => setTab("channels")}>
            Channels <span className="dim">{channels.length}</span>
          </button>
          <button className={tab === "hardware" ? "on" : ""} onClick={() => setTab("hardware")}>
            Hardware <span className="dim">{hardwareCount}</span>
          </button>
        </nav>
        <div className="gw">
          <div className="r">
            <span>Gateway</span>
            <span className="num">{online ? location.hostname : "Unreachable"}</span>
          </div>
          <div className="r">
            <span>Mixer</span>
            <span className="num">
              {health ? (health.mixer ? `OK${health.mixerStats ? `, ${(health.mixerStats.tickAvgUs / 1000).toFixed(2)} ms` : ""}` : "Down") : "Unknown"}
            </span>
          </div>
          <div className="r">
            <span>Online</span>
            <span className="num">
              {connected.length} / {packs.length}
            </span>
          </div>
        </div>
      </aside>
      <main>
        {!online && <div className="offline-note">Lost the connection to the gateway. Showing the last known state.</div>}
        {health && !health.mixer && <div className="err-banner">The mixer is not running. Nobody can talk until it is back.</div>}
        {error && <div className="err-banner">{error}</div>}
        {tab === "live" && <Live packs={packs} channels={channels} live={live} levels={levels} onOpen={open} />}
        {tab === "packs" && (
          <Packs packs={packs} channels={channels} live={live} systemName={state.name} selected={pack} onSelect={setPack} onError={setError} />
        )}
        {tab === "channels" && <Channels packs={packs} channels={channels} selected={channel} onSelect={setChannel} onError={setError} />}
        {tab === "hardware" && (
          <Hardware
            packs={packs}
            channels={channels}
            live={live}
            onError={setError}
            onOpen={(id) => {
              setPack(id);
              setTab("packs");
            }}
          />
        )}
      </main>
    </div>
  );
}
