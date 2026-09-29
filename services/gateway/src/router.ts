import { spawn, type ChildProcess } from "node:child_process";
import { createInterface } from "node:readline";
import { EventEmitter } from "node:events";
import type { Channel, Pack } from "@comms/protocol";

export interface RouterPackState {
  packId: string;
  keyed: Record<string, boolean>;
  micOff: boolean;
  pgmOn: Record<string, boolean>;
  volumes: Record<string, number>;
  masterVolume: number;
}

export type RouterEvent =
  | { event: "ready" }
  | { event: "answer"; sessionId: string; sdp: string }
  | { event: "rejected"; sessionId: string; detail: string }
  | { event: "connected"; sessionId: string; packId: string }
  | { event: "closed"; sessionId: string; packId: string; reason: string }
  | ({ event: "packState" } & RouterPackState)
  | { event: "levels"; levels: Record<string, number> };

/** Supervises the mix-router sidecar and speaks its line-JSON protocol. */
export class MixRouter extends EventEmitter {
  private child?: ChildProcess;
  private stopped = false;
  private pending = new Map<string, { resolve: (sdp: string) => void; reject: (error: Error) => void; timer: NodeJS.Timeout }>();
  ready = false;
  private lastConfig?: string;

  constructor(private readonly binary: string) {
    super();
  }

  start(): void {
    this.stopped = false;
    const child = spawn(this.binary, [], { stdio: ["pipe", "pipe", "inherit"] });
    this.child = child;
    child.on("error", (error) => {
      console.error(`mix-router failed to start (${this.binary}): ${error.message}`);
    });
    createInterface({ input: child.stdout! }).on("line", (line) => {
      let event: RouterEvent;
      try {
        event = JSON.parse(line) as RouterEvent;
      } catch {
        return;
      }
      this.handle(event);
    });
    child.on("exit", (code) => {
      this.ready = false;
      this.child = undefined;
      for (const [id, entry] of this.pending) {
        clearTimeout(entry.timer);
        entry.reject(new Error("mix-router exited"));
        this.pending.delete(id);
      }
      this.emit("exit");
      if (!this.stopped) {
        console.error(`mix-router exited (${code}); restarting`);
        setTimeout(() => this.start(), 1000);
      }
    });
  }

  stop(): void {
    this.stopped = true;
    this.child?.kill();
  }

  private handle(event: RouterEvent): void {
    if (event.event === "ready") {
      this.ready = true;
      if (this.lastConfig) this.write(this.lastConfig);
    }
    if (event.event === "answer" || event.event === "rejected") {
      const entry = this.pending.get(event.sessionId);
      if (entry) {
        clearTimeout(entry.timer);
        this.pending.delete(event.sessionId);
        if (event.event === "answer") entry.resolve(event.sdp);
        else entry.reject(new Error(event.detail));
      }
      return;
    }
    this.emit("event", event);
  }

  private write(line: string): void {
    this.child?.stdin?.write(line + "\n");
  }

  configure(channels: Channel[], packs: Pack[]): void {
    const line = JSON.stringify({
      cmd: "config",
      channels: channels.map(({ id, type, members }) => ({ id, type, members })),
      packs: packs.map(({ id, type, masterVolume, keys }) => ({
        id,
        type,
        masterVolume,
        keys: keys.map(({ channelId, volume, pgmListen }) => ({ channelId, volume, pgmListen })),
      })),
    });
    this.lastConfig = line;
    if (this.ready) this.write(line);
  }

  open(sessionId: string, packId: string, offer: string, candidateIp: string): Promise<string> {
    if (!this.ready) return Promise.reject(new Error("mixer is not running"));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(sessionId);
        reject(new Error("mixer did not answer"));
      }, 5000);
      this.pending.set(sessionId, { resolve, reject, timer });
      this.write(JSON.stringify({ cmd: "open", sessionId, packId, offer, candidateIp }));
    });
  }

  close(sessionId: string): void {
    this.write(JSON.stringify({ cmd: "close", sessionId }));
  }
}
