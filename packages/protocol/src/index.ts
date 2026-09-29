// Shared contracts for gateway, Talk, Manager and comms-node.
// The types are generated from schema/protocol.schema.json (the authority); this file adds helpers.

import type { ChannelType, PackKey, ServerEvent, Snapshot } from "./generated.ts";

export * from "./generated.ts";

/**
 * A person's phone has room for this many buttons (keys on partyline and direct channels).
 * PGM channels are not buttons: they are listen-only mappings with no key and no level, and
 * a pack can have any number of them. Hardware nodes have no limit at all.
 */
export const MAX_BUTTONS = 6;

/** Trim range for a hardware node's input and output, in dB. */
export const TRIM_RANGE_DB = 24;

/** Default new key on a pack. */
export function defaultKey(channelId: string, type: ChannelType): PackKey {
  return {
    channelId,
    mode: "ptt",
    volume: type === "pgm" ? 100 : 80,
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

export * from './routing.ts';
export * from './migration.ts';
export * from './demo.ts';
export * from './showEvents.ts';

export * from './liveRouting.ts';
