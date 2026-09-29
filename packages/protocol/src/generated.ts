// Generated from schema/protocol.schema.json by scripts/generate.mjs. Do not edit.

/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "ChannelType".
 */
export type ChannelType = "partyline" | "direct" | "pgm";
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "PackType".
 */
export type PackType = "human" | "hardware";
/**
 * Exactly four digits.
 *
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "Pin".
 */
export type Pin = string;
/**
 * 0-100
 *
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "Volume".
 */
export type Volume = number;
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "KeyMode".
 */
export type KeyMode = "ptt" | "latch" | "auto";
/**
 * 0-100
 */
export type Volume1 = number;
/**
 * Gain in dB, -24 to +24.
 *
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "Trim".
 */
export type Trim = number;
/**
 * Server-sent events on GET /api/v1/events.
 *
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "ServerEvent".
 */
export type ServerEvent = SnapshotEvent | ConfigEvent | LiveEvent | LevelsEvent;
/**
 * Data-channel messages, peer -> mix-router. Reliable and ordered.
 *
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "PeerMessage".
 */
export type PeerMessage =
  KeyMessage | MicOffMessage | VolumeMessage | MasterVolumeMessage | LoopbackMessage | PingMessage;
/**
 * Data-channel messages, mix-router -> peer.
 *
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "PeerReply".
 */
export type PeerReply = PeerState | DeviceMessage | PongMessage;
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "PortType".
 */
export type PortType = "station" | "input" | "output" | "conference" | "group" | "ifb";
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "Function".
 */
export type Function =
  | {
      fn: "callToPort";
      to: string;
      level?: number;
    }
  | {
      fn: "callToConference";
      conf: string;
      level?: number;
    }
  | {
      fn: "callToGroup";
      group: string;
      level?: number;
    }
  | {
      fn: "callToIFB";
      ifb: string;
      level?: number;
    }
  | {
      fn: "listenToPort";
      from: string;
      level?: number;
    }
  | {
      fn: "routeAudio";
      from: string;
      to: string;
      level?: number;
    }
  | {
      fn: "reply";
      level?: number;
    };
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "TriggerRef".
 */
export type TriggerRef =
  | {
      kind: "key";
      key: number;
    }
  | {
      kind: "reply" | "vox" | "onCall";
    };
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "Trigger".
 */
export type Trigger =
  | {
      kind: "key";
      key: number;
      mode?: KeyMode;
      functions: Function[];
    }
  | {
      kind: "reply";
      mode?: KeyMode;
      functions: Function[];
    }
  | {
      kind: "always";
      functions: Function[];
    }
  | {
      kind: "vox";
      functions: Function[];
    }
  | {
      kind: "onCall";
      functions: Function[];
    };
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "Gate".
 */
export type Gate =
  | "always"
  | {
      port: string;
      trigger: TriggerRef;
    };
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "PortPeerMessage".
 */
export type PortPeerMessage =
  | {
      type: "key";
      key: number | "reply";
      on: boolean;
    }
  | {
      type: "volume";
      source: string;
      volume: Volume;
    }
  | MicOffMessage1
  | MasterVolumeMessage1
  | LoopbackMessage1
  | PingMessage1;
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "ShowEvent".
 */
export type ShowEvent =
  | {
      type: "snapshot";
      rev: number;
      name: string;
      ports: Port[];
      nodes: Node[];
      crosspoints: Crosspoint[];
      live: {
        [k: string]: PortLiveState;
      };
    }
  | {
      type: "config";
      rev: number;
      ports: Port[];
      nodes: Node[];
      crosspoints: Crosspoint[];
      name: string;
    }
  | {
      type: "live";
      rev: number;
      portId: string;
      live: PortLiveState;
    }
  | {
      type: "levels";
      levels: {
        [k: string]: number;
      };
      vox: {
        [k: string]: boolean;
      };
    };

/**
 * Authoritative contracts for gateway, Talk, Manager and comms-node. TypeScript types are generated from this file (npm run generate -w @comms/protocol).
 */
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "Channel".
 */
