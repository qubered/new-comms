# new-comms

Web-based party-line / PGM intercom for a single site over local WiFi.
Spec: `docs/superpowers/specs/2026-09-29-new-comms-design.md`. Plan: `docs/superpowers/plans/2026-09-29-new-comms-rough-plan.md`. Mockups: `docs/design/mockups/`.

```
apps/talk/           phone client (React PWA)
apps/manager/        admin app (React)
services/gateway/    Node/Fastify: state, REST, SSE, WHEP signalling, spawns mix-router
crates/mix-router/   Rust: str0m WebRTC termination, per-pack N-1 mixing, data-channel control
crates/comms-node/   Rust: bridges one channel of an audio interface into the system
packages/protocol/   shared types, SSE delta logic, useServerState hook
```

## Try it

Needs Node 22+, Rust (see `rust-toolchain.toml`), and libopus (`brew install opus`).

```bash
npm install
npm run dev          # builds mix-router, then gateway + Talk + Manager with hot reload
npm run seed         # once, in a second terminal: a small demo show
```

`npm run dev` prints the addresses. Open **Talk** on phones and **Manager** on a laptop.
The apps run over HTTPS with a self-signed certificate because browsers only allow the
microphone on secure pages. Accept the warning once per device.

Phones must be on the same network as the computer. If audio connects but is silent, the
computer's firewall is blocking UDP: allow `mix-router`, or pin the port with
`MIX_ROUTER_PORT=40000` and open it.

## Run a show

```bash
npm run show         # release build of everything, then the gateway serves both apps
```

- Talk: `https://<computer-ip>:8443`
- Manager: `https://<computer-ip>:8443/manager/`
- Hardware nodes use plain HTTP on `:8080`.

Config lives in `data/state.json` (channels, packs, volumes) and is safe to copy or edit
while the gateway is stopped. Set `COMMS_NAME="Stage A"` to change the name in the top bars.
`COMMS_MEDIA_IP` overrides the address phones send audio to (default: the address they
used to reach the gateway).

### Hardware node

```bash
cargo run --release -p comms-node -- --list                       # see devices
npm run node -- --gateway http://<computer-ip>:8080 --name "Stage rack" --device "Scarlett 18i20"
```

It appears in Manager → Hardware. Pick its input and output there and put its pack on a
channel: on a partyline or direct line it is always keyed; on a PGM channel it is the feed.
Devices must support 48 kHz.

## Tests

```bash
npm test                 # gateway unit tests + cargo tests
npm run smoke            # real mix-router, three WebRTC clients over loopback UDP:
                         # checks N-1 (no self-echo), passive listening, keyed-only
                         # contribution, and prints impulse latency through the mixer
```

## Latency

- **Mixer floor, measured** (`npm run smoke`, loopback): impulse in on one client, out of
  another, p50 about 20 ms (roughly 15 to 25 ms), including 10 ms Opus framing. Everything else
  is WiFi and the browser's audio stack.
- **Mic-to-ear, still to measure on real phones** (target under 150 ms). Procedure: two
  phones in a quiet room, both on the same partyline, A keyed. Put both phones close to a
  recorder, clap next to A, and read the offset between the clap and its echo from B in the
  waveform. Repeat about 20 times, note p50 and worst case.

## Decisions that differ from the spec

- The **gateway spawns mix-router** as a sidecar (the plan's stated starting point; spec §3
  said no component spawns another). Control is line-delimited JSON on stdio.
- **Protocol types are hand-written TypeScript** in `packages/protocol`, not generated from
  JSON Schema. Revision-gated snapshot + deltas over SSE are implemented as specified.
- **comms-node gets its input/output by polling** `GET /api/v1/state` every 2 s, not over a
  data channel. It restarts its audio when the Manager changes them.
- `crates/audio-host-api` is copied from a2-monitor but not used yet; comms-node uses cpal
  directly.
- Pack PINs are exactly four digits, stored in plain text in `state.json`, and checked by
  the gateway when a session opens (and by a verify endpoint for the PIN pad). They never
  appear in `/state`.
- Master and per-key volume are applied in mix-router (one downstream track per pack).
- A pack has one live session. A second phone picking the same pack takes it over.

## Known limits

- Phones ping the router once a second; either side gives up after 3.5 to 4 s of silence
  (measured: killing the mixer is noticed on the phone in about 3.5 s, then it reconnects in
  under a second). Hardware nodes have no data channel, so they still rely on ICE timeouts
  (several seconds).
- No packet-loss concealment; an underrun is silence. The mixer buffers about 20 ms per peer.
- Someone heard on two channels you share is heard twice (the two contributions add).
- iOS Safari: audio starts inside the tap that picks the pack, and the screen is kept awake
  while on the keys screen. A backgrounded tab still loses audio and reconnects on return.
  Not yet tested on real iOS hardware.
- The Manager has no authentication (LAN trust, per the spec).
