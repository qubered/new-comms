---
title: A hardware microphone that calls a station on speech
description: Use a selected interface input and Vox to send a microphone directly to an operator.
---

This recipe connects a wired microphone to interface input 3 and lets its speech call the **Stage** station automatically. Stage hears the microphone and sees its incoming label. The microphone is an input-only port, so it cannot receive Reply audio.

First connect and start the bridge using [Hardware setup](../setup/hardware.md). Use an interface with at least three available inputs, or substitute a real channel number throughout this recipe.

## 1. Select the physical input

1. In Manager → **I/O nodes**, locate the intended bridge.
2. Under **Inputs**, tick channel **3** **In use**.
3. Set its **Short name** to `Stage mic`.
4. Leave **Trim** at `0 dB` for the initial check and choose **Save channels**.
5. Open the resulting input port from the channel row or find it in **Ports**. Verify its hardware channel is 3.

Selecting an input does not select the same-numbered output. This recipe needs no playback channel on the node.

Set the microphone/interface's physical input gain so normal speech is clean and has useful level. Supply microphone power only as appropriate for the microphone and interface. If physical setup is unfamiliar, have the audio operator handle it before changing software gain.

## 2. Prepare the receiving station

Create or identify a **Station** named `Stage`. Join it on a phone or laptop with a headset. For the first check, keep unrelated sources quiet so you can identify the hardware mic unambiguously.

No numbered key needs to be added to Stage. The route is owned by the input that initiates the call.

## 3. Add Vox calling

1. Open the `Stage mic` input in **Ports**.
2. In **Standing functions → Vox**, choose **+ Add function**.
3. Select **Call to port** and target **Stage**.
4. Leave the function level at `0 dB` initially.
5. In the **Vox** settings, start with **Threshold** `-40 dBFS`, **Attack** `20 ms` and **Hang** `600 ms`.
6. Choose **Save changes**.

These are starting settings, not a calibration for every microphone. The threshold is compared with the input's measured level after software input trim. Changing trim can therefore change when Vox opens, as well as how loud the source is.

## 4. Tune it in the real noise

1. Watch **Live** while speaking normally into the hardware mic.
2. Confirm Vox opens and Stage hears the voice. Stage's top bar should show **Stage mic calling** while the call is open.
3. Stop speaking. Confirm the call closes after the hang interval rather than staying open indefinitely.
4. Listen to normal room noise, movement and other likely sounds without speaking into the microphone.
5. If noise holds Vox open, raise the threshold toward `0 dBFS`. If normal speech fails to open it, lower the threshold, after checking physical input gain.
6. Adjust attack and hang only as needed. A longer attack can miss the start of words; too short a hang can make speech break up between syllables or phrases.
7. Save, repeat with the actual user and working position, and have Stage judge intelligibility.

Vox is a level detector, not a speech recognizer. Nearby noise can trigger it. Its signal detection also takes time: do not assume it will preserve every initial consonant or replace deliberate push-to-talk for critical short cues.

## 5. Explain Reply and mute behavior

Stage can hear this incoming call without having a matching key. Reply is unavailable for this input caller because the input has no earpiece. If a return message is required, provide a separate receiving station or hardware output and configure a deliberate return call to it. See [Direct and group calls](../configure/direct-and-group-calls.md).

**Mic off** on Stage mutes Stage's own microphone, not the arriving hardware mic. To stop the hardware feed in Manager, remove its Vox calling function and choose **Save changes**; alternatively, mute the microphone at its physical source. There is no separate function-enable switch in the port editor. Do not untick a routed channel as a quick mute: Manager rejects removal while it owns or is referenced by routes.

If the node disconnects, its physical-source routes close and the incoming indication releases. When it reconnects, Vox can open again on sufficient signal.

## Variations

To make the same microphone a conference contributor, use **Call to conference** under Vox and choose the conference. To route it continuously, use **Always** instead; the route then stays open during silence while the node is connected. Choose the behavior deliberately so background room noise does not become a permanent contribution.

For a speech-driven IFB interruption, use **Call to IFB** under Vox and test both opening and restoration of program. Work through [Program and IFB](program-and-ifb.md) before combining the two recipes.

See [Vox](../configure/vox.md) for trigger setup and [Hardware channels](../configure/hardware-channels.md) for inventory, naming and trim changes.
