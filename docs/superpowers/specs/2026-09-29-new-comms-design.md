# new-comms — Design Spec (MVP)

Status: **approved for implementation planning, 2026-09-29.**
Interactive mockups that this spec describes live in `docs/design/mockups/`
(`talk.html`, `manager.html`) and should be treated as the visual reference
for §10 and §11.

## 1. Purpose

A web-based party-line/PGM intercom system, in the spirit of RTS/Clear-Com/Riedel
Artist/Bolero, built on the architecture proven by `a2-monitor` ("Pulse"):
a real-time audio engine talking to physical hardware, a web backend, and
browser-based clients. Crew open a web page on a phone or laptop over WiFi,
pick their identity ("pack"), and talk on assigned comms channels using PTT
or latch. A separate manager app configures packs, channels, and hardware
nodes, similar in spirit to a Riedel Artist configuration frame.

## 2. Scope

- **Single site only.** One comms-gateway serving one physical location.
  Multi-site linking (trunking several locations together) is an explicit
  non-goal of this spec. The protocol and channel model must not be
  *blocked* from a future multi-site design, but nothing here builds it.
- **Deployment**: local WiFi network. No cloud/internet dependency for the
  MVP. Remote/VPN access is not designed here.
- **Trust model**: the LAN is the security boundary. No user accounts and no
  mandatory authentication anywhere in the system.
- The full in/out list for the MVP is in §13.

## 3. Architecture overview

Three logical components, all network peers of a central gateway. No
component spawns another as a child process (unlike a2-monitor's local
child-process model) because comms hardware may live on separate boxes.

```
                         ┌─────────────────────────────┐
                         │        comms-gateway         │
                         │        (Node/Fastify)        │
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
                                                         │ always keyed      │
                                                         └─────────┬─────────┘
                                                                   │
                                                            ┌──────▼──────┐
                                                            │   audio      │
                                                            │  interface   │
                                                            └──────────────┘

           ┌──────────────────┐
           │   Manager app     │──── REST + SSE ────► comms-gateway
           │ (admin SPA)       │
           └──────────────────┘
```

**Components**

- **comms-gateway** (Node/Fastify): owns all durable state (packs, channels,
  assignments) and live status (connected, keyed, mic off, PGM muted).
  Exposes REST for manager config and WebRTC signaling negotiation, SSE for
  state broadcast. Owns no audio hardware and does not terminate media.
