---
title: Run a show
description: Monitor activity, make controlled changes, and recover from interruptions without losing the crew.
---

Keep Manager available to a designated operator and make sure the crew knows how to reach that person. Most show operation should happen on Talk; configuration changes should be deliberate and communicated.

## Watch the right things

Manager's **Live** page brings together open keys, Vox activity, incoming callers and **Needs attention**. The sidebar reports gateway and mixer status. **Matrix** shows which configured function routes are open.

Use these views to answer concrete questions: Is this station connected? Is its key down? Is Vox open? Which source is calling the destination? Do not infer headset sound solely from a route indicator. A source can be connected and intentionally silent, or a listener can have its volume at zero.

An **Always** source remains routed during silence while connected. Its calls and IFB interruption close when its session disconnects. If a feed should follow speech rather than connection, configure [Vox](../configure/vox.md).

## Keep calls clear

Use one station per active device. For a handover, have the old operator use **Switch station** before the replacement joins. Brief substitutes on key modes and automatic routes; copying the same key labels does not tell someone whether a key latches.

Encourage short sound checks when someone changes location, swaps a headset or returns after a phone call. A check should confirm who was heard, where and in which direction.

A red talk key should be intentional. Mic kill is the immediate operator control for stopping that station's microphone. Turning down the dock Volume only reduces its listening level.

## Make changes during operation

1. Identify the owning port in **Ports**, **Incoming**, **Groups & conferences**, or **Matrix**.
2. Tell the affected operators what will change and when.
3. Edit the relevant function or setting. Check its target and trigger before saving.
4. Choose **Save changes** or **Save channels**.
5. Verify the result in Live and with an actual sound check.

Configuration edits can change live routing immediately after saving. Changing a node's channels in use replaces that node's audio session, so schedule it as a brief interruption. Ordinary function and trim changes do not require restarting the node.

Parallel functions for the same source and destination do not add duplicate copies of that source. The highest active effective gain is used. If two operators report unexpected level behavior, inspect all functions for the pair rather than assuming the last-edited one is the only route.

## Unsaved work is not live configuration

Manager keeps unsaved port and node drafts while you navigate between pages. The **Unsaved changes** banner returns you to a draft or lets you discard it. A pending save stays locked across navigation; a failed save leaves the draft available.

Drafts are held in the page's memory. Closing or reloading warns about unsaved changes, but drafts are not a backup and are not stored for later browser sessions. Save intentional changes before leaving Manager.

Another Manager can change or delete the same object. A draft of a deleted port or node remains viewable for copying or discarding, but cannot be saved back to the deleted object. Coordinate configuration ownership during a show to avoid conflicting edits.

## Handle interruptions by scope

If one operator loses audio, first check that operator's station, device and network position. If a whole hardware rack disappears, inspect its node and physical connections. If everyone loses audio, check the show computer, mixer and shared network.

A brief gateway interruption can leave existing audio running. Do not restart the mixer merely because Manager is reconnecting. A mixer restart interrupts audio and requires clients to reconnect. After recovery, have operators confirm their listening path and press the required keys again.

Use the [troubleshooting table](troubleshooting.md) to narrow the cause. If the fault cannot be resolved within your agreed operational limit, use the prearranged fallback rather than continuing to issue cues over an unverified path.

## End the show

Ask operators to leave their stations and stop unattended feeds. Save the final intended configuration, discard abandoned drafts, and make a [backup](../setup/backup-and-restore.md). Record unresolved issues with the device, station, location and approximate time so they can be reproduced before the next show.
