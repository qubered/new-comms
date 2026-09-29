// Shared contracts for gateway, Talk, Manager and comms-node.
// The types are generated from schema/protocol.schema.json (the authority); this file adds helpers.

import type { ChannelType, PackKey, ServerEvent, Snapshot } from "./generated.ts";

export * from "./generated.ts";

/** Default new key on a pack. */
export function defaultKey(channelId: string, type: ChannelType): PackKey {
  return {
    channelId,
    mode: "ptt",
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
