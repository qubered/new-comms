---
title: Set your listening levels
description: Balance individual sources without changing what other operators hear.
---

Use the dock **Volume** slider for your overall listening level. Use **Levels** to balance a specific source against the others. Neither is a microphone-send control.

[![Director Levels view with independent Show and Cams sliders](/img/talk-levels.png)](/img/talk-levels.png)

<div className="caption">Levels changes what you hear from each source. The separate Volume control changes the whole listening mix.</div>

## Adjust the whole mix

1. Start with a modest phone or computer output volume.
2. Join your station and have a colleague speak at a normal level.
3. Adjust the dock **Volume** slider until the entire mix is comfortable.
4. If all audio is still quiet, check the operating system's output volume and selected headset before changing show routing.

The dock slider runs from 0 to 100. Zero silences the station's received mix. It does not release your talk keys or mute what your microphone sends to other people.

## Balance individual sources

1. Tap **Levels** above the keys.
2. Note that entering this view releases every active key. Any latched call or keyed monitor must be reopened afterward if still needed.
3. Find the source's label and adjust its **Level** slider.
4. Tap **Done** to return to the keys.
5. Reopen only the keys you need and confirm the balance in conversation.

The view includes configured incoming sources and currently reported sources, so a slider can appear even when its route is closed. Raising the slider does not open a key, start a feed or connect an offline microphone.

A conference appears as one source. Its slider changes the whole conference return for you; it is not a separate fader for each person in that conference. An IFB similarly appears as its combined feed. Direct callers and other physical sources can have their own entries.

If **No sources routed to this station** appears, changing volume cannot create a listening route. Ask the operator to check the station in [Manager](../configure/manager.md).

## Which control should change?

| Need | Control | Who it affects |
| --- | --- | --- |
| Everything in your headset is too loud or quiet | Talk dock **Volume**, then device output volume | Your listening path |
| Program masks conversation for you | Program source slider in **Levels** | Your balance |
| A whole conference is too loud for you | That conference's slider in **Levels** | Your conference return |
| One hardware input is wrong for everyone | Operator checks its physical input gain and input **Trim** | Every route using that hardware source |
| One interface output needs matching to connected equipment | Operator adjusts that output's **Trim** | That hardware output |
| A particular route needs a fixed level | Operator adjusts its function level in dB | That route's configured behavior |
| You need to stop sending your microphone | **Mic off** | Your microphone routes, not your listening mix |

Do not compensate for a distorted input by turning up another control. A clipped microphone or interface input needs correcting at the source; reducing receive volume merely makes the distortion quieter.

## Levels follow the station

Operator source levels and master volume are kept with the station by the show system. Another device taking over the same station can inherit its balance. Audio-device choices, by contrast, are remembered in that browser. Always check both during a handover.

A 100 setting is the full level of the configured route, not a promise of a particular sound pressure level. Hardware gain, route levels, IFB dim, source material and device output volume all affect what you hear.

For the operator's view of these controls, read [Levels and routing](../concepts/levels-and-routing.md).
