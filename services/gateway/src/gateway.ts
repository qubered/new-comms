import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import type {
  Channel,
  ChannelType,
  HardwareDevice,
  ChannelWrite,
  NodeRegistration,
  PackWrite,
  Pack,
  PackKey,
  PackLiveState,
  PublicPack,
  ServerEvent,
  Snapshot,
} from "@comms/protocol";
import { MAX_BUTTONS } from "@comms/protocol";
import { HttpError } from "./errors.ts";
import { MixRouter, type RouterEvent } from "./router.ts";
import { validate } from "./validate.ts";
import { Store, clamp, normaliseKey, reconcile } from "./store.ts";

export { HttpError };

const emptyLive = (packId: string, masterVolume = 80): PackLiveState => ({
  packId,
  connected: false,
  micOff: false,
  keyed: {},
  volumes: {},
  masterVolume,
});

/** All durable and live state, plus the fan-out to SSE clients. */
export class Gateway extends EventEmitter {
  rev = 1;
  live = new Map<string, PackLiveState>();
  levels: Record<string, number> = {};
  /** Latest mixer health from mix-router: time per 10 ms cycle, in microseconds. */
  mixerStats?: { tickAvgUs: number; tickMaxUs: number; peers: number };
  /** session id -> pack id */
  sessions = new Map<string, string>();

  constructor(
    readonly store: Store,
    readonly router: MixRouter,
    readonly name = "Comms",
  ) {
    super();
    router.on("event", (event: RouterEvent) => this.onRouter(event));
    router.on("exit", () => this.allOffline());
    this.pushConfig();
  }

  get channels(): Channel[] {
    return this.store.config.channels;
  }
  get packs(): Pack[] {
    return this.store.config.packs;
  }

  publicPack = (pack: Pack): PublicPack => {
    const { pin, ...rest } = pack;
    return { ...rest, hasPin: Boolean(pin) };
  };

  snapshot(): Snapshot {
    return {
      rev: this.rev,
      name: this.name,
      channels: this.channels,
      packs: this.packs.map(this.publicPack),
      live: Object.fromEntries(
        this.packs.map((pack) => [pack.id, this.live.get(pack.id) ?? emptyLive(pack.id, pack.masterVolume)]),
      ),
    };
  }

  private broadcast(event: ServerEvent): void {
    this.emit("event", event);
  }

  private pushConfig(): void {
    reconcile(this.store.config);
    this.store.save();
    for (const id of [...this.live.keys()]) {
      if (!this.packs.some((pack) => pack.id === id)) this.live.delete(id);
    }
    this.router.configure(this.channels, this.packs);
    this.rev += 1;
    this.broadcast({ type: "config", rev: this.rev, channels: this.channels, packs: this.packs.map(this.publicPack) });
  }

  private setLive(next: PackLiveState): void {
    this.live.set(next.packId, next);
    this.rev += 1;
    this.broadcast({ type: "live", rev: this.rev, packId: next.packId, live: next });
  }

  private patchLive(packId: string, patch: Partial<PackLiveState>): void {
    const pack = this.packs.find((p) => p.id === packId);
    if (!pack) return;
    const current = this.live.get(packId) ?? emptyLive(packId, pack.masterVolume);
    this.setLive({ ...current, ...patch });
  }

  private allOffline(): void {
    for (const pack of this.packs) {
      const current = this.live.get(pack.id);
      if (current?.connected) this.setLive({ ...current, connected: false, keyed: {}, client: undefined });
    }
    this.sessions.clear();
    this.mixerStats = undefined;
  }

  private onRouter(event: RouterEvent): void {
    switch (event.event) {
      case "sync": {
        // The router kept running while we were away: rebuild who is connected.
        this.sessions.clear();
        for (const { sessionId, packId } of event.sessions) {
          this.sessions.set(sessionId, packId);
          this.patchLive(packId, { connected: true });
        }
        break;
      }
      case "connected":
        this.patchLive(event.packId, { connected: true });
        break;
      case "closed": {
        this.sessions.delete(event.sessionId);
        // A newer session may already own the pack; only clear if none remains.
        const stillHeld = [...this.sessions.values()].includes(event.packId);
        if (!stillHeld) {
          this.patchLive(event.packId, { connected: false, keyed: {}, client: undefined });
          const node = this.packs.find((p) => p.id === event.packId)?.device;
          if (node) {
            node.lastSeen = Date.now();
            this.pushConfig();
          }
        }
        break;
      }
      case "packState": {
        const pack = this.packs.find((p) => p.id === event.packId);
        if (!pack) break;
        // Volumes are persisted per pack; they ride the live state, not a config event.
        pack.masterVolume = event.masterVolume;
        for (const key of pack.keys) key.volume = event.volumes[key.channelId] ?? key.volume;
        this.store.save();
        this.patchLive(event.packId, {
          micOff: event.micOff,
          keyed: event.keyed,
          volumes: event.volumes,
          masterVolume: event.masterVolume,
        });
        break;
      }
      case "stats":
        this.mixerStats = { tickAvgUs: event.tickAvgUs, tickMaxUs: event.tickMaxUs, peers: event.peers };
        break;
      case "levels":
        this.levels = event.levels;
        this.broadcast({ type: "levels", levels: event.levels });
        break;
      default:
    }
  }

