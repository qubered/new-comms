---
title: Measure latency
description: Run the built-in software round-trip test and distinguish it from a full microphone-to-ear measurement.
---

Latency is the delay between an action and the sound reaching its listener. Test it on the actual network and devices you intend to use. A fast result on the show computer is not a measurement of a phone elsewhere in the venue.

The proposed physical acceptance target is a median of at most 100 ms and a 95th percentile of at most 150 ms from microphone to ear. These are targets, not a guarantee or a claimed measurement for your equipment. Real-phone, locked-screen and venue WiFi acceptance remains to be established on the devices in use.

## Prepare a safe test station

The built-in test takes over the station you choose. It sends a synthetic tone and markers as that station's microphone. Its normal configuration still matters.

Ask the operator to create a spare station named **Latency test**, without a PIN and with no microphone routes on Always, Vox or On call. Leave it out of production conferences and groups, and do not let someone else use it while testing. In its Manager editor, set **Master volume** to **100** and save so the returned markers are loud enough for detection. Keep the device's physical headphone/speaker volume low for comfort. Avoid incoming audio as well: other sound can interfere with marker detection.

A dedicated isolated station prevents test tones reaching program, IFBs or crew members. Only stations without PINs appear in the test selector.

## Run the built-in test

1. On Talk, leave your current station with **Menu → Switch station**.
2. From **Choose your station**, open **Menu → Latency test**.
3. Select the spare station under **Station to use (it is taken over while the test runs)**.
4. Choose **Run test**. Keep the page in the foreground for the whole run.
5. Wait through **Measuring… 1 of 20** to completion. A run takes roughly twenty seconds after connection and settling.
6. Record all results, including **Clicks heard**, the device, network location and test conditions.
7. Choose **Done** to leave the test. Rejoin your assigned station separately.

Opening the latency page leaves any active Talk station. The test needs no physical microphone: it generates its own signal. Do not run it on a production station just because that station happens to be the first one in the selector.

## Read the results

| Result | Meaning |
| --- | --- |
| **Round trip, best** | The shortest detected software journey in this run. It is not representative of every cue. |
| **Median** | The middle detected round-trip result, also called p50. |
| **95th percentile** | A near-slow-end result, also called p95. Compare it with the median to see variability. |
| **Worst** | The longest detected round trip in this run. |
| **Clicks heard** | How many of the 20 markers were detected. Missing markers make the result incomplete. |
| **One way, about** | Half the median round trip, assuming the two directions behave similarly. This is only an estimate. |

The software path includes browser audio processing along this synthetic path, encoding, the network, the mixer and the browser's receive path. It excludes the real microphone capture and acoustic headphone/speaker path. **Do not label the displayed one-way estimate “mic-to-ear latency.”**

Twenty markers are useful for comparisons and faults, but one short run cannot establish reliability over an entire show. Repeat in the worst working locations and representative network conditions. Keep the conditions consistent when comparing two setups.

## If the test fails

If there are no eligible stations, create an un-PINned spare station. If no audio comes back, check that the mixer is running and the device can establish audio on the network. If only some markers return, check for an interrupted connection, competing audio, an unexpectedly low test-station master volume or a backgrounded page.

Use the test station at full Talk master volume for measurement, with no other routed sources. Output hardware volume is a separate comfort control. If the test reports an error suggesting the station may already be in use, verify ownership and that no second browser is reconnecting to it.

## Measure the complete physical path

For full microphone-to-ear timing, use a sending device, a receiving device and a recording arrangement that captures both a reference impulse and the resulting output on a common timeline. For example, record a clear impulse beside the sender's microphone and the corresponding sound from the receiver's earpiece. Avoid feedback and keep the acoustic geometry repeatable.

Repeat the impulse many times. Measure each reference-to-return gap, then calculate the median and 95th percentile. Record the microphone, headset, operating system, browser, network location and whether the screen was on, locked or listening-only. If the reference and received sound are at different distances from the recorder, account for that acoustic travel difference.

Run separate tests for screen-on, locked-screen and listening-only use. The built-in foreground test does not validate those other conditions. See [Background and reconnect](../use/background-and-reconnect.md).
