# v2 implementation and verification — 29 September 2026

The software in phases 0–6 of the matrix rebuild plan is implemented on top of main
`573bfe7`. Physical acceptance remains outstanding. The user confirmed that phones
and a second Mac/Pi with a multichannel interface were unavailable and requested
completion of software checks with the unverified device tests documented.

## Automated checks

All of the following passed on macOS:

| Command | Result |
| --- | --- |
| `npm run typecheck` | All workspaces; generated protocol types current |
| `npm test` | 54 tests: Talk 6, protocol 10, gateway 17, router 15, node 5, audio host 1 |
| `npm run build` | Manager and Talk production bundles |
| `npm run smoke` | Release router, real str0m peers, v1 reference and v2 scenarios |

The v2 smoke covers conference N-1 and keyed microphone, Always input into a
conference, Vox hardware calling with incoming state, group call, IFB program dim,
listen keys, a key owned by another port, two independent inputs and outputs in one
node session, gateway reconnect, stale control rejection, station takeover and
disconnect. An injected 80 ms packet burst recovered within 900 ms; the final sample
was queue 28.35 ms versus target 18.35 ms (within one 10 ms packet).

Tests also cover route validation, v1 migration including hardware receive levels,
PIN redaction and preservation, inventory consistency, SSE synchronization,
operator-volume persistence across control reconnects, sparse audio channels,
stable node identity, Opus settings and nearest-rank percentile calculation.

## Browser and local audio checks

Manager was exercised against a disposable show: create a station, assign a key,
follow matrix cells to their owning editor, select node circuits and short names,
add a Vox call and inspect Incoming, and add group membership through its derived
view. Changes appeared in the gateway and Talk through SSE.

Talk was tested with the browser pane's microphone unavailable. It connects with a
continuous silent sending track while microphone permission is pending; listen keys
and source levels remain usable. A source level of 65 persisted. Router restart
caused reconnect and released the old key. The 390 × 844 layout was visually checked.

A local BlackHole 64-channel CoreAudio device exercised the actual CPAL → Opus →
WebRTC path with two input and two output tracks. Selection changed to inputs 3/5
and outputs 7/9, including interleaved global port order, and the session replaced
automatically. Input 3 at −6 dB produced approximately 0.05 from a 0.1 tone, consistent
with the trim being applied once. Output 7's −3 dB trim and circuit identities
survived gateway restart. The generated input-3 tone opened Vox and Talk displayed
“Virtual test bridge in 3 calling”; Reply correctly had no eligible caller because
an input-only port cannot receive audio.

This is local virtual-device evidence, not proof of physical interface output or
cross-machine networking. Transient browser queue samples around 80 ms were observed
and returned to 10–20 ms by the following two-second sample; sustained growth was not
observed after the final router restart. Longer runs under real network load remain
necessary.

## Latency results and limits

| Measurement | Samples | Best | p50 | p95 | Worst |
| --- | --- | --- | --- | --- | --- |
| str0m impulse loopback smoke | 20 | 14 ms | 27 ms | 32 ms | 32 ms |
| In-app Chromium synthetic browser round trip | 20/20 received | 47 ms | 57 ms | 116 ms | 194 ms |

The browser measurement uses the built Talk latency page, a synthetic AudioWorklet
source and router echo on localhost. The p95 uses nearest rank. These figures exclude
physical microphone/speaker delay and WiFi, and the two measurement paths are not
interchangeable. Half of round trip is only a rough estimate assuming symmetric
paths; it does not establish mic-to-ear performance.

The proposed physical acceptance target remains p50 ≤ 100 ms and p95 ≤ 150 ms on the
recommended WiFi. It has **not** been verified.

## Physical acceptance still to run

| Test | Status |
| --- | --- |
| iPhone Safari and Android, screen on/locked/listening only, repeated mic-to-ear p50/p95 | Not run; devices unavailable |
| WiFi roaming, power save, background audio and prolonged lock/reconnect | Not run |
| Second Mac/Pi physical interface, independent inputs 3/5 and outputs 7/9 | Not run; local virtual-device substitute only |
| Physical hardware microphone Vox call to a phone | Not run; local browser substitute only |
| Pi 8-input + 8-output load, CPU and queue growth | Not run |
| Echo cancellation off/headset latency comparison | Not run; default cancellation retained |
| 5 ms downstream packets versus 10 ms on a real phone | Not run; 10 ms retained as required by the plan's evidence gate |

For each phone type, capture at least 20 impulses per mode with router queue stats
and browser getStats, then report p50/p95 separately. Use the README WiFi recipe and
record access point, signal level, interface, OS/browser and audio devices. Repeat
reconnect/takeover and long-running locked-phone tests before live-show use.

## Implementation choices

The gateway expands routing and sends the derived matrix to both UIs. Talk keeps the
full snapshot. All selected node tracks remain active, including silence. Vox uses
a 10 ms RMS window; defaults are 20 ms attack and 600 ms hang. On-call gating is
resolved in one pass without recursive call propagation. The mixer ticks at 5 ms
while downstream Opus remains 10 ms. Empty conferences are attention items so they
can be created before adding members. IFB program feeds may originate from a
conference, as shown in the reference mockup.

The old public REST routes are removed. Legacy protocol definitions and the v1
router smoke path remain for migration/reference checks; the runnable v1 application
is preserved at `v1-channels`.
