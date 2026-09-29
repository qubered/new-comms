import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import type { Channel, Pack, PackKey } from "@comms/protocol";
import { defaultKey } from "@comms/protocol";

export interface StoredConfig {
  channels: Channel[];
  packs: Pack[];
}

/** channel.members is derived from pack.keys, which is the source of truth. */
export function reconcile(config: StoredConfig): void {
  const ids = new Set(config.channels.map((channel) => channel.id));
  for (const pack of config.packs) {
    const seen = new Set<string>();
    pack.keys = pack.keys.filter((key) => {
      if (!ids.has(key.channelId) || seen.has(key.channelId)) return false;
      seen.add(key.channelId);
      return true;
    });
  }
  for (const channel of config.channels) {
    channel.members = config.packs
      .filter((pack) => pack.keys.some((key) => key.channelId === channel.id))
      .map((pack) => pack.id);
  }
}

export function normaliseKey(raw: Partial<PackKey> & { channelId: string }, channel?: Channel): PackKey {
  const base = defaultKey(raw.channelId, channel?.type ?? "partyline");
  return {
    channelId: raw.channelId,
    mode: raw.mode === "latch" || raw.mode === "auto" || raw.mode === "ptt" ? raw.mode : base.mode,
    pgmListen: raw.pgmListen === "toggle" ? "toggle" : "always",
    volume: clamp(raw.volume ?? base.volume),
  };
}

export const clamp = (value: number) => Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0));

export class Store {
  config: StoredConfig = { channels: [], packs: [] };
  private timer?: NodeJS.Timeout;

  constructor(private readonly path: string) {
    if (existsSync(path)) {
      this.config = JSON.parse(readFileSync(path, "utf8")) as StoredConfig;
      reconcile(this.config);
    }
  }

  /** Debounced atomic write. */
  save(): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), 300);
  }

  flush(): void {
    clearTimeout(this.timer);
    mkdirSync(dirname(this.path), { recursive: true });
    const tmp = `${this.path}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.config, null, 2));
    renameSync(tmp, this.path);
  }
}
