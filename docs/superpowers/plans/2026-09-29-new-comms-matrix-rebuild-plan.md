# new-comms v2 — Rebuild plan

**Spec:** `docs/superpowers/specs/2026-09-29-new-comms-matrix-design.md` (rev 3)
**Mockup:** `docs/design/mockups/manager-v2.html`
**Style:** rapid prototyping. Phases, not tasks. Each phase ends with something you can run.

**Implementation status (29 September 2026):** phases 0–6 software implemented and
verified. Physical phone/WiFi/second-machine acceptance remains unverified; the user
requested software completion and documentation of those checks because devices were
unavailable. Results and remaining acceptance work:
[`v2 verification`](../../research/2026-09-29-v2-verification.md).

What changes: the data model (ports, triggers, functions, derived matrix) and everything
that touches it. What stays: the process layout (mix-router on TCP control, gateway,
Talk, Manager, comms-node), WebRTC/Opus transport, SSE snapshot + deltas, schema-first
protocol, HTTPS serving, heartbeat and reconnect handling, latency tooling. v1 stays on a
tag (`v1-channels`) so it can be run for comparison.

## Phases

### 0. Model and protocol

`packages/protocol`: new schema for `Port`, `Trigger`, `Function`, `Crosspoint`, the
live state (keys down, vox open, incoming calls, last caller, volumes) and the REST
bodies. One shared, tested TS module does the work everything else depends on:
**expand(ports) → crosspoints with gates**, plus the constraint checks from spec §4
(six keys, acyclic, IFB needs program and destination, groups have members, no
group as source). A migration turns a v1 `state.json` into ports and functions.

Done when: `expand()` reproduces the mockup's matrix from the mockup's data, the
constraint checks have tests, and the seed script writes a v2 show.

### 1. mix-router

Replace the channel/pack mixer with the routing graph from spec §5: ports with in/out,
crosspoints with gates (`always`, key *n* on port, vox on port, onCall on port), key
state by key number over the data channel, **vox detection** with threshold/attack/hang
per port, conferences with N-1, IFB program dim, groups expanded at config time, operator
volumes per source. Sessions carry **one Opus track per port**, so a node session has
N sendonly and M recvonly tracks and a station has one each.

Latency work rides along, since it is all in the router (research:
`docs/research/2026-09-29-competitors-latency-hardware.md` §4.4):
- **Adaptive jitter queue per peer**: target the measured p95 arrival jitter with a
  one-frame floor, drain gradually when above it, Opus PLC on underrun instead of
  re-priming. Today a burst can sit at 80 ms and never drain. Queue depth in stats.
- **Keep phones awake**: stations always send, silence included (no DTX, no recvonly),
  so WiFi power save never holds their downlink for a beacon.
- **DSCP EF (46)** on the router's UDP socket, so WMM access points use the voice queue.
- **5 ms mixer tick**, browser uplink stays 10 ms; 5 ms downlink frames only if the
  smoke test and a real phone show it pays.
- **Log the Opus TOC byte** per peer, to see what browsers actually encode.

Done when: the smoke test (real router, real str0m clients) proves: party line N-1,
input on Always into a conference, input on Vox calling a station directly (the Dante
In 10 case), a group call reaching two members, an IFB dimming program during an
interrupt, a listen key, a station hearing a source only when a key on *another* port
is down, and a multi-track node session. Latency floor re-measured, and a burst of late
packets drains back to target within a second.

Decisions this phase settles: vox measurement window; whether onCall needs a second
pass; whether unrouted node tracks are worth muting.

### 2. Gateway

Ports CRUD (station, conference, group, IFB by hand; I/O ports from node registration
with the in-use set), function editing per trigger, constraint errors as 4xx with the
spec's wording, `expand()` pushed to the router on every change, node registration →
I/O ports, sessions per station and per node, live state (keys, vox, incoming, last
caller) fanned out over SSE. Migration runs on load. Old routes go.

Done when: `curl` can build the mockup's show from nothing, `/events` shows a vox-open
input and a key down as they happen, and a v1 `state.json` loads as a v2 show.

### 3. Manager

Rebuild to `manager-v2.html`: Ports (table + editor with keys, standing functions,
Incoming), Groups & conferences (derived members, add-member writes a function), Matrix
(derived, click-to-owner), I/O nodes (in-use, short names, trims), Live (open now,
Needs attention). Reuse the v1 shell, API client and SSE hook.

Done when: the mockup's show can be built from scratch in the Manager and every page
shows the same state as the gateway.

### 4. Talk

Keys by number with headings from the key's first function target; listen keys shown
dimmed; **Reply** lit by the last caller, mode per station; incoming-call name in the
top bar; **Levels** per source heard (key returns and Always listens); "Also hearing";
station picker lists station ports. Audio devices, background listening, reconnect and
latency test carried over.

Done when: the mockup's phone matches on a real phone, including a Vox call from a
hardware mic showing the caller's name with no key.

### 5. comms-node

Multi-track session (one track per in-use channel in each direction), in-use set and
per-port trims pushed over the data channel, renegotiation when the set changes,
registration that survives gateway restarts.

Done when: a real interface on a second Mac or a Pi has two inputs and two outputs
routed independently ("in 3 → SHOW", "SHOW → out 7") and Vox on an input calls a phone.

### 6. Harden

Reconnect drills across all three peers, iOS Safari on a real phone, README rewritten
for the port model. Latency measured on WiFi as p50 and p95 per client type (screen on,
screen locked, listen-only) from `getStats` and router stats, and written down with a
restated target (proposal: p50 ≤ 100 ms, p95 ≤ 150 ms on the recommended WiFi). A short
WiFi recipe in the README: dedicated 5 GHz SSID, channel 44 or 149, WMM on, DTIM 1, TWT
off. Headset mode (echo cancellation off) measured and kept only if it saves time.

## Order

0 → 1 → 2 in sequence (each is the next one's contract). 3 and 4 in either order after
2; 5 after 1 and 2. Do not touch React until the smoke test in phase 1 passes.

## Decide by doing

- Whether `expand()` runs only in the gateway or also in the Manager for instant
  feedback (start: gateway only, Manager reads the derived matrix from the snapshot).
- Track count per node session before it hurts (start: everything in use; measure on
  a Pi at 8+8).
- Whether the phone needs the full port list or only what its keys reference (start:
  full snapshot, as v1).
