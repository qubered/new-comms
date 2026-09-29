# new-comms — Design Spec (MVP)

Status: **in progress** — checkpoint written mid-brainstorm at the user's request.
Sections marked `[TBD]` have not been designed yet and will be added before this
doc is considered final. Do not start implementation planning until all `[TBD]`
sections are resolved and the user has approved the complete document.

## 1. Purpose

A web-based party-line/PGM intercom system, in the spirit of RTS/Clear-Com/Riedel
Artist/Bolero, built on the architecture proven by `a2-monitor` ("Pulse"):
a real-time audio engine talking to physical hardware, a web backend, and
browser-based clients. Operators open a web page on a phone or laptop over
WiFi, pick their identity ("pack"), and talk on assigned comms channels using
PTT or latch. A separate manager app configures packs, channels, and hardware
patches, similar in spirit to a Riedel Artist configuration frame.

## 2. Scope for this spec

- **Single site only.** One comms-gateway serving one physical location.
  Multi-site linking (trunking multiple physical locations together) is an
  explicit, intentional non-goal of this spec — the protocol and channel model
  should not be *blocked* from a future multi-site design, but nothing here
  builds it.
- **Deployment**: runs on a local WiFi network. No cloud/internet dependency
  required for the MVP. Remote/VPN access is not designed here.
- **Trust model**: the LAN itself is the security boundary. No user accounts,
  no mandatory authentication anywhere in the system.
