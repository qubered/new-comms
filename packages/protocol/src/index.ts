// Shared contracts for gateway, Talk and Manager.
// Hand-written TS for the MVP (the spec's JSON-Schema generation is deferred).

export type ChannelType = "partyline" | "direct" | "pgm";
export type PackType = "human" | "hardware";
export type KeyMode = "ptt" | "latch" | "auto";
export type PgmListen = "always" | "toggle";

export interface Channel {
  id: string;
  name: string;
  subText?: string;
  type: ChannelType;
  /** Pack ids. Kept in step with each pack's `keys` by the gateway. */
  members: string[];
}

export interface PackKey {
  channelId: string;
  mode: KeyMode;
  pgmListen: PgmListen;
  /** 0-100 */
  volume: number;
}

export interface HardwareDevice {
  name: string;
  address: string;
  inputs: string[];
  outputs: string[];
  input?: string;
  output?: string;
  lastSeen: number;
}

export interface Pack {
  id: string;
  name: string;
  type: PackType;
  /** Stored on the gateway; never sent to clients. */
  pin?: string;
  /** 0-100 */
  masterVolume: number;
  keys: PackKey[];
  device?: HardwareDevice;
}

/** What clients see: the PIN itself is replaced by a flag. */
export type PublicPack = Omit<Pack, "pin"> & { hasPin: boolean };

export interface PackLiveState {
  packId: string;
  connected: boolean;
  client?: string;
  micOff: boolean;
  keyed: Record<string, boolean>;
  pgmOn: Record<string, boolean>;
  /** Per-key volumes and master, as the pack last set them. */
  volumes: Record<string, number>;
  masterVolume: number;
}

export interface Snapshot {
  rev: number;
  /** Shown in the top bar of both apps, e.g. "Stage A". */
  name: string;
  channels: Channel[];
  packs: PublicPack[];
  live: Record<string, PackLiveState>;
}

/** Server-sent events on GET /api/v1/events. */
export type ServerEvent =
  | ({ type: "snapshot" } & Snapshot)
  | { type: "config"; rev: number; channels: Channel[]; packs: PublicPack[] }
  | { type: "live"; rev: number; packId: string; live: PackLiveState }
  /** Not revision-gated: pack id -> mic level 0..1 for packs whose mic is open. */
  | { type: "levels"; levels: Record<string, number> };

/** Messages on a peer's data channel, phone -> mix-router. */
export type PeerMessage =
  | { type: "key"; channelId: string; on: boolean }
  | { type: "micOff"; on: boolean }
  | { type: "volume"; channelId: string; volume: number }
  | { type: "masterVolume"; volume: number }
  | { type: "pgmListen"; channelId: string; on: boolean }
  /** Heartbeat, once a second. The router answers `{ type: "pong" }`. */
  | { type: "ping" };

/** mix-router -> phone, on the same data channel. */
export interface PeerState {
  type: "state";
  keyed: Record<string, boolean>;
  micOff: boolean;
  pgmOn: Record<string, boolean>;
  volumes: Record<string, number>;
  masterVolume: number;
}

export interface MediaSessionRequest {
  packId: string;
  offer: string;
  pin?: string;
}
export interface MediaSessionResponse {
  sessionId: string;
  answer: string;
}

export interface NodeRegistration {
  deviceName: string;
  availableInputs: string[];
  availableOutputs: string[];
  address: string;
}

/** Default new key on a pack. */
export function defaultKey(channelId: string, type: ChannelType): PackKey {
  return {
    channelId,
    mode: type === "pgm" ? "ptt" : "ptt",
    pgmListen: "always",
    volume: 80,
  };
}

/** Applies a `config` event's contents onto a snapshot. */
export function applyEvent(state: Snapshot | null, event: ServerEvent): Snapshot | null | "resync" {
  if (event.type === "snapshot") {
    const { type: _type, ...snapshot } = event;
    return snapshot;
  }
  if (event.type === "levels") return state;
  if (!state) return "resync";
  if (event.rev !== state.rev + 1) return "resync";
  if (event.type === "config") {
    const live = { ...state.live };
    for (const id of Object.keys(live)) {
      if (!event.packs.some((pack) => pack.id === id)) delete live[id];
    }
    return { ...state, rev: event.rev, channels: event.channels, packs: event.packs, live };
  }
  return { ...state, rev: event.rev, live: { ...state.live, [event.packId]: event.live } };
}
