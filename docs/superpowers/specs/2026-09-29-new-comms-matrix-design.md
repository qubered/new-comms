# new-comms v2 — Ports, functions and the matrix

Status: **draft for review, 2026-09-29 (rev 3).** Supersedes the data model, keying and
Manager sections of `2026-09-29-new-comms-design.md`. Architecture (gateway, mix-router,
Talk, comms-node, protocol, transport, latency targets, trust model) is unchanged.

Direction from review: model it the way Riedel Artist does. Everything that carries audio
is a **port**. A port is configured by attaching **functions** (call to a conference,
listen to a port, route audio…) to its **triggers** (a key, Always, Vox, On Call). The
**matrix** of crosspoints is what those functions produce when their triggers are active.
Conferences, groups and IFBs are ports too; you never edit a crosspoint directly unless
you want to (Route Audio).

Rev 3 replaces rev 2's "crosspoint is the config" with "function on a trigger is the
config"; everything agreed earlier (six keys, Reply, operator volumes, IFB with dim,
listen keys, dB levels, pair names, circuits in use, no conference-of-conferences) is
kept.

## 1. Ports

| Type | Carries | Triggers | Comes from |
|---|---|---|---|
| **Panel** | in (mic) and out (ear) | keys 1–6, Reply, Always, Vox, On Call | A phone or browser picks it. Our Bolero beltpack. |
| **Input** | in only | Always, Vox, On Call | One capture channel of a comms-node interface. |
| **Output** | out only | Always, On Call | One playback channel of a comms-node interface. |
| **Conference** | in (contributions) and out (its mix) | none | Made in Manager. Each listener hears the mix minus itself. |
| **Group** | out only (fans out to members) | none | Made in Manager. A set of panels and outputs. |
| **IFB** | in (interrupts) and out (its feed) | none | Made in Manager. Program, dimmed by interrupts. |

```
Port {
  id
  name          // long name: "Stage rack in 03", "Bolero BP 04"
  label         // short, what a key shows: "Show", "Priya". Defaults from name.
  alias?        // who/what it is right now: "Priya", "Truck". Shown small.
  subtitle?     // sub text
  type: "panel" | "input" | "output" | "conference" | "group" | "ifb"
  hardware?:    { nodeId, channel, pair?, trim: dB }        // input, output
  panel?:       { pin?, masterVolume, volumes: {[portId]: 0..100}, replyMode: KeyMode,
                  vox?: { threshold: dB, hang: ms } }
  group?:       { members: portId[] }                       // panels and outputs
  ifb?:         { program: portId, destination: portId, dim: dB }   // dim -∞ = cut
  triggers:     Trigger[]
}
```

Hardware ports are made by the gateway when a node registers: one input and one output
port per interface channel that is ticked "in use" in Manager → Hardware. Panels are
made in Manager (they are what the phone picker lists). Conferences, groups and IFBs are
made in Manager.

## 2. Triggers

A trigger is *when* a port's functions are active.

```
Trigger {
  kind: "key" | "reply" | "always" | "vox" | "onCall"
  key?: 1..6                       // kind "key" only; a panel has at most six
  mode?: "ptt" | "latch" | "auto"  // key and reply
  functions: Function[]
}
```

- **key** *n*: active while key *n* is down (per its mode). Panels only.
- **reply**: the beltpack's Reply key. Its only function is `reply`. Panels only. Does
  not count toward six.
- **always**: active permanently. How a feed, a hot mic or a fixed route is made.
- **vox**: active while the port's own input is above `threshold` for longer than a few
  ms, held for `hang` ms after it drops. Panels and inputs. How a hardware mic joins a
  conference only when someone speaks, or an input drives a "talking" indicator.
- **onCall**: active while any other port is calling this one (a `callToPort` or
  `callToGroup` route into it is open). Inputs, outputs and panels. E.g. an output that
  only opens to a conference while it is being called.

A key may carry more than one function (Artist allows it); the Manager UI leads with one.

### Always and Vox, spelled out

These two are what make hardware and unattended ports work, so every port type has them
where it makes sense, and they are the first thing in a port's editor.

**Always** is a trigger that is permanently active. Its functions are the port's standing
routes:
- Input port: `callToConference(SHOW)` puts that mic into SHOW all the time (a hot 4-wire
  from a truck); `callToPort(Stage PA out)` is a fixed tie-line; `routeAudio` writes any
  standing crosspoint.
- Output port: `callToConference(SHOW)` makes SHOW come out of it; `listenToPort(IFB 1)`
  makes it the talent's earpiece.
- Panel: `listenToPort(Program)` is a feed with no key ("Also hearing"); `callToConference`
  on Always is a hot mic.

**Vox** is a trigger that is active while the port's own input has signal. Parameters,
per port, with system defaults:

```
vox: { threshold: dBFS (default -40), attack: ms (default 20), hang: ms (default 600) }
```

The router measures each input every 10 ms; the trigger opens after `attack` ms above
`threshold` and closes `hang` ms after it drops below. Uses:
- Input port: a wired mic that joins SHOW only when spoken into, so it does not add room
  noise the rest of the time; a PGM input that lights "Talking" indicators only when
  there is programme.
- Panel: a voice-operated mic for someone who cannot hold a key.
- Vox state is live state: the Manager's Live view shows it, phones show the talker's
  name on the key the way they do for a held key, and the SSE `levels` event carries it.

**On Call** is the third standing trigger: active while someone is calling this port.
It is how a PA output can sit silent until a key is pressed to it, and how a panel could
later beep on an incoming call (beeps are out of scope for now).

