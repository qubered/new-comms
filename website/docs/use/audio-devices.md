---
title: Choose audio devices
description: Select a microphone or speaker, recover permissions, and check a headset before use.
---

Open the three-dot **Menu → Audio devices** from the station picker or Talk screen. Choices made on the picker are used when you join; choices made while on a station are applied to the current connection.

[![Audio devices sheet with microphone and speaker selection and retry](/img/talk-devices.png)](/img/talk-devices.png)

<div className="caption">The device sheet in a browser that supports speaker selection. This example microphone is unavailable; Try again retries access.</div>

## Choose the microphone

1. Connect the intended headset or interface to the phone or computer.
2. Open **Audio devices**.
3. Under **Microphone**, choose the intended input, or **System default** to follow the system selection.
4. Allow microphone access if prompted.
5. Tap **Done**, open an agreed talk key, and ask another person to confirm the audio.

Do not rely only on the name in the list. A headset may expose different input and output devices, and a computer can keep using its built-in microphone while playing through headphones.

Device names may be hidden until the browser has been allowed to use a microphone. Generic entries such as **Microphone 1** are not a hardware fault. Choosing a microphone on the station picker only saves a preference; it does not itself request capture. Join your assigned station, allow microphone access, then reopen Audio devices and check the names again.

## Choose the speaker or earpiece

If the browser supports choosing an audio output, the sheet shows a **Speaker** selector. Choose an output and test it at low level. If the selector is absent, the sheet explains that the phone's system audio controls choose the output.

Browser support is detected on the device you are using. Do not assume another browser version or operating system will expose the same controls. When there is no Speaker selector, use the operating system's audio-route controls and confirm the actual destination by listening.

The app remembers input and output preferences in the browser, not in the show station. Private browsing or cleared site data can remove those choices. A saved device may no longer exist after a headset is unplugged; return to **System default** and retest rather than repeatedly selecting a stale entry.

## Recover from No mic

Listening does not require successful microphone capture. If the dock says **No mic**:

1. Check that the headset is connected and the correct microphone is selected.
2. Check the browser's site permission for the show's address. Allow microphone access there if it was denied.
3. Check that the page uses the supplied secure address and that the device trusts its certificate. See [HTTPS](../setup/https.md).
4. Open **Audio devices** and choose **Try again**, or tap **No mic** in the dock.
5. If another app or a phone call is holding the device, finish that activity, return to Talk and retry.
6. Confirm a short transmitted message with another operator.

Monitor keys and routes switching another source can still work without a microphone. Talk keys that use your own microphone and Reply remain unavailable until capture recovers. A device can also suspend capture when Talk is backgrounded; that is different from deliberately choosing **Mic off**.

## Headsets, speakers and Bluetooth

A headset reduces the chance that received comms will be picked up by your microphone. With loudspeakers, begin quietly and keep the microphone away from the speaker. Two nearby open stations can create an echo or feedback path even when the conference itself removes each listener's own contribution.

Talk requests echo cancellation, noise suppression and automatic gain control from the browser. The current UI has **no headset mode or processing-off switch**. The browser and device determine what processing is actually available.

Bluetooth behavior and delay depend on the headset, operating system and audio mode. Starting microphone capture can change its sound or audio route. Test the complete headset in both listening and talking conditions; do not assume a wireless headset's music playback behavior predicts intercom behavior. A wired headset is a useful comparison when investigating delay, but still needs a sound check.

For critical cue timing, measure and audition the actual devices. The synthetic [Latency test](../operate/latency.md) does not include the physical microphone or headphone path.
