# new-comms

Web-based party-line / PGM intercom for a single site over local WiFi.
Spec: `docs/superpowers/specs/2026-09-29-new-comms-design.md`. Plan: `docs/superpowers/plans/2026-09-29-new-comms-rough-plan.md`. Mockups: `docs/design/mockups/`.

```
apps/talk/           phone client (React PWA)
apps/manager/        admin app (React)
services/gateway/    Node/Fastify: state, REST, SSE, WHEP signalling; drives mix-router over a local TCP control link
crates/mix-router/   Rust: str0m WebRTC termination, per-pack N-1 mixing, data-channel control
crates/comms-node/   Rust: bridges one channel of an audio interface into the system
packages/protocol/   protocol.schema.json (the authority), generated TS types, SSE delta logic, useServerState hook
```

## Try it

Needs Node 22+, Rust (see `rust-toolchain.toml`), and libopus (`brew install opus`).

```bash
npm install
npm run dev          # builds mix-router, then gateway + Talk + Manager with hot reload
npm run seed         # once, in a second terminal: a small demo show
```

`npm run dev` starts `mix-router`, the gateway and both apps as separate processes and prints the addresses. Open **Talk** on phones and **Manager** on a laptop.
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

It appears in Manager → Hardware. Pick its input and output there (pushed to the node over its data channel, applied without reconnecting) and put its pack on a
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

## Process layout

Nothing spawns anything else. `mix-router` listens on `127.0.0.1:7100` (`--control ADDR` or
`MIX_ROUTER_CONTROL`); the gateway connects to it (`MIX_ROUTER_ADDR`) and keeps retrying, so
start order does not matter. If the gateway restarts, audio keeps flowing and the router's
`sync` restores who is connected. If the router restarts, phones and nodes reconnect on
their own. To run the router on another box, point `MIX_ROUTER_ADDR` at it and bind it to a
reachable address.

## Protocol

`packages/protocol/schema/protocol.schema.json` is the authority. `npm run generate -w
@comms/protocol` writes `src/generated.ts` (checked by `npm run typecheck`). The gateway
validates every REST body and session request against the same schema. Snapshot plus
revision-gated deltas run over SSE; a gap forces a fresh snapshot.

## Where this differs from the spec

- **comms-node does not use `crates/audio-host-api`.** That trait boundary models capture
  only; the node also needs playback, so it uses cpal directly.
- Pack PINs are exactly four digits (the spec leaves the format open), stored in plain text
  in `state.json`, and checked by the gateway when a session opens and by a verify endpoint
  for the PIN pad. They never appear in `/state`.
- Master and per-key volume are applied in mix-router (one downstream track per pack).
- A pack has one live session. A second phone picking the same pack takes it over.

## Known limits

- Phones and nodes ping the router once a second; either side gives up after 3.5 to 4 s of
  silence (measured: killing the mixer is noticed on a phone in about 3.5 s, then it
  reconnects in under a second).
- No packet-loss concealment; an underrun is silence. The mixer buffers about 20 ms per peer.
- Someone heard on two channels you share is heard twice (the two contributions add).
- iOS Safari: audio starts inside the tap that picks the pack, and the screen is kept awake
  while on the keys screen. A backgrounded tab still loses audio and reconnects on return.
  Not yet tested on real iOS hardware.
- The Manager has no authentication (LAN trust, per the spec).
