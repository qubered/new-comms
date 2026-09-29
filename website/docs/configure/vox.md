---
title: Set up voice activation with Vox
sidebar_position: 7
---

**Vox** opens functions when a station microphone or hardware input has enough signal. It is useful for a wired microphone that should join a conference only while someone speaks, or for an operator who cannot hold a key.

[![Input port with a Vox-gated conference call and threshold attack and hang controls](/img/manager-vox.png)](/img/manager-vox.png)

<div className="caption">The demo desk input calls Show when Vox opens. Always is empty, so it does not bypass the activity gate.</div>

Vox detects audio level, not words. Room noise, music, handling noise, and loudspeakers can all open it if they cross the threshold.

## Put a hardware microphone into Show on speech

1. Enable the microphone's channel in **I/O nodes** and give it a clear label.
2. Open that input in **Ports**.
3. Under **Standing functions → Vox**, choose **+ Add function**.
4. Choose **Call to conference** and select **Show**.
5. If the same microphone already has **Always → Call to conference → Show**, remove that Always function. Otherwise it will remain audible regardless of Vox.
6. Start with the default Vox values: **Threshold −40 dBFS**, **Attack 20 ms**, and **Hang 600 ms**.
7. Choose **Save changes**.
8. Open **Live**, speak into the microphone, and watch its **Vox** indication and level meter. Ask a station on Show to confirm the sound.

For a direct voice-activated call, choose **Call to port** and target a station instead. The receiving station sees the input's label while the call is open. It cannot Reply to a hardware input because that input has no return output.

## What the settings mean

| Setting | Meaning | Effect of increasing it |
| --- | --- | --- |
| Threshold (dBFS) | The input level needed to start opening Vox | A less negative number requires louder audio |
| Attack (ms) | How long the input must exceed threshold before opening | Rejects brief noises, but may lose the beginning of speech |
| Hang (ms) | How long to remain open after audio drops below threshold | Keeps short pauses together, but leaves room noise open longer |

Threshold is a digital input level. −30 dBFS is a higher threshold than −40 dBFS. If normal speech never opens the route, move the threshold lower, for example from −40 to −45. If room noise keeps it open, move it higher, for example from −40 to −35.

The editor allows threshold from −100 to 0 dBFS, attack from 0 to 1000 ms, and hang from 0 to 10000 ms. These ranges are adjustment limits, not recommended starting points.

## Tune it in the actual room

1. Set the microphone and hardware gain for normal speech first.
2. Leave the microphone in its operating position and listen to the room with no one speaking.
3. Adjust Threshold until ordinary background noise does not keep Vox open.
4. Speak at the quietest level the operator is likely to use. Confirm the opening words are intelligible.
5. If short noises cause unwanted openings, increase Attack a little. If opening syllables disappear, reduce Attack or lower Threshold.
6. Speak a sentence with natural pauses. Adjust Hang so it does not chop words or stay open unnecessarily.
7. Recheck after the room fills with people or program loudspeakers become active.

Do not try to compensate for a poorly placed microphone with very long attack times. Position, physical gain, and headset isolation often matter more than the threshold number.

## Use Vox on a station

The same Vox section is available on a station. Add the desired function to its Vox trigger and test with that station connected in Talk and its microphone available.

A station's **Mic off** prevents its microphone contribution and Vox opening. A disconnected station or input cannot keep a Vox route active. Restoring connectivity lets Vox respond to input again; nobody has to re-hold a key for an unattended Vox configuration.

Vox is set per port, so all functions on that Vox trigger share the same threshold, attack, and hang. If a microphone needs two different destinations to open together, add both functions to its Vox row.

## Check for another open path

If the listener still hears the microphone while Vox is closed, inspect its Always functions, other keys, and Matrix. Vox only controls the functions attached to Vox; it does not close a separate route.

For IFB interruptions, confirm program recovers after Hang expires. If program stays dimmed, look for another open interrupt, especially an Always interrupt from a connected silent microphone.

Follow the [hardware microphone recipe](../recipes/hardware-microphone.md) for a complete setup.
