# new-comms — Rough Plan

**Spec:** `docs/superpowers/specs/2026-09-29-new-comms-design.md`
**Mockups:** `docs/design/mockups/`
**Style:** rapid prototyping. Phases, not tasks. Each phase ends with something you can hold a phone up to.

## Repo shape

Mirror a2-monitor's layout so borrowed code drops in without renaming.

```
new-comms/
  apps/talk/            React + Vite PWA (phone client)
  apps/manager/         React + Vite SPA (admin)
  services/gateway/     Node/Fastify: state, REST, SSE, WHEP signaling, spawns mix-router
  crates/mix-router/    Rust: str0m WebRTC termination, N-1 mixing, data-channel control
  crates/comms-node/    Rust: cpal I/O + WebRTC client (hardware bridge)
  crates/audio-host-api/  copied from a2-monitor (cpal behind a trait)
  packages/protocol/    JSON Schema + generated TS types + delta helper
```

Borrow from `~/code/a2-monitor`, copy not depend: `crates/audio-host-api`,
the str0m session/ICE-lite/UDP demux code in
`services/audio-node/src/bin/pulse-media-worker/`, the stdio line-JSON
control pattern (`control.rs` + `media-worker.ts`), the WHEP-style
signaling routes, and `packages/protocol`'s schema→TS generation and SSE
snapshot+delta logic.

Store: a single JSON file on disk for channels/packs (read on boot, written
on change). No database for the MVP.

## Phases

### 0. Scaffold (half a day)

npm + Cargo workspaces, the folders above, `npm run dev` that starts
gateway + both apps, `cargo build` that builds both crates. Copy
`audio-host-api` in and make it compile. Nothing runs yet.

Done when: `npm run dev` serves two blank apps and the gateway answers
`GET /api/v1/health`.

### 1. Audio spike: two phones talking (the risk; do this first)

`mix-router` alone, with the smallest possible HTTP front (Rust or a
20-line Fastify file): `POST /sessions {offer}` → answer, one UDP socket,
ICE-lite, Opus 48 kHz / 10 ms. Every peer sends mic audio and one reliable
data channel. `mix-router` keeps `keyed[peer]` from `{type:"key", on}` and
sends each peer the sum of all *other* keyed peers. A throwaway
`spike.html` with one big hold-to-talk button.

Done when: two phones on the same WiFi can hold-to-talk to each other with
no echo, and a rough mic-to-ear number exists (clap test with a recorder,
p50 under 150 ms or we know why not).

Decisions this phase settles: str0m as-is vs. changes; mixing in the RTP
receive path vs. a 10 ms tick; whether Node or Rust terminates the WHEP
HTTP (leaning Rust for the spike, gateway proxies later).

### 2. Gateway + protocol

`services/gateway`: JSON-file store; REST CRUD for channels and packs
(ordered `keys`); `GET /state`, `GET /events` (SSE snapshot + revision
deltas); WHEP routes forwarding to `mix-router`; spawn `mix-router` and
push channel/pack membership over the control channel so it knows who
hears whom. `packages/protocol`: schemas for Channel, Pack, PackLiveState,
the data-channel messages, generated TS.

Done when: `curl` can create two packs on a partyline, the spike page
(pointed at the gateway) can join as a pack, and `/events` shows keyed
state changing.

### 3. Talk app

Build `apps/talk` to the mockup: pack picker (+PIN), keys grid with all
states, ptt/latch/auto logic, Levels mode, mic kill, master volume,
talker-on-key from SSE, connecting/reconnecting banner with latches
dropped, PWA manifest and screen wake lock.

Done when: the mockup's "things to try" list works on real phones against
the gateway.

### 4. Manager app

Build `apps/manager` to the mockup: Live (read-only matrix, Needs
attention, Talking now), Packs (build-up keys, order, phone preview),
Channels, Hardware. Edits go through REST and show up on phones live.

Done when: you can set up a small show from scratch in the Manager and the
phones follow.

### 5. comms-node

`crates/comms-node`: cpal capture/playback on chosen input/output, WebRTC
client to the gateway (str0m in client mode, or a minimal alternative if
that fights us), `POST /nodes/register`, permanently keyed / feed. Appears
in Manager → Hardware.

Done when: an audio interface on a Pi or a second Mac bridges a channel
both ways and a pgm feed plays on phones.

### 6. Harden

Reconnect drills (WiFi off/on, sleep/wake, tab background), iOS Safari
audio-session quirks, latency measured properly and written down, a
`README` with how to run a show.

## Order of operations for the first sessions

1. Phase 0, then straight into Phase 1. Do not touch React until two phones
   talk.
2. Phase 2 and 3 can interleave once the audio path is proven.
3. Manager (4) and comms-node (5) can go in either order; pick by what's
   more useful for the next real test.

## Things to decide by doing, not planning

- Whether `mix-router` runs as a sidecar process (spawned by the gateway,
  like a2-monitor) or the gateway just expects it running. Start with
  spawned.
- Whether Talk uses raw `RTCPeerConnection` or a tiny wrapper. Start raw.
- Whether per-key volume is applied in `mix-router` (server) or in the
  browser via Web Audio gain per… no: there is one downstream track per
  pack, so per-key volume **must** be server-side. Master volume can be
  client-side.
- Latency budget per hop; measure, don't estimate.
