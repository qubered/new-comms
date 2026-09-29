---
title: Configure an IFB
sidebar_position: 6
---

An **IFB** gives a listener program audio and lets a director interrupt it. During an interrupt, program becomes quieter or cuts; the interrupt audio is added to the feed. When the interrupt closes, program returns to its normal level.

[![Talent IFB with PGM source, Talent output and minus 20 dB program dim](/img/manager-ifb.png)](/img/manager-ifb.png)

<div className="caption">A configured IFB from the demo rack: PGM feeds Talent; Director Key 4 interrupts it. The rack is an example inventory, not a connected physical device.</div>

Use an IFB for a presenter, announcer, or talent earpiece. Use a conference when the people need an ordinary shared conversation instead.

![Program and the director’s keyed interrupt enter the IFB. Program dims or cuts while the interrupt is open, and the combined feed reaches the presenter station or earpiece output.](/img/ifb-flow.svg)

*Release the interrupt to restore normal program. Program dim changes the program contribution, not the director’s voice.*

## Prepare the three parts

You need:

- A **Program** source: an input, station microphone, or conference mix.
- A **Destination**: the talent's Talk station or a hardware output feeding the earpiece.
- An interrupting source: usually a director's station, or a hardware input.

Create or enable those ports first. A group is not an IFB destination; the editor selects one station or output. A conference is supported as Program, but arbitrary chains of conferences and IFBs are not.

## Create the feed

1. Open **Ports → New port**.
2. Choose **IFB** as Port type.
3. Enter a name and Label, such as `Presenter IFB`.
4. Set **Program** to the intended source.
5. Set **Destination** to the talent station or earpiece output.
6. Set **Program dim**. Start with **−15 dB** if program should remain quietly audible, or choose **Cut** if the director should replace it completely.
7. Choose **Create port**.

The IFB supplies its feed to the selected Destination. You do not need to add a separate always-on listen just to make that automatic feed work.

The available Program dim choices are 0, −6, −12, −15, −20, −30, −60 dB, and Cut. **0 dB** leaves program at its normal level while the director speaks; it does not make the interrupt silent.

## Give the director an interrupt key

1. Open the director's station in Ports.
2. Select the desired numbered key.
3. Choose **+ Add function → Call to IFB**.
4. Select Presenter IFB.
5. Choose **Hold** for Key mode and leave the function level at 0 dB initially.
6. Choose **Save changes**.

Alternatively, select the IFB under **Groups & conferences**, choose the director in **Choose a port**, and click **Add member**. This saves a Call to IFB function on the station's first available key. Open the director's port afterward if you need a particular key number or mode.

## Test program, interrupt, and recovery

1. Play program audio and confirm the talent hears it with no director key pressed.
2. Hold the director's IFB key and speak.
3. Confirm the director is audible and program is reduced by the chosen amount.
4. Release the key and confirm program returns.
5. Check the director's level and the talent's listening level before the show starts.

Call to IFB does not give the director a return listen from the IFB. If the director should monitor program or the IFB feed, configure an appropriate Listen to function separately. The IFB is also not automatically a two-way talkback line from talent.

## Choose the interrupt trigger carefully

A held key is usually easy to reason about: the interrupt lasts as long as the director holds it. A Tap key leaves it interrupted until tapped off.

An **Always → Call to IFB** from a connected source keeps program dimmed even when that source is silent. Disconnecting the physical source releases the interrupt, but silence does not. Use [Vox](vox.md) if the interrupt should follow speech instead of remaining open.

Adding a hardware input as an IFB member in Groups & conferences creates an Always interrupt. Change it to Vox in the input's port editor if that is what the operator needs.

## Avoid a program path around the dim

If talent hears both the IFB and a separate direct Program feed, dimming the IFB cannot silence that separate feed.

1. Open the talent station or output and check **Incoming**.
2. Use Matrix to look for Program reaching talent directly as well as through the IFB.
3. Remove the unnecessary direct feed at its owning function and save.
4. Repeat the interrupt test.

An explicit Always Listen to or Route audio feed from this IFB to its own Destination can replace the automatically supplied feed. A keyed monitor can coexist with the automatic feed; parallel routes from the same source to the same destination do not double its audio. Check the actual Matrix routes when adjusting this arrangement.

See the [program and IFB recipe](../recipes/program-and-ifb.md) for a complete show example.