  // ---- media ----

  async openSession(packId: string, offer: string, pin: string | undefined, candidateIp: string, client: string) {
    const pack = this.packs.find((p) => p.id === packId);
    if (!pack) throw new HttpError(404, "no such pack");
    if (pack.type === "hardware" && !pack.device) throw new HttpError(409, "hardware pack has no node");
    if (pack.pin && pack.pin !== pin) throw new HttpError(403, "wrong PIN");
    const sessionId = randomUUID();
    this.sessions.set(sessionId, packId);
    try {
      const answer = await this.router.open(sessionId, packId, offer, candidateIp);
      this.patchLive(packId, { client });
      return { sessionId, answer };
    } catch (error) {
      this.sessions.delete(sessionId);
      throw new HttpError(502, (error as Error).message);
    }
  }

  closeSession(sessionId: string): void {
    if (this.sessions.has(sessionId)) this.router.close(sessionId);
  }

  // ---- config CRUD ----

  private findPack(id: string): Pack {
    const pack = this.packs.find((p) => p.id === id);
    if (!pack) throw new HttpError(404, "no such pack");
    return pack;
  }
  private findChannel(id: string): Channel {
    const channel = this.channels.find((c) => c.id === id);
    if (!channel) throw new HttpError(404, "no such channel");
    return channel;
  }

  private keysFrom(raw: unknown): PackKey[] {
    if (!Array.isArray(raw)) throw new HttpError(400, "keys must be an array");
    return raw.map((item) => {
      const key = item as Partial<PackKey> & { channelId?: string };
      if (!key.channelId) throw new HttpError(400, "each key needs a channelId");
      return normaliseKey(key as Partial<PackKey> & { channelId: string }, this.channels.find((c) => c.id === key.channelId));
    });
  }

  /** A person's phone has room for this many buttons (partyline and direct keys). */
  static readonly MAX_BUTTONS = MAX_BUTTONS;

  /** Buttons are keys on talkable channels. PGM mappings are not buttons: they have no key and no level. */
  private buttons(keys: PackKey[], channels = this.channels): number {
    return keys.filter((key) => channels.find((c) => c.id === key.channelId)?.type !== "pgm").length;
  }

  /** Hardware nodes may sit on any number of channels; people are limited to six buttons. */
  private assertButtons(pack: { type: string; name: string }, keys: PackKey[], channels = this.channels): void {
    if (pack.type === "human" && this.buttons(keys, channels) > MAX_BUTTONS) {
      throw new HttpError(409, `${pack.name || "A pack"} can have at most ${MAX_BUTTONS} buttons. PGM channels do not count.`);
    }
  }

  private checkPin(pin: unknown): string | undefined {
    if (pin === undefined || pin === null || pin === "") return undefined;
    if (typeof pin !== "string" || !/^\d{4}$/.test(pin)) throw new HttpError(400, "PIN must be four digits");
    return pin;
  }

  verifyPin(id: string, pin: unknown): void {
    const pack = this.findPack(id);
    if (pack.pin && pack.pin !== pin) throw new HttpError(403, "wrong PIN");
  }

  createPack(raw: unknown): Pack {
    const body = validate<PackWrite>("PackWrite", raw);
    const name = String(body.name ?? "").trim();
    if (!name) throw new HttpError(400, "name is required");
    const pack: Pack = {
      id: randomUUID(),
      name,
      type: body.type === "hardware" ? "hardware" : "human",
      masterVolume: clamp(Number(body.masterVolume ?? 80)),
      keys: body.keys ? this.keysFrom(body.keys) : [],
    };
    this.assertButtons(pack, pack.keys);
    const pin = this.checkPin(body.pin);
    if (pin && pack.type === "human") pack.pin = pin;
    this.packs.push(pack);
    this.pushConfig();
    return pack;
  }

  updatePack(id: string, raw: unknown): Pack {
    const body = validate<PackWrite>("PackWrite", raw);
    const pack = this.findPack(id);
    if (typeof body.name === "string") {
      if (!body.name.trim()) throw new HttpError(400, "name is required");
      pack.name = body.name.trim();
    }
    if (body.type !== undefined && body.type !== pack.type) {
      if (pack.device) throw new HttpError(409, "This pack belongs to a registered node; remove the node to change its type");
      if (body.type === "human") this.assertButtons({ type: "human", name: pack.name }, pack.keys);
      if (body.type === "hardware") delete pack.pin;
      pack.type = body.type;
    }
    if (body.masterVolume !== undefined) pack.masterVolume = clamp(Number(body.masterVolume));
    if ("pin" in body && pack.type === "human") {
      const pin = this.checkPin(body.pin);
      if (pin) pack.pin = pin;
      else delete pack.pin;
    }
    if (body.keys !== undefined) {
      const keys = this.keysFrom(body.keys);
      this.assertButtons(pack, keys);
      pack.keys = keys;
    }
    if (pack.device && body.device && typeof body.device === "object") {
      const { input, output, inputTrim, outputTrim } = body.device as Partial<HardwareDevice>;
      if (input !== undefined) pack.device.input = input;
      if (output !== undefined) pack.device.output = output;
      if (inputTrim !== undefined) pack.device.inputTrim = inputTrim;
      if (outputTrim !== undefined) pack.device.outputTrim = outputTrim;
    }
    this.pushConfig();
    return pack;
  }