- **mix-router** (Rust sidecar, one per gateway): terminates WebRTC/Opus for
  every peer (str0m, adapted from a2-monitor's media-worker), performs
  real-time per-pack N-1 mixing, and receives keying/volume/mic control
  messages over each peer's WebRTC data channel. Told about config changes
  by comms-gateway over a local control channel (line-delimited JSON, the
  IPC pattern a2-monitor already validated; audio never crosses it).
- **Talk app** (React PWA): phone/browser client. Pick a pack, see its keys,
  key channels, hear a personalized mix.
- **comms-node** (Rust daemon, cpal-based, adapted from a2-monitor's
  `audio-host-api`): headless WebRTC client bridging one physical audio
  circuit into one channel. Functionally "a pack bound to hardware instead
  of a browser." Runs on any box on the network, including the gateway's.
- **Manager app** (React SPA): configure packs, channels and hardware nodes;
  watch live status.

Rationale for reusing a2-monitor's stack: it already solved the two hardest
problems (real-time-safe device I/O via cpal behind a project-owned trait
boundary, and low-latency browser audio via str0m/WebRTC/Opus with
ICE-lite, WHEP-style signaling, 10 ms CELT-only frames) and measured them.

## 4. Data model

### Channel

```
Channel {
  id: string
  name: string        // key heading, shown large on the Talk app key
  subText?: string    // small line under the heading (who's on it, what it's for)
  type: "partyline" | "direct" | "pgm"
  members: string[]   // pack ids; exactly 2 for "direct"
}
```

- **partyline**: standing multi-way conference; keyed members hear an N-1
  mix of each other.
- **direct**: identical mechanics, exactly 2 members, a standing private
  line (not ad-hoc dialing). Each side's key shows the *other* pack's name
  as its heading; `subText` is shared.
- **pgm**: listen-only. Nobody can talk into it. Its audio comes from
  hardware nodes assigned to it ("feed").

### Pack

```
Pack {
  id: string
  name: string
  type: "human" | "hardware"
  pin?: string              // optional; Talk app asks for it before this pack can be picked
  masterVolume: number      // 0-100, operator-adjustable, persisted per pack
  keys: PackKey[]           // ORDERED: this is the key layout on the phone
}

PackKey {
  channelId: string
  mode: "ptt" | "latch" | "auto"   // manager-set; partyline/direct only
  volume: number                    // 0-100, operator-adjustable, persisted; ignored for pgm
}
```

**Button limit (amended 2026-09-29).** A *button* is a key on a partyline or
direct channel. A human pack may have at most **6 buttons**. A **pgm** channel is
not a button: it is a listen-only *mapping* with no key, no level and no
on/off, sent straight into the pack at full level. A pack may have any number
of pgm mappings, and they do not count toward the 6. (This replaces the earlier
per-key `pgmListen: "always" | "toggle"` setting and the pgm level slider.)

A hardware pack has **no limit** on channels. It has one input circuit and one
output circuit: its input is added to every channel it is on (permanently keyed
on a partyline/direct channel, the feed on a pgm), and its output is the sum of
the N-1 mixes of all its channels. Its keys carry no level (full level).

A hardware pack's device settings include an **input trim** and **output trim**,
each -24 to +24 dB, applied in mix-router (input trim on what the node sends
in, output trim on what it is sent).

Runtime-only state (broadcast via SSE, not stored as config):

```
PackLiveState {
  packId: string
  connected: boolean
  client?: string                        // e.g. "iPhone, Safari"; hardware: address
  micOff: boolean                        // pack-wide mic kill
  keyed: { [channelId]: boolean }
}
```

The Talk app key shows only `name` and `subText`. The key's `mode` is
configured in the Manager and is **never printed on the key**.

## 5. Keying semantics

Manager sets `mode` per pack key; the operator cannot override it.

- `ptt`: hold to talk, release to stop.
- `latch`: tap to key on, tap again to key off.
- `auto`: hold-to-talk like `ptt`; a **quick tap** (< ~350 ms) instead
  **latches on**; while latched, a tap turns it off.

Tap-vs-hold interpretation is client-side only. The server only ever sees
"pack X keyed on/off channel Y" as a boolean, so `mix-router` stays
mode-agnostic. A pointer cancel or loss of pointer capture must release a
`ptt` key.

**Mic kill**: a pack-wide `micOff` toggle in the Talk app. Turning it on
drops every keyed channel and blocks keying until turned off. It is shown
on the pack's live state.

**Connection loss**: while connecting or reconnecting, keys are disabled and
any keyed channel is dropped server-side and client-side. The Talk app
shows a banner saying keys are off until the connection is back.

## 6. Audio engine & mixing

- **Passive listen, active talk**: a pack continuously hears every channel
  on its keys (including pgm), regardless of its own keyed state. Keying
  only controls whether its mic is added into a channel for others.
- **Multi-channel keying** is allowed: a pack may be keyed on several
  channels at once.
- **N-1 mixing**: on each channel a pack is keyed into it hears every other
  keyed member, never itself. One combined downstream track per pack.
- **pgm**: hardware feed(s) are always contributing; listeners never
  contribute. A pgm mapping is always heard at full level (no toggle, no level).
- **Volume**: per-key `volume` is a gain on that button's channel contribution to
  the pack's personal mix (not applied to pgm mappings or to hardware packs);
  `masterVolume` is a final gain after summing. Hardware trims are applied at
  the node's input and output. No per-talker gain trim in the MVP.
- **Latency target**: 48 kHz, 10 ms CELT-only Opus, no DTX/FEC, ICE-lite,
  WHEP-style signaling, no trickle ICE. Target **< 150 ms mic-to-ear on LAN
  WiFi**, validated with a physical impulse test as a2-monitor did.

## 7. State sync & control protocol

- **Format**: JSON Schema-authoritative contracts with generated TS types
  shared by both apps and the gateway (a2-monitor's `packages/protocol`
  pattern).
- **Global state** (not latency-critical):
  - `GET /api/v1/state` — full snapshot (channels, packs, live state,
    revision).
  - `GET /api/v1/events` — SSE: full snapshot once, then revision-gated
    deltas; a client that falls behind gets a full resend.
  - The Talk app uses this to show **who is keyed on each of its keys**
    (talker name + level indication) and its own connection state.
- **Real-time control** (latency-critical, per pack) over a **reliable,
  ordered WebRTC data channel** on the same peer connection as the audio,
  terminated by `mix-router`:
  - `{ type: "key", channelId, on }`
  - `{ type: "micOff", on }`
  - `{ type: "volume", channelId, volume }`
  - `{ type: "masterVolume", volume }`
  - `{ type: "ping", hidden? }`, answered with `{ type: "pong" }`. Sent once a
    second (from a worker, so a locked phone keeps sending). Silence for ~4 s
    ends the session; `hidden: true` (backgrounded tab) extends that to ~20 s.
  Reliable-ordered delivery is required: a lost "key off" must never leave
  a channel open. Rationale for a data channel over a second REST/WS
  connection: it rides the already-negotiated ICE/DTLS session and has no
  separate lifecycle to reconnect.
- **Manager CRUD** (config-time): plain REST — `POST/PATCH/DELETE
  /api/v1/packs`, `/api/v1/channels`; pack keys are an ordered array on the
  pack.
- **WebRTC signaling**: WHEP-style HTTP — `POST /api/v1/media/sessions
  { packId, offer }` → `{ sessionId, answer }`; `DELETE
  /api/v1/media/sessions/:id`. Same for Talk app and comms-node.

## 8. Hardware node registration

A `comms-node` calls `POST /api/v1/nodes/register { deviceName,
availableInputs, availableOutputs, address }` on connect. The gateway
creates (or matches) a `Pack` of `type: "hardware"` and returns its
`packId`. The node's capture input and playback output are chosen in the
Manager and pushed to the node over its data channel. No pairing UI: a node
pointed at the gateway appears in the Manager.

## 9. Access control

- No mandatory authentication. The LAN is the trust boundary.
- **Pack PIN (optional)**: if `Pack.pin` is set, the Talk app asks for it
  before that pack can be picked.
- **Manager app**: fully open on the LAN for the MVP (considered and
  rejected for now; revisit if deployed beyond one trusted network).

## 10. Client apps

Reference: `docs/design/mockups/talk.html` and `manager.html`.

### Talk app (React PWA, phone first)

Shared chrome on every screen: a thin top bar with a connection dot and the
system name ("Stage A"), the time, and a menu.

1. **Choose your pack**: 2-column grid of tiles, one per pack: name, the
   channels it carries as sub text, a small PIN marker if one is set.
   Hardware packs are listed under a "Hardware" heading, dimmed and **not
   selectable**. Tapping a PIN-protected pack opens a numeric PIN pad.
2. **Keys**: a row with the pack name and a **Levels** toggle, then a
   2-column grid of keys in the pack's key order. Each key: a thin colour
   strip on top for the channel type, the channel **heading** (large), the
   **sub text** (small). Nothing about the mode is printed.
   - Idle: as above. When someone else is keyed on that channel, the key
     shows their name with a small green level indication.
   - Hot (this pack keyed): the whole key turns flat red, white text, with a
     small level meter and the word "Talking" (or "Latched").
   - pgm channels have **no key**. They play straight in and are listed under
     the grid as "Also hearing: Program, Announce". At most 6 keys are shown.
   - While connecting/reconnecting or with mic off, keys are dimmed and
     inert; a banner explains why.
3. **Levels mode**: every key swaps its content for its own volume slider
   and value; keys do not key in this mode. This is the only place
   per-channel volume is edited (nothing inside a key can be tapped by
   accident while mixing).
4. **Dock** (always visible): **Mic** button (Mic on / Mic off; off is
   amber-filled) and the master **Volume** slider with its value. With no
   microphone it reads "No mic" and tapping it retries.
5. **Audio devices** (menu, every screen): choose the **microphone** and, where
   the browser allows it (not Safari), the **speaker**. Remembered per browser.
   Changing the microphone while connected swaps the track without reconnecting.
6. **Listening never depends on the microphone.** If the mic is blocked,
   unplugged or suspended by the OS (locked screen), the session still joins
   and plays the mix ("Listening only"), and the mic is re-acquired when the
   app returns to the foreground. While playing, the page registers a media
   session (lock-screen controls; pause is ignored), sets the platform audio
   session to play-and-record where supported, and resumes playback if the OS
   pauses it. Browsers, iOS especially, may still suspend a locked page; see
   the README for what has and has not been verified.

### Manager app (React SPA, laptop)

Left nav: Live, Packs, Channels, Hardware. Footer shows gateway address,
mixer health/latency, and online count.

1. **Live**: one-line summary ("8 of 10 packs online, 2 keyed"), then a
   **read-only** matrix: packs down the side (people, then a Hardware
   group), channels across the top (name + sub text). Cells show the key
   behaviour word, "Talking" in red when keyed, "Feed" for a hardware
   source, struck-out when a pack has muted a pgm feed. Clicking a pack
   name opens it in Packs. Beside the matrix: **Needs attention** (offline
   hardware node; pack with no keys; direct line without exactly two
   packs; pgm channel with no feed — each with an Open link) and **Talking
   now** (pack, channel, elapsed).
2. **Packs**: master/detail. List grouped People / Hardware with an online
   dot and key count. Editor: inline-editable name, type, online status
   with client; for people: optional PIN toggle and starting volume; for
   hardware: device, input and output selects, and **input trim / output trim** sliders (-24 to +24 dB). **Keys** section: a table of
   only the channels this pack has, in order (#, channel with sub text,
   behaviour select, level, move up/down, remove), an **Add channel** button
   offering only channels not yet on the pack, and a **phone preview** on
   the right rendering exactly what that pack sees (keys light red live).
   New pack, Remove pack.
3. **Channels**: master/detail. Editor: inline-editable heading, type
   switch (Partyline / Direct / PGM), sub text with a key preview, and
   "Who's on it" as chips with an add select. Rule text: direct lines need
   exactly two packs (error state otherwise); pgm shows its feed or "no
   feed yet". New channel, Remove channel.
4. **Hardware**: a card per node — name, online/last seen, device,
   address, input/output selects, channel, Open pack. A note that there is
   nothing to pair.

## 11. UI/UX direction

- **Plain, not designed.** The platform/system font, sentence case, full
  names (no abbreviations), no monospace or tracked-uppercase labels, no
  glows, no decorative cards. This was an explicit correction during
  design review and is the register for both apps.
- **Dark by design.** Single dark theme, high contrast (backstage, trucks,
  FOH). Neutral greys with a slight cool bias.
- **Colour means something.** A thin strip per channel type (partyline
  blue, direct violet, pgm amber). **Red means one thing only: this pack's
  mic is hot.** Green is audio present / online. Amber is warning
  (reconnecting, mic off).
- **Keys look like keys**: solid tiles, large heading, small sub text,
  2-column grid, minimum 44 pt targets, `touch-action: none` on keys.
- Copy: short, plain verbs; errors say what happened and what to do, no
  apologies.

## 12. Non-goals / deferred

- Multi-site linking/trunking.
- Ad-hoc/dial-style calls, ringing, "reply to last caller".
- Call/cue signalling (Green-GO-style call flash, cue lights), GPIO/tally.
- Per-talker gain trim within a mix.
- User accounts, roles, Manager passphrase.
- Remote/VPN access.
- Recording/playback, logging of audio.
- Drag-and-drop key ordering (arrows are enough for MVP).
- Custom key colours per pack; themes.
- Gateway redundancy/failover.

## 13. MVP cut-list

**In v1**

- comms-gateway: channels/packs CRUD, ordered keys, live state, SSE
  snapshot+delta, WHEP signaling, node registration, JSON Schema contracts.
- mix-router: str0m WebRTC termination, per-pack N-1 mixing across
  partyline/direct/pgm, per-key and master volume, mic kill, data-channel
  control, control channel from gateway.
- comms-node: cpal capture/playback on a chosen input/output, WebRTC client
  to the gateway, registers itself, permanently keyed / feed.
- Talk app: pack picker with optional PIN, keys screen with all states in
  §10, Levels mode, mic kill, master volume, talker-on-key from SSE,
  connecting/reconnecting handling, installable PWA.
- Manager app: Live (read-only matrix, Needs attention, Talking now),
  Packs, Channels, Hardware as in §10.
- Latency validation: a repeatable mic-to-ear measurement on LAN WiFi
  against the < 150 ms target.

**Known risks to plan for (not features)**

- iOS Safari: audio requires a user gesture (the pack tap is it), and a
  backgrounded tab will lose audio; the Talk app should keep the screen
  awake while on the keys screen and make reconnect fast.
- Phones on WiFi drop packets in bursts; the reconnect path (§5) must be
  boring and reliable, and latches must never survive a reconnect.
