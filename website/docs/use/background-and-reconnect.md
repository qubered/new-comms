---
title: Background use and reconnecting
description: Understand what happens when a phone locks, another app interrupts audio, or a connection drops.
---

Talk attempts to keep audio and its connection running, but a browser cannot guarantee continuous operation when the operating system locks the screen, suspends a tab or gives another app control of audio. Test the exact device and headset before depending on background listening.

Physical iOS/Android lock-screen behavior, venue WiFi latency and long-running use on real devices still require acceptance testing. Software checks are not a substitute for that show-day test.

## Keep the active station available

For the most predictable operation, keep Talk in the foreground on a powered device. The app requests that the screen stay awake where supported, but operating-system policy can refuse or release that request. Confirm what your phone actually does.

If you need to lock the screen or use another app:

1. Release any latched microphone keys you do not need. Use **Mic off** if the station has automatic microphone routes and you must stop all transmission.
2. Have a colleague send regular spoken checks while you background or lock the device.
3. Leave it in the intended condition long enough to represent real use, not just a brief screen-off test.
4. Return to Talk. Check the connection, microphone indication and audible return.
5. Test a fresh talk-key press and have the colleague confirm it.

Backgrounding alone is not a command to release every latched key. Do not rely on locking the screen as a mute gesture. Keep automatic and latched routing intentional.

## When audio is interrupted

Phone calls, other media apps, headset changes and operating-system power management can pause playback or suspend the microphone. On returning to the foreground, Talk attempts to resume playback, reacquire the microphone where needed and restore its connection.

If you hear nothing, first check the system output route and volume. If **No mic** appears, use [Audio devices](audio-devices.md) to recover capture. If **Reconnecting…** appears, wait for it to clear before relying on a talk key.

## Connection loss releases keys

When Talk detects a lost connection, it shows:

> Lost the connection. Keys are off until it comes back.

It reconnects automatically. A recovered session starts without your previous keyed calls. Check that you can hear, then press or latch the required key again. Do not assume a previous latch was restored.

There can be a short delay before a failed connection is detected, especially while a browser is backgrounded. For an intentional stop or handover, use **Mic off** or **Menu → Switch station** instead of switching off WiFi and waiting for a timeout.

Always routes are standing configuration, not remembered key presses. They can resume when the source reconnects. Vox can reopen when it receives sufficient signal. If an automatic source must stay silent after recovery, its operator needs to mute or reconfigure it deliberately.

## The web page and audio are separate

The show has a management connection and an audio connection. Existing audio can continue through a brief gateway restart while Manager or the picker temporarily shows stale or disconnected information. If the mixer itself restarts, audio must reconnect.

Treat an audio sound check as the confirmation, not just the appearance of a green indicator. If a page remains stale after service recovers, return to the foreground; if necessary, leave the station and rejoin once. Avoid opening multiple tabs on the same station.

For repeated interruptions, work through [Troubleshooting](../operate/troubleshooting.md). Do not keep resetting the whole show when the issue affects only one phone.
