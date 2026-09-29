# new-comms v2 — A matrix with a comms system on top

Status: **draft for review, 2026-09-29 (rev 2).** Supersedes the data model, keying and
Manager sections of `2026-09-29-new-comms-design.md`. Architecture (gateway, mix-router,
Talk, comms-node, protocol, transport, latency targets, trust model) is unchanged.

Direction from review: model it the way Riedel Artist does, with Bolero beltpacks in
integrated mode as the phones. Everything is a port; the matrix of crosspoints between
ports is the whole system; conferences, groups and IFBs are ports too; a panel's keys are
a layout over the matrix, not the source of truth.

Decisions folded in at rev 2: IFB with dim, listen keys, levels in dB, 4-wire pair names,
operator volume as its own layer, Reply mode per panel, circuits-in-use per node,
conference-of-conferences deferred.

## 1. Ports

A port is anything audio can come from or go to. Five types.

| Type | Direction | What it is |
|---|---|---|
| **Panel** | source (mic) and destination (ear) | A person on a phone or browser. Keys, Reply, PIN, master volume, per-source volumes. |
| **Circuit** | source **or** destination | One channel of a hardware interface on a comms-node: `in` (capture) or `out` (playback). Has a trim. An in and an out can share a pair name ("Truck") and appear as "Truck in" / "Truck out". |
| **Conference** | source (its mix) and destination (contributions) | A shared mix. Each listener hears the mix minus their own contribution. |
| **Group** | destination only | A named set of panels and out-circuits. Talking to a group reaches every member; members do not hear each other through it. |
| **IFB** | source (its output) and destination (program and interrupts) | A program feed that is dimmed or cut while someone talks into it. Always routes into it are *program*; keyed routes into it are *interrupts*. Its output is routed on to a panel or out-circuit. |

Circuits are one-directional so routing reads the way it is spoken: "Stage rack in 3 →
SHOW", "SHOW → Stage rack out 7".

```
Port {
  id, name, subText?
  type: "panel" | "circuit" | "conference" | "group" | "ifb"
  panel?:      { pin?, masterVolume, replyMode: KeyMode, keys: Key[],
                 volumes: { [sourcePortId]: 0..100 } }   // operator layer, persisted
  circuit?:    { nodeId, direction: "in" | "out", index, pair?: string, trim: dB }
  group?:      { members: portId[] }                      // panels and out-circuits
  ifb?:        { dim: dB }                                // -∞ = cut; typical -12 to -20
}
KeyMode = "ptt" | "latch" | "auto"
```

## 2. The matrix

The only routing primitive is a **crosspoint**: a directed route from a source port to a
destination port.

```
Crosspoint {
  source: portId        // panel | circuit(in) | conference | ifb
  destination: portId   // panel | circuit(out) | conference | group | ifb
  level: dB             // system gain on this route, -40..+12, default 0
  gate: "always" | "key"
}
```

- `gate: "always"`: audio flows whenever the source has audio. Feeds, hot mics, program.
- `gate: "key"`: audio flows only while a key is down. The key belongs to the panel at
  the **source** (a talk key) or at the **destination** (a listen key). So a keyed route
  always involves exactly one panel's key.
- A panel has at most **6 keys** in total (talk, listen or talk+listen). It may have any
  number of `always` routes in either direction: those have no button.
- In-circuits and conferences only ever have `always` outgoing routes. Groups are not
  sources. No conference/IFB → conference/IFB routes in the MVP, so the graph is acyclic.
- A route into a group is expanded at mix time into one route per member at the same
  level and gate. The group stores no audio.

## 3. What the old types become

| Old / Artist term | Now |
|---|---|
| Party line | A conference. Each member: talk+listen key to it. |
| Direct line | Priya has a key → Alex's panel; Alex has a key → Priya's. Key heading is the target's name. No "direct" type. |
| PGM | A conference whose only talker is an in-circuit (`always`). Panels have `always` conf → panel, no key. |
| IFB | An IFB port. Program = `always` route in (e.g. SHOW conference or an in-circuit). Producer's key → IFB is an interrupt. IFB → talent's out-circuit or panel (`always`). |
| All call / group call | A talk key whose destination is a group. |
| Hot mic | Panel → conference with `gate: always`. |
| Listen key | A key on my panel that gates a route *into* me (press to monitor a source). |

## 4. Keys and the phone (the beltpack)

```
Key { destination: portId, function: "talk" | "listen" | "talkListen", mode: KeyMode }
```

A key owns the crosspoints it implies: `talk` = keyed route me → destination;
`listen` = keyed route destination → me; `talkListen` = keyed talk route plus an
`always` listen route (the party-line case; the listen is passive as in v1). Keys are
ordered; that order is the phone layout. Heading is the destination's name, sub text is
the destination's sub text. Modes: hold, tap, tap/hold, as in v1.

