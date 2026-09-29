---
title: Set up stations and keys
sidebar_position: 2
---

A station is the role a person chooses in Talk. Create stations for positions such as Stage manager, Lighting, Audio, or Camera 1. The station holds the keys and listening settings; it is not permanently tied to one device.

[![Director station showing six keys, key mode, functions and standing triggers](/img/manager-station.png)](/img/manager-station.png)

<div className="caption">Director in the built-in example: Key 1 calls Show in Tap/hold mode. Other controls belong to the same station.</div>

## Create a station

1. In Manager, open **Ports → New port**.
2. Leave **Port type** set to **Station**.
3. Enter a **Port name**, such as `Lighting operator`.
4. Enter the short **Label**, such as `Lighting`. Optionally fill Alias with the person's name and Subtitle with useful supporting text.
5. Leave **Reply mode** at **Hold** for a simple push-to-talk reply.
6. Set **Master volume** if needed. New stations start at 80; the operator can adjust listening Volume in Talk later.
7. Choose **Create port**.

The station now appears in the Talk picker. It will not have useful numbered keys until you assign functions or add it to a conference. A Reply key is created separately and does not count toward the six numbered keys.

## Assign a key

Create the intended target first, then:

1. Select the station in **Ports**.
2. Under **Keys**, select one of the six numbered buttons.
3. Choose **+ Add function** in that key's editor.
4. Select the function: for example, **Call to conference** for a party line or **Call to port** for another operator.
5. Select the intended target and leave its function level at **0 dB** to start.
6. Choose **Key mode**: Hold, Tap, or Tap/hold.
7. Choose **Save changes**.
8. Join the station in Talk and test the key with someone at the destination.

The Manager key buttons are a configuration preview. Clicking them selects the key to edit; it does not transmit microphone audio from Manager.

A Talk key shows the first function target's Label and Subtitle. To change that heading, edit the target's names. If a key has several functions, they operate together but the first target supplies the heading.

## Choose a mode the crew understands

- **Hold:** press to talk, release to stop. A good default for cue calls.
- **Tap:** tap to latch on, tap again to turn off. Useful when a deliberate open line is needed.
- **Tap/hold:** a short tap latches; a longer hold closes on release.

Tell operators which modes you chose. A Tap key stays open after the finger is lifted. Reply has its own **Reply mode** setting; changing Key 1's mode does not change Reply.

Talk's **Mic off** closes microphone routes while allowing listen-only controls. Entering **Levels** releases currently held keys. A lost connection also releases keys; reconnecting does not restore a latched microphone. See [Talk and listen](../use/talk-and-listen.md).

## Add or change a station PIN

A PIN is optional and must contain four digits.

1. Select the station in **Ports**.
2. Enter four digits in **PIN (optional)**, or **Replace PIN** if one is already set.
3. Choose **Save changes**.
4. Have the operator join again and check the PIN prompt.

Saved PINs are not displayed back in the editor. Leaving Replace PIN blank preserves the existing PIN; it does not remove it. Use **Remove PIN** to remove it. That button acts immediately, so **Discard changes** does not undo the removal.

A station PIN is a local joining aid, not an account or Manager password. Anyone with access to the trusted show network may be able to open Manager. Use the [network guidance](../setup/network.md) to control who can reach the show.

## Free a key or remove a station

To remove one action from a key, select the key and use the **×** beside that function. To remove the entire key assignment and free the key number, use **Clear**, then **Save changes**. Merely removing the last function can leave an empty key trigger configured.

To remove a station, first remove routes, group membership, and IFB assignments that refer to it. Then choose **Delete port**. If deletion is refused, use Incoming, Matrix, and the relevant groups or IFBs to locate the remaining references.

For common assignments, continue with [Conferences](conferences.md), [Direct and group calls](direct-and-group-calls.md), or [Program and listen keys](program-and-listen.md).
