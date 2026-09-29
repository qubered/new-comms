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

It appears in Manager → Hardware. You can also create a hardware pack there first (Packs → New pack → Hardware node); a node started with the same `--name` claims it and keeps its channel. Pick its input and output there (pushed to the node over its data channel, applied without reconnecting) and put its pack on a
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

Target: under 150 ms mic-to-ear on LAN WiFi. Three measurements, from the inside out:

- **Mixer alone** (`npm run smoke`, loopback): impulse in on one client, out of another,
  roughly 15 to 30 ms at p50 depending on machine load, including 10 ms Opus framing. The
  smoke test also reports the mixer's own time per 10 ms cycle (Manager footer shows it live).
- **Software round trip** (Talk menu → Latency test, or open `/#latency`): a quiet tone with a
  loud marker goes up as a pack's microphone, the mixer plays it straight back, and the page
  times the marker on a single sample-accurate audio clock. It covers Chrome's encoder, the
  network, mix-router and the browser's jitter buffer and decoder, and it needs no real
  microphone or speaker. Measured in Chrome on the same machine (so no WiFi): **83 to 103 ms
  round trip, about 50 ms one way, 20 of 20 markers heard.** Run it from a phone on WiFi to
  see the real network add its share.
- **Mic-to-ear, full**: needs hardware, so it is still a manual clap test. Two phones in a
  quiet room, both on the same partyline, A keyed. Put both close to a recorder, clap next
  to A, and read the offset between the clap and its echo from B in the waveform. Repeat
  about 20 times; note p50 and worst case. A real mic and speaker typically add 20 to 60 ms
  on top of the software figure.

Chrome stops sending during silence, and the mixer waits for two frames (20 ms) before it
starts playing a peer after a gap, so the first syllable after silence arrives slightly later
than steady-state speech. That is why the latency test keeps a carrier running.

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

## Buttons, PGM and hardware

- A person's pack has at most **6 buttons** (keys on partyline and direct channels). The
  gateway refuses a seventh, whichever way it is added, and the Manager shows "4 of 6".
- **PGM channels are not buttons.** They have no key, no level and no on/off: they play
  straight into the pack at full level, and a pack can have any number. On the phone they
  appear as "Also hearing: Program, Announce". (This replaced the earlier per-pack "can turn
  off" PGM setting; old `state.json` files are migrated on load.)
- A **hardware node has no limit** on channels. It has one input and one output circuit: its
  input is added to every channel it is on, and its output is the mix of all of them.
- Each node has an **input trim and output trim, -24 to +24 dB** (Manager → Packs or
  Hardware). They are applied in mix-router, so they take effect live with no node restart.

## Audio devices and listening with the screen locked

Menu → **Audio devices** picks the microphone and, in browsers that allow it (Chrome, Edge,
Firefox on desktop and Android; not Safari), the speaker. The choice is remembered per
browser. Switching microphone while connected swaps the track without reconnecting.

Listening does not depend on the microphone: if it is blocked, unplugged or suspended, the
phone still joins and plays the mix ("Listening only"; the Mic button says "No mic" and
retries when tapped). To keep listening with the screen locked the app:

- sends its heartbeat from a Web Worker, because browsers throttle page timers on a hidden
  tab; a hidden tab is given 15 to 20 s of silence before it is dropped instead of 4 s
- registers a media session (lock-screen controls; pause is ignored) and asks the platform
  for a play-and-record audio session where supported
- resumes playback if the OS pauses it, and re-acquires the microphone and reconnects if
  needed when the app returns to the foreground

**This is best effort, not a guarantee, and it has not been tested on a real phone.** Web
pages have no way to force the OS to keep them alive. Android Chrome generally keeps playing
audio with the screen off. iOS Safari usually keeps audio playing but suspends microphone
capture while locked, so you can hear but not talk until you unlock; installing the app to
the home screen helps. If a locked phone must be reliable for a whole show, the dependable
fix is a native app or keeping the screen on (the app already holds a screen wake lock).

## Known limits

- Phones and nodes ping the router once a second; a visible tab is dropped after 3.5 to 4 s
  of silence (measured: killing the mixer is noticed on a phone in about 3.5 s, then it
  reconnects in under a second).
- No packet-loss concealment; an underrun is silence. The mixer buffers about 20 ms per peer.
- Someone heard on two channels you share is heard twice (the two contributions add).
- A node on several channels hears the sum of each channel's mix, so a person on two of its
  channels is heard by the node twice.
- The Manager has no authentication (LAN trust, per the spec).
