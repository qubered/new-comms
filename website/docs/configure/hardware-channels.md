---
title: Enable and name hardware channels
sidebar_position: 10
---

A hardware node makes an audio interface's capture and playback channels available to the show. Use **I/O nodes** to choose which channels are in use. Each enabled input or output becomes its own port, with independent functions, name, and trim.

[![Demo rack with two selected inputs and one selected output](/img/manager-hardware.png)](/img/manager-hardware.png)

<div className="caption">Only checked channels become ports. This screenshot uses a demo inventory; it does not show a tested physical interface.</div>

If no node is listed, follow [Connect audio hardware](../setup/hardware.md) first. This page begins once the node has registered and its channels appear in Manager.

## Enable the channels you need

1. Open **I/O nodes** and find the correct node card.
2. Under **Inputs**, tick **In use** for the capture channels you need.
3. Under **Outputs**, tick **In use** for the playback channels you need.
4. Enter useful **Short name** values, such as `Program`, `Announce mic`, and `Talent ear`.
5. Leave **Trim (dB)** at **0** initially.
6. Choose **Save channels**.
7. Wait for the node's audio connection to settle, then open **Ports** and filter by that node.

Input and output channel numbers refer to the interface's actual channels. Enabling only input 3 does not make it input 1. Confirm the interface's own channel labeling and cables when testing.

Changing the In use set rebuilds that node's audio connection and can briefly interrupt its audio. Make channel-set changes before the show where possible. Editing functions or trim does not require choosing a different channel set.

## Give each channel a job

Enabling a channel makes the port available; it does not automatically route it anywhere.

Examples:

- Input microphone → **Vox → Call to conference → Show**.
- Program input → heard through **Always → Listen to → Program** on each receiving station.
- Earpiece output → selected as an **IFB Destination**.
- Monitor output → **Always → Listen to → Show**.

Select the channel's name button in I/O nodes to open its port, or find it in Ports using the node filter. Set its functions and **Save changes**.

See [Vox](vox.md), [Program and listen keys](program-and-listen.md), and [IFB](ifb.md) for the full procedures.

## Names and trims

A channel's Short name becomes its port Label when you save the channel settings. The full port name still helps identify its node, direction, and physical channel number. If you need to change the displayed label after clearing a short name, edit **Label** in the port editor explicitly; clearing the channel field does not necessarily restore an earlier label.

Trim changes the level of that physical input or output. The range is −24 to +24 dB, with 0 dB meaning no adjustment. Trim can be edited in I/O nodes or in the hardware port editor; both affect the same channel.

### Adjust a channel level

1. Confirm the interface's physical gain and the connected equipment are set appropriately.
2. Feed representative signal into the input, or listen at the intended output device.
3. Make a small Trim change and save it.
4. Recheck the level and intelligibility at the destination.
5. Keep the setting consistent with the rest of the show's sources.

Use a station's personal **Levels** control if only one operator wants a source quieter. Hardware trim changes the source or output itself and can affect everyone using it.

## Remove an unused channel safely

A channel cannot be disabled while it still owns functions or is referenced by other routes, group membership, or an IFB.

1. Open the channel's port and remove its own functions, then save.
2. Check **Incoming** and Matrix for routes into it or raw routes using it as a source.
3. Remove it from groups and change any IFB Program or Destination assignments that use it.
4. Return to I/O nodes, untick **In use**, and choose **Save channels**.

If Manager says the channel is routed, the change has not been applied. Review the remaining functions and references before trying again. Unticking a routed channel is not a shortcut for muting it during a show.

Re-enabling a removed channel creates a new port. Do not assume its old functions or references will be restored automatically.

## Drafts and live updates

Channel edits show **Unsaved changes** until Save channels succeeds. You can visit Ports or Live and return without losing the draft. The global Unsaved changes banner provides a shortcut back to it.

A pending save stays locked when you leave and return. A failed save keeps the draft. If the node disappears from the saved show while a draft exists, the draft remains visible for copying or discarding, but cannot be saved back to the deleted node.

Drafts are held only in the current Manager page's memory. Save them before reloading or closing the page. See [Use Manager](manager.md#save-and-keep-track-of-drafts).

## Check the connection, then the sound

The node card shows its address, last-seen time, and an audio-connection status dot. A registered node is not proof that an input is receiving signal. Use **Live** to check the connection of each in-use physical port. Its level readings are captured source levels: station microphones and hardware inputs. The output row is not a measurement of the finished playback mix, so a zero output meter does not prove that the output is silent. Check an input's signal and Vox state where configured, then listen at the actual destination.

Disconnected physical inputs do not keep Always calls or IFB interrupts open. A connected input carrying silence still obeys Always. If the desired behavior is “only while someone speaks,” configure Vox rather than relying on silence to close an Always function.