- MVP feature cut-list (what's explicitly deferred vs. included): **[TBD]** —
  next section to design.

## 3. Architecture overview

Three logical components, all peers of a central gateway over the network —
no component spawns another as a child process (this differs from
a2-monitor's local child-process model, because comms hardware may live on
entirely separate physical devices from the gateway):

```
                         ┌─────────────────────────────┐
                         │        comms-gateway         │
                         │        (Node/Fastify)        │
                         │                               │
                         │ - pack/channel/keying state   │
                         │ - REST control API (config)   │
                         │ - SSE state sync (rev+delta)  │
                         │ - WebRTC signaling (WHEP-style│
                         │   HTTP offer/answer, ICE-lite)│
                         └───────────────┬───────────────┘
                                          │ hands media termination to:
                                 ┌────────▼────────┐
                                 │   mix-router     │
                                 │ (Rust sidecar)   │
                                 │ - str0m WebRTC   │
                                 │   termination     │
                                 │ - per-pack N-1    │
                                 │   mixing          │
                                 │ - reliable data   │
                                 │   channel for     │
                                 │   keying/volume   │
                                 └────────┬─────────┘
                                          │ WebRTC/Opus (audio) +
                                          │ WebRTC data channel (control)
                    ┌─────────────────────┼─────────────────────┐
                    │                     │                     │
           ┌────────▼────────┐  ┌─────────▼────────┐  ┌─────────▼─────────┐
           │   Talk app       │  │   Talk app       │  │   comms-node       │
           │ (phone browser)  │  │ (phone browser)  │  │ (Rust daemon,      │
           │ mic/speaker via  │  │ mic/speaker via  │  │  headless, on a    │
           │ WebRTC media API │  │ WebRTC media API │  │  Pi/small box)     │
           │ = one "pack"     │  │ = one "pack"     │  │ cpal I/O bound to  │
           └──────────────────┘  └──────────────────┘  │ a physical circuit │
                                                         │ = one "pack",     │
                                                         │ always-latched    │
                                                         └─────────┬─────────┘
                                                                   │
                                                            ┌──────▼──────┐
                                                            │   audio      │
                                                            │  interface   │
                                                            │ (XLR in/out) │
                                                            └──────────────┘

           ┌──────────────────┐
           │   Manager app     │──── REST + SSE ────► comms-gateway
           │ (admin SPA)       │
           └──────────────────┘
```

**Components:**

- **comms-gateway** (Node/Fastify): owns all durable state (packs, channels,
  assignments, live connected/keyed status), exposes REST for manager
  config and WebRTC signaling negotiation, exposes SSE for state broadcast.
  Owns no audio hardware and does not itself terminate media.
- **mix-router** (Rust sidecar, one instance for the whole gateway):
  terminates WebRTC/Opus for every peer (str0m, adapted from a2-monitor's
  media-worker), performs real-time per-pack N-1 mixing, and receives
  keying/volume control messages over each peer's WebRTC data channel.
  Told about state changes by comms-gateway over a local control channel
  (line-delimited JSON, same IPC pattern a2-monitor already validated —
  audio itself never crosses that channel).
- **Talk app** (React PWA): phone/browser client. Pick a pack, see assigned
  channels, PTT/latch/toggle controls, hear personalized mix.
- **comms-node** (Rust daemon, cpal-based, adapted from a2-monitor's
  `audio-host-api`): headless WebRTC client bridging one physical audio
  circuit into the system. Functionally a "pack bound to hardware instead
  of a browser." Runs on any box on the network, including possibly the
  same machine as comms-gateway — no architectural distinction.
- **Manager app** (React SPA): admin CRUD for packs/channels/assignments/
  hardware node config, plus a live status dashboard.

Rationale for reusing a2-monitor's stack: it already solved the two hardest
problems here — real-time-safe audio device I/O via cpal behind a
project-owned trait boundary, and low-latency browser audio transport via
str0m/WebRTC/Opus (ICE-lite, WHEP-style signaling, no trickle ICE, 10ms
CELT-only frames) — validated with real latency measurement. Rebuilding
either in a different stack for the MVP would be re-solving a solved
problem.

## 4. Data model

### Pack
A client identity — human or hardware.

```
Pack {
  id: string
  name: string
  type: "human" | "hardware"
  pin?: string              // optional; if set, Talk app requires PIN to select this pack
  masterVolume: number      // 0-100, operator-adjustable overall output level
  channels: PackChannel[]
}

PackChannel {
  channelId: string
  mode: "ptt" | "latch" | "auto"   // manager-set; meaningful for partyline/direct only
  pgmListen: "always" | "toggle"   // manager-set; meaningful for pgm only
  volume: number                    // 0-100, operator-adjustable, this channel's level in the pack's personal mix
}
```

Runtime-only state (not manager-configured; broadcast live via SSE, not
stored as config):
```
PackLiveState {
  packId: string
  connected: boolean
  keyed: { [channelId: string]: boolean }
  pgmOn: { [channelId: string]: boolean }   // only for pgmListen: "toggle" channels
}
```

### Channel

```
Channel {
  id: string
  name: string        // key heading, shown large on the Talk app key
  subText?: string    // optional small line under the heading (who's on it, what it's for)
  type: "partyline" | "direct" | "pgm"
  members: string[]   // pack ids; UI enforces exactly 2 for "direct"
}
```

The Talk app key shows only `name` and `subText`. The key's behaviour
(`mode`, see §5) is configured per pack in the Manager and is **not**
printed on the key.

- **partyline**: standing multi-way conference. All currently-keyed members
  hear an N-1 mix of each other.
- **direct**: identical mixing mechanics, capped at exactly 2 members — a
  standing "private line" (not ad-hoc dialing; that's a v2 feature).
- **pgm**: listen-only. Members with `pgmListen: "always"` always hear it;
  members with `pgmListen: "toggle"` get a mute/unmute control. No talk
  capability on pgm channels at all — no keying UI, mode field unused.

### Hardware patch

Not a separate data structure — a hardware patch is just a `Pack` with
`type: "hardware"`, assigned to a channel like any other pack. Its physical
binding (which cpal device, which capture/playback channel indices) is
local configuration on the `comms-node` daemon itself, associated with its
`packId` at registration time (see §7).

## 5. Keying semantics

Manager sets `mode` per pack-channel assignment; **the operator cannot
override it** (no per-session PTT/latch switch in the Talk app UI).

- `ptt`: hold to talk, release to stop. Simple momentary key.
- `latch`: press to key on, press again to key off.
- `auto`: hold-to-talk like `ptt`; but a **quick tap** (below a short
  threshold, ~350ms) instead **toggles latch on**. While latched, a tap
  turns it back off. This is the classic "tap to latch, hold to talk"
  beltpack behavior found on real intercom panels.

The tap-vs-hold interpretation for `auto` is **client-side UI logic only**
(timing a press/release). Regardless of mode, the only thing that ever
reaches the server is a simple boolean: "pack X is now keyed on/off channel
Y." This keeps the mixing engine mode-agnostic — `mix-router` never needs
to know which mode produced a given keying event.

Hardware nodes are typically configured `mode: "latch"` and left
permanently keyed on by the manager (no human present to press a button),
though nothing prevents other modes if a use case calls for it.

## 6. Audio engine & mixing behavior

- **Passive listen, active talk**: a pack continuously hears a live mix of
  every channel it's assigned to (including `pgm`), regardless of its own
  keyed state. Keying only controls whether *that pack's own mic* is added
  into a channel's mix for others.
- **Multi-channel keying**: a pack may be keyed into more than one assigned
  channel simultaneously — this falls out naturally from the model and is
  not specially restricted.
- **N-1 mixing**: for each channel a pack is keyed into, it hears every
  *other* currently-keyed member on that channel, never its own audio back
  (standard anti-echo behavior). A pack's single outbound downstream stream
  is the sum of what it should hear across *all* its assigned channels —
  one combined WebRTC audio track per pack, not one per channel.
- **pgm channels**: members are always-contributing sources (typically one
  `comms-node` hardware input); listeners never contribute back into it,
  regardless of pgmListen setting (pgmListen only controls whether the
  listener hears it, never whether they can talk into it — pgm is never
  talkable).
- **direct channels**: identical mixing math to partyline, just capped at
  2 members.
- **Volume application**: each pack's personal per-channel `volume` is
  applied as a gain stage on that channel's contribution to the pack's
  personal mix; `masterVolume` is applied once, after all channels are
  summed, as a final gain stage. No per-source (per-talker) gain trim in
  the MVP — that's an a2-monitor "feed" feature we are explicitly not
  carrying over yet.
- **Latency target**: reuse a2-monitor's proven low-delay chain — 48kHz,
  10ms CELT-only Opus frames, no DTX/FEC, ICE-lite, WHEP-style signaling,
  no trickle ICE. Target **<150ms mic-to-ear on LAN WiFi**, to be validated
  the same way a2-monitor validated it (physical impulse latency test).

## 7. State sync & control protocol

Reuses a2-monitor's proven split rather than inventing a new one, with one
deliberate change: real-time control (keying/volume) rides the WebRTC
connection itself rather than a separate HTTP/WebSocket channel, for lowest
latency and simplest connection-health story.

- **Format**: JSON Schema-authoritative contracts, generated TS types
  shared by both apps and the gateway (mirrors a2-monitor's
  `packages/protocol` pattern).
- **Global state read path** (not latency-critical — a few hundred ms is
  invisible for "who else is connected/keyed" UI):
  - `GET /api/v1/state` — full snapshot (packs, channels, live
    connected/keyed status, revision number).
  - `GET /api/v1/events` — SSE stream: full snapshot once, then
    revision-gated deltas; a client that falls behind (buffer overrun)
    gets a full resend instead of a delta.
- **Real-time control path** (latency-critical, per-pack): sent as small
  JSON messages over a **reliable, ordered WebRTC data channel**, part of
  the same peer connection already carrying that pack's audio, straight to
  `mix-router` (which already terminates that connection):
  - `{ type: "key", channelId, on: boolean }`
  - `{ type: "volume", channelId, volume }`
  - `{ type: "masterVolume", volume }`
  - `{ type: "pgmListen", channelId, on: boolean }`
  Reliable-ordered delivery is required — losing a "key off" message must
  never leave a channel stuck open.
  - Rationale for choosing a WebRTC data channel over a second REST/WS
    connection: it rides the already-negotiated ICE/DTLS session (no new
    handshake per press, inherits that connection's NAT traversal and
    health monitoring), and avoids a second connection lifecycle to manage
    and reconnect independently of the audio session.
- **Manager CRUD** (low-frequency, config-time, not latency-sensitive):
  plain REST — `POST/PATCH/DELETE /api/v1/packs`, `/api/v1/channels`, etc.
- **WebRTC signaling** (one-time per session setup, not the hot path):
  WHEP-style HTTP offer/answer — `POST /api/v1/media/sessions { packId,
  offer }` → `{ sessionId, answer }`; `DELETE /api/v1/media/sessions/:id`
  to disconnect. Used identically by the Talk app and by `comms-node`
  hardware daemons.

## 8. Hardware node registration

A `comms-node` on first connect calls `POST /api/v1/nodes/register
{ deviceName, availableChannels }`. The gateway creates (or matches) a
`Pack` with `type: "hardware"` and returns its `packId`. The Manager app's
"Hardware nodes" view is simply packs of `type: "hardware"` filtered out,
showing registration/connectivity status and capture/playback channel
config. No separate pairing UI — plug it in, it appears, the manager
assigns it to a channel like any other pack.

## 9. Authentication / access control

- **No mandatory authentication anywhere.** The LAN itself is the trust
  boundary for the MVP.
- **Pack PIN (optional)**: manager may set `Pack.pin`; if set, the Talk
  app's pack picker requires entering it before that pack can be selected.
  If unset (default), tapping the pack works immediately.
- **Manager app**: no passphrase gate at all — fully open on the LAN.
  (Considered and explicitly rejected for MVP; revisit if deployed beyond
  a single trusted network.)

## 10. Client apps

### Talk app (React PWA, phone/browser)

1. **Pack picker**: list of packs (name + icon); PIN-protected packs show
   an inline numeric PIN pad on tap, others select instantly.
2. **Main screen**: one row per assigned channel.
   - `partyline`/`direct`: large key control, visual style reflects
     `mode` (e.g. "HOLD" label for `ptt`, toggle-pill for `latch`/`auto`),
     red/glowing when keyed. Expandable per-channel volume slider.
   - `pgm`: no key control — either nothing (`always`) or a mute/unmute
     toggle (`toggle`), plus the same volume slider.
   - Persistent master volume control, always visible.
   - Connection status indicator (connected / reconnecting).
3. Single-column layout on phone portrait; denser 2-column layout on
   tablet/landscape for higher channel counts.

### Manager app (React SPA, admin)

1. **Live status** (default landing page): table of all packs —
   connection dot, name, type, currently-keyed channel(s), live via SSE.
2. **Packs**: list + detail editor (name, type, PIN, channel assignments
   with mode/pgmListen/volume defaults).
3. **Channels**: list + detail editor (name, type, members); `direct`
   type enforces exactly 2 members in the UI.
4. **Hardware nodes**: packs of `type: "hardware"`, showing
   registration/connectivity status and capture/playback channel config.

## 11. UI/UX design direction

- **Visual language**: dark-mode-first, high-contrast, pro-audio/broadcast
  tool aesthetic (same family as a2-monitor), not a consumer chat-app
  style — this is a tool glanced at quickly during a live show.
- **Color coding by channel type**, consistent across both apps: partyline
  = one accent (e.g. blue), direct/private = a distinct accent (e.g.
  purple), pgm = a third (e.g. amber). **Keyed/live state is always red**
  regardless of channel type — the universal "mic is hot" signal, never
  overloaded with anything else.
- Detailed pixel-level layout/spacing/component work is deferred to
  implementation time (frontend-design skill), not specified further here.

## 12. Explicitly out of scope for MVP

- Multi-site linking/trunking (see §2).
- Ad-hoc/dial-style direct calls (only standing `direct` channels for MVP).
- Per-source (per-talker) gain trim within a mix (only per-channel and
  master volume for the listener).
- User accounts / role-based access control.
- Remote/VPN access beyond the local WiFi network.

## 13. Open items

- **[TBD] MVP feature cut-list**: a full pass over the above to explicitly
  confirm what ships in v1 vs. is deferred, beyond what's already listed in
  §12. Not yet designed.
- Any further sections raised before this spec is finalized.
