---
title: Levels and routing
sidebar_position: 4
---

A route decides where audio goes. A level decides how much of it is heard. Change the control closest to the problem: use an operator's source volume for a personal preference, a function level for a route adjustment, and hardware trim for an interface level mismatch.

## Which level control should I use?

| Control | Where | Affects |
| --- | --- | --- |
| Source level, 0–100 | Talk → Levels | One source in this station's mix |
| Volume, 0–100 | Talk's bottom dock | Everything this station hears |
| Master volume, 0–100 | Manager → station editor | The same station-wide listening level |
| Function level, dB | Beside a function in Manager | That configured audio route |
| Trim (dB) | I/O nodes or a hardware port editor | That physical input or output channel |
| Program dim | IFB editor | How much the IFB reduces program during an interrupt |

A function level of **0 dB** means no change. Negative values reduce the level; positive values increase it. This is different from a 0–100 volume slider, where **0** means silence and **100** is full level.

Function levels range from −100 to +24 dB. Hardware trims range from −24 to +24 dB. Begin at 0 dB and make small adjustments while someone listens. Raising software level cannot repair a distorted microphone or an overloaded hardware input.

## Separate personal mix from show balance

Suppose Lighting finds Program too loud but everyone else is happy.

1. On Lighting's Talk screen, open **Levels**.
2. Lower the **Program** source slider.
3. Leave the source's hardware trim and shared functions alone.
4. Choose **Done** and check that speech is easy to understand.

Opening Levels releases all active keys, including keyed monitors. Choose Done and reopen any required key to audition the result; Always feeds and permanent conference returns do not need reopening.

Only Lighting's mix changes. If Program is too loud everywhere, check its physical source and configured function levels instead. The [operator levels guide](../use/levels.md) covers the Talk controls.

Conference volume controls adjust the conference as a source. They are not separate faders for every person in the conference. There is no operator control for turning just one conference participant down while leaving the rest unchanged.

A **Call to conference** function produces both a microphone contribution and a listening return for a station. Its one function level applies to both directions. To change only that operator's return, use the conference source slider in Talk rather than changing the conference-call function level.

## Conference returns and N-1

A conference adds its open microphone contributions together. Each listener receives that mix with their own contribution removed. This is often called **N-1** or mix-minus: everyone except yourself.

That protects against hearing your own voice returned through the conference. It does not prevent a nearby loudspeaker being picked up by your microphone. Use headsets and sensible physical separation when testing two stations in the same room.

## Parallel routes do not double the same connection

If several open functions connect the same source directly to the same destination, new-comms carries that source once at the highest active gain. It does not add another copy for every function.

For example, an Always route sends Program to Stage at −12 dB and a held key provides the same source-to-destination route at 0 dB. Stage hears Program at 0 dB while the key is held, then at −12 dB when it is released. Two routes at 0 dB do not make a +6 dB sum.

This also applies to conference contributions and a Reply route overlapping an existing direct route. For IFBs, program dim is applied before comparing parallel gains. The individual functions still exist and can be open together; Matrix shows that ownership rather than hiding the quieter function.

This rule is about the **same source and destination**, not every possible path through the show. A direct Program feed and a separate IFB feed into the same listener are different sources at that listener. Avoid adding an extra direct program route that bypasses the IFB's intended dim.

## Open, connected, and audible are different checks

- **Connected** means a physical station or hardware channel has a live audio connection.
- An **open route** means its trigger permits audio to pass.
- A moving **level meter** means signal is present.

An Always route from a connected but silent microphone is open. It can still show an incoming call or keep an IFB interrupted. Vox is the appropriate trigger when signal presence should decide whether it opens.

When a physical source disconnects, its routes close, including Always calls and IFB interrupts. Conferences and IFBs are virtual mixes and do not need their own device sessions; an open bus return can exist while the bus is silent.

Use [Matrix](../configure/matrix.md) to inspect configured and open routes, and **Live** to check connections, keys, Vox, incoming callers, and input levels. A highlighted Matrix entry alone is not proof that useful sound is reaching someone's headphones.
