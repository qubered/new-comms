---
title: Talk and listen
description: Use Hold, Tap and Tap/hold keys, understand incoming calls and Reply, and mute your microphone safely.
---

Your station can have up to six numbered keys, plus **Reply**. Manager decides what each key does and how it responds to a press. A key's heading comes from its first function's target; it can have additional functions that are not all named on the tile. Ask the operator about any key that affects more than one destination.

[![Director Talk keys in listening-only mode with microphone unavailable](/img/talk-keys.png)](/img/talk-keys.png)

<div className="caption">Talk on a phone-sized screen. This browser cannot supply a microphone, so talk keys are unavailable while listening remains connected.</div>

## Use the right key gesture

Manager calls the three modes **Hold**, **Tap** and **Tap/hold**.

| Mode | Turn it on | Turn it off |
| --- | --- | --- |
| **Hold** | Press and keep holding. | Release. |
| **Tap** | Tap once. It stays active. | Tap again. |
| **Tap/hold** | A short tap latches it on; holding opens it for the duration of the hold. | Tap a latched key again, or release after a hold. |

For Tap/hold, a press shorter than about 350 ms counts as a tap. If you intended a temporary call but released very quickly, check whether **Latched** is still showing. On a laptop, focus an enabled key and use Space or Enter with the same press/release behavior.

A red active talk key means that key opens your microphone route. A latched call remains open through pauses in your speech. Turn it off when finished. Listen-only keys use a dimmed appearance and show **Listening** when active rather than a red microphone indication.

## A conference key is a party line

A **Call to conference** key provides a permanent listening return. You do not need to hold the key to hear the conference. Pressing the key adds your microphone; releasing it stops that contribution but keeps the return.

Each listener receives the conference without their own contribution. If you hear your own voice, do not assume the normal conference return is responsible: another open speaker, a second device or an additional configured route can send it back.

When other people contribute to the conference, the key can show their names and activity bars. More than one contributor is represented with a name and a `+` count. These are useful routing and activity indications, not proof that every listener has a working headset.

## A listen key only monitors

A **Listen to** function on a key opens a listening route while that key is active. Use its configured Hold, Tap or Tap/hold gesture. A **Listen to** function on **Always** needs no key and is listed under **Also hearing**.

“Also hearing” is not a complete inventory of everything that can reach your ears. Conference returns, incoming calls and routes owned by other ports can also be audible. **Levels** shows the sources routed to your station, including those that are not currently open.

A key can also switch **Route audio** between other ports. It remains usable with your microphone off if none of its functions needs your microphone. Its tile is treated as a monitoring/control key even when the audio destination is elsewhere.

## Incoming calls and Reply

A direct or group call to your station appears in the top bar as the caller's label followed by **calling**. Several callers can appear together.

If your station has Reply configured, **Reply** shows the last caller you can reply to. Press it using the station's Reply mode. You do not need a spare numbered key for that return call.

A hardware **input** can call your station, but it has no output to hear a reply. Its name can therefore appear in the top bar while Reply says **No caller to reply to**. Do not use Reply as a general “talk back to whatever I hear” button: conference audio and ordinary listen routes do not select a last caller.

Check the name under Reply before speaking. It can retain an eligible last caller after that person's call ends; it is not a guarantee that the person is still connected. A later call can change the target.

## Mic on, Mic off and No mic

The dock button describes your local microphone state:

- **Mic on**: a microphone is available. Whether it reaches anyone depends on your keys and automatic routes.
- **Mic off**: you deliberately muted it. Your microphone routes are suppressed and microphone keys are released. Unmuting does not re-latch those keys.
- **No mic**: capture is unavailable, for example because permission was denied or the device was disconnected. Tap it to try acquiring the microphone again; **Audio devices** also offers **Try again**.

Mic off does not silence your earpiece. Pure listen keys and keys routing another source remain usable. A mixed key that both monitors and opens your microphone is treated as a microphone key, so it is unavailable while muted.

Always and Vox functions do not depend on a numbered key. When you turn the mic back on, an Always microphone route can resume immediately and Vox can reopen when you speak. Releasing numbered keys is not a substitute for mic kill on a station with automatic microphone routing.

## Before changing screens

Entering **Levels** releases all active keys, including latched calls and keyed monitors. Returning with **Done** does not restore them. This prevents a hidden control from leaving a call open. Always routes remain configured; Vox still follows its trigger unless the microphone is muted.

For a station handover, use **Menu → Switch station**. For a connection interruption, follow [Background and reconnect](background-and-reconnect.md). For receive balance, see [Levels](levels.md).