## 3. Functions

A function says *what* audio moves when its trigger is active. "Me" is the port that
owns the trigger. Every function has a `level` (dB, default 0).

| Function | Params | Produces | Who can use it |
|---|---|---|---|
| **callToPort** | `to` | me.in → to.out | any port with an in |
| **callToConference** | `conf` | me.in → conf (gated) **and** conf → me.out (always) | any; a port with no in only listens, with no out only talks |
| **callToGroup** | `group` | me.in → m.out for every member m | any port with an in |
| **callToIFB** | `ifb` | me.in → ifb as an *interrupt* | any port with an in |
| **listenToPort** | `from` | from.out → me.out (from may be a port, conference or IFB) | any port with an out |
| **routeAudio** | `from`, `to` | from.out → to.in/out (a raw crosspoint anywhere in the matrix) | any port; usually on Always |
| **reply** | — | me.in → lastCaller.out | panels, Reply trigger |

Notes:
- `callToConference` on a panel key is the party-line key: talk is keyed, listen is
  passive and permanent (v1 behaviour). On an input's Always it is "this mic is always
  in SHOW"; on an output's Always it is "SHOW comes out here".
- A `listenToPort` on a key is a listen key: press to monitor. On Always it is a feed
  with no button ("Also hearing").
- `routeAudio` is how "Input 3 → SHOW" and "SHOW → Output 7" are written when you think
  in matrix terms; it is also what a key can switch elsewhere in the matrix.
- Calling a group or a port sets the callee's **last caller**, which Reply uses.
- Six keys is the only count limit. Always/Vox/On Call functions are unlimited.

## 4. The matrix (derived)

Expanding every port's functions gives the crosspoint set:

```
Crosspoint { source, destination, level: dB, gate }
gate = "always" | { port, trigger }   // active when that trigger is active
```

Constraints on the result (checked in Manager, shown as errors):
- Groups are never sources; nothing routes *from* a group.
- No conference/IFB → conference/IFB crosspoints (acyclic for the MVP).
- A panel has at most six `key` triggers.
- An IFB needs a program and a destination; a conference needs at least one talker;
  a group needs members.

The Manager's **Matrix** view shows this expansion: sources down, destinations across;
a cell is the function(s) behind it and can be edited (which edits the owning port's
function). It is a view; the port configuration is the truth.

## 5. Mixing

Every 10 ms mix-router:
1. Collects a frame from every live *in*: panel mics and hardware inputs (trim
   applied). Runs Vox detection on each.
2. Resolves gates: `always`; `key` from data-channel state; `vox` from step 1; then
   `onCall` from the routes already open (one pass, no chaining).
3. Conferences: sum of open incoming crosspoints × level.
4. IFBs: program (its `program` port's out) dimmed by `dim` while any interrupt into it
   is open, plus the open interrupts.
5. Panels and outputs: sum of open incoming crosspoints × level × (operator volume for
   panels) with N-1 for conference sources; then master volume or output trim; soft clip.
   Group destinations were expanded at config time.

Config from gateway → router is the port list (type, in/out capability, group members,
IFB program/destination/dim, trims, vox params) and the expanded crosspoint list with
gates. The router stays type-light: it evaluates gates and sums.

## 6. The phone (beltpack)

- Keys 1–6 show the label of the key's first function target (conference, person,
  group, IFB, output), with the target's subtitle. A listen key shows dimmed.
- **Reply** shows the last caller's label and talks back with `replyMode`.
- **Levels** edits the operator's own volume for every source this panel hears: the
  listen half of each key and every Always listen. Master volume on the dock.
- "Also hearing" lists Always listens with no key.
- Mic kill, reconnect, and connection-loss handling as in v1.

Data channel, phone → router:

```
{ type: "key", key: 1..6 | "reply", on }
{ type: "micOff", on }
{ type: "volume", source: portId, volume }
{ type: "masterVolume", volume }
{ type: "ping", hidden? }
```

Router → phone: `state` (keys down, volumes, master, last caller, which sources are
audible), `pong`.

## 7. Hardware nodes

A node registers with its interface's channel counts. In Manager → Hardware you tick
which channels are **in use**; each becomes an input or output port with its own trim,
and an in and an out can share a **pair** name ("Truck" → "Truck in", "Truck out").
The node carries one mono Opus track per port in use; changing the in-use set
renegotiates that node's session, changing functions does not.

## 8. Manager (model-level; UX to follow)

- **Ports**: the list (long name, label, alias, subtitle, type, online), filterable by
  type and node. A port's editor is its triggers and their functions, plus its
  type-specific fields. Panels show a beltpack preview.
- **Groups & conferences**: conferences, groups and IFBs with their members as derived
  from other ports' functions (T / L / interrupt / program), editable from here too.
- **Matrix**: the derived grid, editable.
- **Hardware**: nodes, channels in use, pairs, trims.
- **Live**: keys down, vox open, last callers; Needs attention (the constraints in §4
  plus node offline, panel offline with keys).

## 9. Migration from v1 state

Partyline → conference; each member panel gets a key with `callToConference`. PGM →
conference; the node's input 1 gets Always `callToConference`; listeners get Always
`listenToPort(conf)`. Direct → each side a key with `callToPort`. Hardware pack →
node ports with Always functions. Key volumes → operator volumes; trims carried.

## 10. Out of scope, still

Multi-site trunking, GPIO and logic, call signalling and beeps, dim panel speaker,
dim XP level as a standalone function, audiopatch, clone output, recording, accounts,
remote access, conference-of-conferences, dual-function keys, per-talker trim.