- **Reply** is a built-in seventh key that does not count toward six. When another panel
  talks directly to this panel (a keyed panel → panel route opens), it becomes the *last
  caller* and Reply lights with their name. Pressing Reply talks back to that panel even
  with no configured route, using the panel's `replyMode` (set in Manager: hold, tap or
  tap/hold, like any key). The last caller is remembered until someone else calls, and
  cleared on reconnect.
- **Volumes are the operator's, like a Bolero rotary.** The panel holds a volume (0–100,
  default 80) for every source it hears: each key's return path and every listen-only
  feed. These sit on top of the Manager's crosspoint level (dB) and are persisted per
  panel. **Levels mode** shows a slider per key and, below the grid, one per feed
  ("Also hearing"). Master volume is a final gain on the panel.
- Mic kill, connection loss handling, and the six-key limit behave as in v1.

Real-time control (data channel), phone → router:

```
{ type: "talk",   destination: portId, on }   // a key target, or the last caller
{ type: "listen", source: portId, on }         // a listen key
{ type: "micOff", on }
{ type: "volume", source: portId, volume }     // operator layer
{ type: "masterVolume", volume }
{ type: "ping", hidden? }
```

Router → phone: `state` (open talks and listens, volumes, master, last caller), `pong`.

## 5. Hardware nodes are circuit factories

A comms-node registers with its interface's channel counts. In Manager → Hardware you
choose which interface channels are **in use** (default: all); each one becomes a
circuit port, "Stage rack in 1" … "Stage rack out 8", with its own trim. Ins and outs can
be given a shared pair name. Nothing else is configured on the node; all routing is in
the matrix.

The node opens one WebRTC session carrying one mono Opus track per circuit in use
(sendonly for ins, recvonly for outs). Changing the in-use set renegotiates that node's
session (a brief glitch on that node only); changing routes does not. On a LAN the cost
of an unrouted-but-in-use circuit is ~64 kbps and a little CPU, so there is no need to
be clever beyond the in-use set. Trims are applied in mix-router.

## 6. Mixing

Every 10 ms mix-router:
1. Collects a frame from every live source: panel mics, in-circuits (trim applied).
2. Computes each conference: sum of open incoming routes × level.
3. Computes each IFB: program (its `always` inputs, summed) dimmed by `dim` while any of
   its keyed inputs is open, plus the open keyed inputs.
4. Computes each panel and out-circuit: sum of open incoming routes × level × (operator
   volume, panels only), where a conference source contributes its mix minus this
   destination's own contribution (N-1); then master volume or out trim; then soft clip.
   Group destinations are expanded here.

A route is open when its gate is `always` and the source has audio, or `key` and the
owning panel currently has that key on. Modes stay client-side; the router sees booleans.

Config from gateway → router is the port list (with type-specific fields the mixer
needs: dim, group members, trims) and the crosspoint list.

## 7. Manager

Left nav: **Live**, **Matrix**, **Ports**, **Hardware**.

- **Matrix**: the grid. Sources down the side grouped Panels / Inputs / Conferences /
  IFBs; destinations across the top grouped Panels / Outputs / Conferences / Groups /
  IFBs. A cell shows its state: empty, **L** (always route, destination hears source),
  **T** (talk key), **T+L**, **A** (hot: panel source, always), **P** (program, into an
  IFB). Click cycles through the states valid for that pair; a level field is in the
  cell's popover. Row and column headers select a whole row or column. A panel row
  shows "3 of 6 keys" and refuses a seventh. Filters: conferences only, hardware only,
  one panel's row and column, search.
- **Ports**: master/detail list grouped by type. Panel: name, sub text, PIN, master
  volume, Reply mode, **Keys** (ordered, function and mode per key, phone preview), and
  its feeds. Conference and IFB: name, sub text, dim (IFB), and a member list that is
  a convenience view of the port's row and column (T / L / T+L / P per member).
  Group: name, members. Circuit: name, pair, trim, node and channel.
- **Hardware**: one card per node; channels in use; its circuits with online state.
- **Live**: the matrix read-only, red where a keyed route is open, meters on sources;
  Needs attention (node offline, panel with no keys, conference with no talker, IFB
  with no program or no output, group with no members); Talking now.

## 8. Migration from v1 state

Mechanical, once, on load of an old `state.json`: partyline → conference with
talk+listen keys; pgm → conference with an `always` route from the node's in-circuit 1
and `always` listens; direct → two keys; hardware pack → node with circuits, its routes
from in 1 and to out 1; key volumes → operator volumes; trims carried over.

## 9. Out of scope, still

Multi-site trunking, call/cue signalling and tally, logic and GPIO, recording, accounts,
remote access, conference-of-conferences, dual-function keys, per-talker trim, dial-style
calls beyond Reply.
