import { useEffect, useState } from "react";
import { applyEvent, type ServerEvent, type Snapshot } from "./index.ts";

export interface ServerState {
  /** null until the first snapshot arrives. */
  state: Snapshot | null;
  /** True while the event stream is open. */
  online: boolean;
  /** Pack id -> mic level 0..1, for packs with an open mic. */
  levels: Record<string, number>;
}

/** Snapshot + revision-gated deltas over SSE. A gap forces a reconnect and a fresh snapshot. */
export function useServerState(base = "/api/v1"): ServerState {
  const [state, setState] = useState<Snapshot | null>(null);
  const [online, setOnline] = useState(false);
  const [levels, setLevels] = useState<Record<string, number>>({});

  useEffect(() => {
    let source: EventSource | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let current: Snapshot | null = null;
    let closed = false;

    const open = () => {
      source = new EventSource(`${base}/events`);
      source.onopen = () => setOnline(true);
      source.onerror = () => {
        setOnline(false);
        source?.close();
        if (!closed) retry = setTimeout(open, 1000);
      };
      source.onmessage = (message) => {
        const event = JSON.parse(message.data as string) as ServerEvent;
        if (event.type === "levels") return setLevels(event.levels);
        const next = applyEvent(current, event);
        if (next === "resync") {
          source?.close();
          current = null;
          retry = setTimeout(open, 0);
          return;
        }
        current = next;
        setState(next);
      };
    };
    open();
    return () => {
      closed = true;
      clearTimeout(retry);
      source?.close();
    };
  }, [base]);

  return { state, online, levels };
}