  deletePack(id: string): void {
    this.findPack(id);
    this.store.config.packs = this.packs.filter((p) => p.id !== id);
    this.live.delete(id);
    for (const [session, pack] of this.sessions) if (pack === id) this.router.close(session);
    this.pushConfig();
  }

  createChannel(raw: unknown): Channel {
    const body = validate<ChannelWrite>("ChannelWrite", raw);
    const name = String(body.name ?? "").trim();
    if (!name) throw new HttpError(400, "name is required");
    const channel: Channel = {
      id: randomUUID(),
      name,
      type: this.channelType(body.type),
      members: [],
    };
    if (typeof body.subText === "string" && body.subText) channel.subText = body.subText;
    this.channels.push(channel);
    if (Array.isArray(body.members)) this.setMembers(channel, body.members.map(String));
    this.pushConfig();
    return channel;
  }

  private channelType(value: unknown): ChannelType {
    return value === "direct" || value === "pgm" ? value : "partyline";
  }

  /** Editing "who's on it" adds or removes a key on each affected pack. */
  private setMembers(channel: Channel, members: string[]): void {
    // Check everyone first so a refusal leaves nothing half-changed.
    for (const pack of this.packs) {
      const adding = members.includes(pack.id) && !pack.keys.some((key) => key.channelId === channel.id);
      if (adding) this.assertButtons(pack, [...pack.keys, normaliseKey({ channelId: channel.id }, channel)]);
    }
    for (const pack of this.packs) {
      const has = pack.keys.some((key) => key.channelId === channel.id);
      const want = members.includes(pack.id);
      if (want && !has) pack.keys.push(normaliseKey({ channelId: channel.id }, channel));
      if (!want && has) pack.keys = pack.keys.filter((key) => key.channelId !== channel.id);
    }
  }

  updateChannel(id: string, raw: unknown): Channel {
    const body = validate<ChannelWrite>("ChannelWrite", raw);
    const channel = this.findChannel(id);
    if (typeof body.name === "string") {
      if (!body.name.trim()) throw new HttpError(400, "name is required");
      channel.name = body.name.trim();
    }
    if ("subText" in body) {
      if (typeof body.subText === "string" && body.subText) channel.subText = body.subText;
      else delete channel.subText;
    }
    if (body.type !== undefined && this.channelType(body.type) !== channel.type) {
      // Turning a PGM into a talkable channel turns every mapping into a button: make sure they fit.
      const next = this.channels.map((c) => (c.id === channel.id ? { ...c, type: this.channelType(body.type) } : c));
      for (const pack of this.packs) if (pack.keys.some((key) => key.channelId === channel.id)) this.assertButtons(pack, pack.keys, next);
      channel.type = this.channelType(body.type);
    }
    if (Array.isArray(body.members)) this.setMembers(channel, body.members.map(String));
    this.pushConfig();
    return channel;
  }

  deleteChannel(id: string): void {
    this.findChannel(id);
    this.store.config.channels = this.channels.filter((c) => c.id !== id);
    this.pushConfig();
  }

  // ---- hardware nodes ----

  registerNode(raw: unknown): Pack {
    const body = validate<NodeRegistration>("NodeRegistration", raw);
    const { deviceName, availableInputs = [], availableOutputs = [], address } = body;
    if (!deviceName) throw new HttpError(400, "deviceName is required");
    let pack = this.packs.find((p) => p.type === "hardware" && p.device?.name === deviceName);
    // A hardware pack made ahead of time in the Manager is claimed by the node with the same name.
    pack ??= this.packs.find((p) => p.type === "hardware" && !p.device && p.name.toLowerCase() === deviceName.toLowerCase());
    const now = Date.now();
    if (!pack) {
      pack = { id: randomUUID(), name: deviceName, type: "hardware", masterVolume: 100, keys: [] };
      this.packs.push(pack);
    }
    const previous = pack.device;
    pack.device = {
      name: deviceName,
      address,
      inputs: availableInputs,
      outputs: availableOutputs,
      input: previous?.input ?? availableInputs[0],
      output: previous?.output ?? availableOutputs[0],
      lastSeen: now,
    };
    this.pushConfig();
    return pack;
  }
}
