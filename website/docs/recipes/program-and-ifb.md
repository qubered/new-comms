---
title: Program to talent with an IFB interruption
description: Feed program to a talent station and let a director interrupt it with a controlled dim.
---

This recipe sends a program input to a talent station. A director's key adds the director's microphone and dims program while the key is active. Releasing the key restores normal program.

You need a working program source on a registered hardware node, a talent station and a director station. This example uses a phone as the talent's earpiece; a hardware output can be the IFB destination instead.

## 1. Make the program input available

1. Follow [Hardware setup](../setup/hardware.md) to start the bridge and connect the program feed to the intended interface input.
2. In Manager → **I/O nodes**, find the correct node.
3. Tick the physical input channel **In use**.
4. Give it the short name `Program` and choose **Save channels**.
5. In **Ports**, inspect the resulting input port. Confirm its hardware channel number matches the cable.

Start with its trim at `0 dB`, unless the connected equipment requires a known correction. Check the interface's input level; an overloaded input stays distorted even if the listener later turns it down. See [Hardware channels](../configure/hardware-channels.md).

The program input does not need an extra Always function just to be selected as the IFB's program source. The IFB configuration supplies that feed.

## 2. Create the listener and director

Create **Station** ports named `Talent` and `Director` if they do not exist. For this initial test, leave Talent without conference or program-listen functions. This makes it easier to hear exactly what the IFB is delivering.

Do not use the same station on both devices. If the director already has a production station, choose a spare numbered key for the interruption.

## 3. Create the IFB

1. Open **Ports → New port** and choose type **IFB**.
2. Set its name and label to `Talent IFB`.
3. Set **Program** to the `Program` input.
4. Set **Destination** to `Talent`.
5. Set **Program dim** to `-15 dB` as a starting point.
6. Choose **Create port**.

The IFB automatically feeds its configured destination. You do **not** need to add another listen function on Talent to complete it. Another station can monitor the IFB with a Listen to function if required.

At this point, the connected Talent station should hear program with no director key pressed. If not, check program capture, Talent's volume and the selected destination before adding an interruption.

## 4. Give the director an interrupt key

1. Open Director in **Ports**.
2. Select an unused numbered key.
3. Set **Key mode** to **Hold**.
4. Choose **+ Add function**, then **Call to IFB**.
5. Select **Talent IFB**, leave the function level at `0 dB`, and choose **Save changes**.

The key's label on Talk comes from the IFB. Holding it contributes the director microphone as an interruption; releasing it ends the interruption.

## 5. Test both states

1. Join Talent and Director on their respective devices and fit headsets.
2. Play recognizable program at a suitable source level.
3. Confirm Talent hears it normally.
4. Have Director hold **Talent IFB** and speak.
5. Confirm Talent hears Director clearly and program reduces while the key is held.
6. Release the key and confirm program returns to its original level.
7. If needed, adjust **Program dim** in Manager, save and repeat. **Cut** removes program during an interruption; `0 dB` leaves it unchanged.

Balance Talent's overall earpiece level with the Talk dock Volume. Its IFB source slider changes the whole combined feed; use the IFB's dim and the director function's level to establish the relationship between program and interruption.

## Avoid the two common traps

Do not also feed un-dimmed **Program** directly to Talent. That is a different source route from the IFB, so it can remain audible while the IFB is dimming its own copy. Check Talent's **Incoming**, Levels sources and Matrix if the dim seems ineffective.

Do not put **Call to IFB** on **Always** unless a continuous interruption is intentional. A connected Always interrupter counts as open even during silence. Use a key for deliberate interruption, or [Vox](../configure/vox.md) when the interruption must follow a microphone's signal. The interrupted feed restores when the source disconnects; silence while still connected is different.

For further configuration, see [IFB](../configure/ifb.md), [Program and listen](../configure/program-and-listen.md) and [Levels and routing](../concepts/levels-and-routing.md).