export interface Channel {
  id: string;
  /**
   * Key heading, shown large on the Talk key.
   */
  name: string;
  /**
   * Small line under the heading.
   */
  subText?: string;
  type: ChannelType;
  /**
   * Pack ids. Derived from pack keys by the gateway; exactly two for a direct line.
   */
  members: string[];
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "Pack".
 */
export interface Pack {
  id: string;
  name: string;
  type: PackType;
  pin?: Pin;
  masterVolume: Volume;
  /**
   * Ordered: this is the key layout on the phone.
   */
  keys: PackKey[];
  device?: HardwareDevice;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "PackKey".
 */
export interface PackKey {
  channelId: string;
  mode: KeyMode;
  volume: Volume1;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "HardwareDevice".
 */
export interface HardwareDevice {
  name: string;
  address: string;
  inputs: string[];
  outputs: string[];
  input?: string;
  output?: string;
  /**
   * Unix milliseconds.
   */
  lastSeen: number;
  inputTrim?: Trim;
  outputTrim?: Trim;
}
/**
 * What clients see: the PIN is replaced by a flag.
 *
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "PublicPack".
 */
export interface PublicPack {
  id: string;
  name: string;
  type: PackType;
  masterVolume: Volume;
  keys: PackKey[];
  device?: HardwareDevice;
  hasPin: boolean;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "PackLiveState".
 */
export interface PackLiveState {
  packId: string;
  connected: boolean;
  /**
   * e.g. "iPhone, Safari"; hardware: address.
   */
  client?: string;
  micOff: boolean;
  keyed: {
    [k: string]: boolean;
  };
  volumes: {
    [k: string]: Volume;
  };
  masterVolume: Volume;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "Snapshot".
 */
export interface Snapshot {
  rev: number;
  /**
   * Shown in the top bar of both apps, e.g. "Stage A".
   */
  name: string;
  channels: Channel[];
  packs: PublicPack[];
  live: {
    [k: string]: PackLiveState;
  };
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "SnapshotEvent".
 */
export interface SnapshotEvent {
  type: "snapshot";
  rev: number;
  name: string;
  channels: Channel[];
  packs: PublicPack[];
  live: {
    [k: string]: PackLiveState;
  };
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "ConfigEvent".
 */
export interface ConfigEvent {
  type: "config";
  rev: number;
  channels: Channel[];
  packs: PublicPack[];
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "LiveEvent".
 */
export interface LiveEvent {
  type: "live";
  rev: number;
  packId: string;
  live: PackLiveState;
}
/**
 * Not revision-gated: pack id -> mic level 0..1 for packs whose mic is open.
 *
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "LevelsEvent".
 */
export interface LevelsEvent {
  type: "levels";
  levels: {
    [k: string]: number;
  };
}
export interface KeyMessage {
  type: "key";
  channelId: string;
  on: boolean;
}
export interface MicOffMessage {
  type: "micOff";
  on: boolean;
}
export interface VolumeMessage {
  type: "volume";
  channelId: string;
  volume: Volume;
}
export interface MasterVolumeMessage {
  type: "masterVolume";
  volume: Volume;
}
/**
 * Test tool only: hear your own microphone back through the mixer, for round-trip latency measurement.
 */
export interface LoopbackMessage {
  type: "loopback";
  on: boolean;
}
/**
 * Heartbeat once a second; answered with a pong. Silence for a few seconds ends the session.
 */
export interface PingMessage {
  type: "ping";
  /**
   * True while the tab is in the background (locked screen): the router waits longer before giving up on it.
   */
  hidden?: boolean;
}
export interface PeerState {
  type: "state";
  keyed: {
    [k: string]: boolean;
  };
  micOff: boolean;
  volumes: {
    [k: string]: Volume;
  };
  masterVolume: Volume;
}
/**
 * Hardware nodes only: which interface input and output the Manager chose. Trims are applied in the mixer, so they do not appear here.
 */
export interface DeviceMessage {
  type: "device";
  input?: string | null;
  output?: string | null;
}
export interface PongMessage {
  type: "pong";
}
/**
 * Body of POST/PATCH /api/v1/packs. On PATCH every field is optional. pin "" removes the PIN.
 *
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "PackWrite".
 */
export interface PackWrite {
  name?: string;
  type?: PackType;
  pin?: Pin | "";
  masterVolume?: Volume;
  keys?: {
    channelId: string;
    mode?: KeyMode;
    volume?: Volume;
  }[];
  device?: {
    input?: string;
    output?: string;
    inputTrim?: Trim;
    outputTrim?: Trim;
  };
}
/**
 * Body of POST/PATCH /api/v1/channels. On PATCH every field is optional. subText "" clears it.
 *
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "ChannelWrite".
 */
export interface ChannelWrite {
  name?: string;
  subText?: string;
  type?: ChannelType;
  members?: string[];
}
/**
 * POST /api/v1/media/sessions (WHEP-style).
 *
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "MediaSessionRequest".
 */
export interface MediaSessionRequest {
  packId: string;
  offer: string;
  pin?: string;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "MediaSessionResponse".
 */
export interface MediaSessionResponse {
  sessionId: string;
  answer: string;
}
/**
 * POST /api/v1/nodes/register.
 *
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "NodeRegistration".
 */
export interface NodeRegistration {
  deviceName: string;
  availableInputs: string[];
  availableOutputs: string[];
  address: string;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "Vox".
 */
export interface Vox {
  threshold: number;
  attack: number;
  hang: number;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "StationSettings".
 */
export interface StationSettings {
  pin?: Pin;
  masterVolume: Volume;
  volumes: {
    [k: string]: Volume;
  };
  replyMode: KeyMode;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "PortHardware".
 */
export interface PortHardware {
  nodeId: string;
  channel: number;
  shortName?: string;
  trim: Trim;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "Port".
 */
export interface Port {
  id: string;
  name: string;
  label: string;
  alias?: string;
  subtitle?: string;
  type: PortType;
  hardware?: PortHardware;
  station?: StationSettings;
  vox?: Vox;
  group?: {
    members: string[];
  };
  ifb?: {
    program: string;
    destination: string;
    /**
     * null means cut program completely during an interrupt.
     */
    dim: number | null;
  };
  triggers: Trigger[];
  hasPin?: boolean;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "Crosspoint".
 */
export interface Crosspoint {
  source: string;
  destination: string;
  level: number;
  gate: Gate;
  owner: string;
  triggerIndex?: number;
  functionIndex?: number;
  role: "audio" | "call" | "interrupt" | "program" | "reply";
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "PortLiveState".
 */
export interface PortLiveState {
  portId: string;
  connected: boolean;
  client?: string;
  micOff: boolean;
  keys: {
    [k: string]: boolean;
  };
  voxOpen: boolean;
  incoming: string[];
  lastCaller?: string;
  volumes: {
    [k: string]: Volume;
  };
  masterVolume: Volume;
  audible: string[];
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "NodeChannel".
 */
export interface NodeChannel {
  channel: number;
  name: string;
  inUse: boolean;
  shortName?: string;
  trim: Trim;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "Node".
 */
export interface Node {
  id: string;
  name: string;
  address: string;
  lastSeen: number;
  inputs: NodeChannel[];
  outputs: NodeChannel[];
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "Show".
 */
export interface Show {
  version: 2;
  name: string;
  ports: Port[];
  nodes: Node[];
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "PortWrite".
 */
export interface PortWrite {
  name: string;
  label?: string;
  alias?: string;
  subtitle?: string;
  type: PortType;
  hardware?: PortHardware;
  station?: StationSettings;
  vox?: Vox;
  group?: {
    members: string[];
  };
  ifb?: {
    program: string;
    destination: string;
    /**
     * null means cut program completely during an interrupt.
     */
    dim: number | null;
  };
  triggers: Trigger[];
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "ShowSnapshot".
 */
export interface ShowSnapshot {
  rev: number;
  name: string;
  ports: Port[];
  nodes: Node[];
  crosspoints: Crosspoint[];
  live: {
    [k: string]: PortLiveState;
  };
}
export interface MicOffMessage1 {
  type: "micOff";
  on: boolean;
}
export interface MasterVolumeMessage1 {
  type: "masterVolume";
  volume: Volume;
}
/**
 * Test tool only: hear your own microphone back through the mixer, for round-trip latency measurement.
 */
export interface LoopbackMessage1 {
  type: "loopback";
  on: boolean;
}
/**
 * Heartbeat once a second; answered with a pong. Silence for a few seconds ends the session.
 */
export interface PingMessage1 {
  type: "ping";
  /**
   * True while the tab is in the background (locked screen): the router waits longer before giving up on it.
   */
  hidden?: boolean;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "PortSessionRequest".
 */
export interface PortSessionRequest {
  portId?: string;
  nodeId?: string;
  pin?: Pin;
  offer: string;
  client?: string;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "NodeWrite".
 */
export interface NodeWrite {
  name: string;
  inputs: NodeChannel[];
  outputs: NodeChannel[];
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "V2NodeRegistration".
 */
export interface V2NodeRegistration {
  nodeId: string;
  name: string;
  address: string;
  inputs: string[];
  outputs: string[];
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "PinCheck".
 */
export interface PinCheck {
  pin?: string;
}
