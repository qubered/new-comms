import { connect, type Socket } from "node:net";
import { createInterface } from "node:readline";
import { EventEmitter } from "node:events";
import type { Channel, Pack } from "@comms/protocol";

export interface RouterPackState {
  packId: string;
  keyed: Record<string, boolean>;
  micOff: boolean;
  volumes: Record<string, number>;
  masterVolume: number;
}

export type RouterEvent =
  | { event: "ready" }
  | { event: "sync"; sessions: { sessionId: string; packId: string }[] }
  | { event: "answer"; sessionId: string; sdp: string }
  | { event: "rejected"; sessionId: string; detail: string }
  | { event: "connected"; sessionId: string; packId: string }
  | { event: "closed"; sessionId: string; packId: string; reason: string }
  | ({ event: "packState" } & RouterPackState)
  | { event: "levels"; levels: Record<string, number> }
  | { event: "stats"; tickAvgUs: number; tickMaxUs: number; peers: number };

/**
 * The gateway's link to mix-router: line-delimited JSON over a local TCP connection.
 * mix-router runs on its own (possibly on another box); this reconnects until it is there,
 * and re-sends the config every time it comes back.
 */
export class MixRouter extends EventEmitter {
  private socket?: Socket;
  private stopped = false;
  private retry?: NodeJS.Timeout;
  private pending = new Map<string, { resolve: (sdp: string) => void; reject: (error: Error) => void; timer: NodeJS.Timeout }>();
  ready = false;
  private lastConfig?: string;
  private warned = false;

  constructor(private readonly address: string) {
    super();
  }

  start(): void {
    this.stopped = false;
    const [host, port] = this.address.split(/:(?=[^:]*$)/) as [string, string];
    const socket = connect({ host, port: Number(port) });
    this.socket = socket;
    socket.setNoDelay(true);
    socket.on("connect", () => {
      this.warned = false;
      console.log(`connected to mix-router at ${this.address}`);
      // Claim the control link: mix-router ignores connections that never send a valid command.
      socket.write(JSON.stringify({ cmd: "hello" }) + "\n");
    });
    const lines = createInterface({ input: socket });
    lines.on("error", () => {}); // socket errors are handled below; readline re-emits them
    lines.on("line", (line) => {
      let event: RouterEvent;
      try {
        event = JSON.parse(line) as RouterEvent;
      } catch {
        return;
      }
      this.handle(event);
    });
    socket.on("error", (error) => {
      if (!this.warned) console.error(`mix-router at ${this.address} is not reachable (${error.message}); retrying`);
      this.warned = true;
    });
    socket.on("close", () => {
      const wasReady = this.ready;
      this.ready = false;
      this.socket = undefined;
      for (const [id, entry] of this.pending) {
        clearTimeout(entry.timer);
        entry.reject(new Error("mix-router disconnected"));
        this.pending.delete(id);
      }
      if (wasReady) this.emit("exit");
      if (!this.stopped) this.retry = setTimeout(() => this.start(), 1000);
    });
  }

  stop(): void {
    this.stopped = true;
    clearTimeout(this.retry);
    this.socket?.destroy();
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
    this.socket?.write(line + "\n");
  }

  configure(channels: Channel[], packs: Pack[]): void {
    const line = JSON.stringify({
      cmd: "config",
      channels: channels.map(({ id, type, members }) => ({ id, type, members })),
      packs: packs.map(({ id, type, masterVolume, keys, device }) => ({
        id,
        type,
        masterVolume,
        device: device
          ? { input: device.input ?? null, output: device.output ?? null, inputTrim: device.inputTrim ?? 0, outputTrim: device.outputTrim ?? 0 }
          : undefined,
        keys: keys.map(({ channelId, volume }) => ({ channelId, volume })),
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
