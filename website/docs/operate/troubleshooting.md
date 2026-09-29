---
title: Troubleshoot a show
description: Separate device, routing, network and service faults before changing the system.
---

Start with the scope: one operator, one route, one hardware node or everybody. Ask what last worked and what changed. Keep one known-working station available for comparisons.

Avoid changing gain, routing and network settings all at once. Make one correction, then repeat the same sound check so you know what fixed the problem.

## Find the symptom

| Symptom | Checks | Next action |
| --- | --- | --- |
| Talk will not open | Correct supplied address? Intended WiFi? Show computer awake? Certificate trusted? | Compare with a working device, then use the [network](../setup/network.md) and [HTTPS](../setup/https.md) guides. |
| Picker says **No stations yet** | Are there station ports, rather than only conferences or inputs? | Create the assigned stations in [Manager](../configure/stations.md). |
| Picker is **Reconnecting…** | Can Manager reach the gateway? Is the show computer available? | Restore the management connection; do not open multiple station tabs. |
| Page works but no audio connection | Mixer running? Firewall permits media? Guest/client isolation enabled? | Check Manager's Mixer status, then shared network and firewall configuration. |
| PIN rejected | Correct station? Correct four-digit PIN? Changed by the operator? | Ask the operator to verify or replace it. Do not repeatedly try another person's station. |
| Two devices keep reconnecting on one station | Same station selected twice, including background tabs? | Leave it on the old device with **Switch station**. Assign a separate station to the second operator. |
| **No mic** | Browser permission, secure address, selected input, headset connection, competing app? | Use **Audio devices → Try again** after correcting the cause. Listening can still work. |
| Talk key will not activate | Connected? Mic available? **Mic off**? Is it Reply with no eligible caller? | Restore capture/unmute or confirm the intended key assignment. Pure monitor keys do not need a mic. |
| Key stops after opening Levels | Did the operator enter **Levels**? | This intentionally releases all keys. Choose **Done** and reopen only the required key. |
| You hear nothing, but others hear you | Dock Volume zero? Source level zero? OS volume/output route wrong? Headset unplugged? | Check [listening levels](../use/levels.md) and [audio devices](../use/audio-devices.md), then the destination's incoming routes. |
| You hear others, but they cannot hear you | Correct talk key? Mic off/No mic? Wrong microphone? Destination connected? | Have a colleague confirm the source and target while watching Live; correct one stage at a time. |
| A conference key must be held to hear anything | Was **Listen to** configured instead of **Call to conference**? | A conference-call key has a permanent return. Check the actual function, not just the heading. |
| Program disappears under a call | IFB dim or Cut intentional? An automatic interrupt still open? | Release the interrupt, or inspect Always/Vox at its owner. A connected silent Always interrupt still counts as open. |
| IFB remains dim during silence | Interrupt uses Always or a latched key? Vox hang too long or threshold too low? | Use the intended trigger; silence alone does not close Always. See [IFB](../configure/ifb.md) and [Vox](../configure/vox.md). |
| Reply unavailable during an incoming call | Is the caller a hardware input? | Inputs cannot receive replies. Provide a separate station/output route if return communication is needed. |
| An unexpected person hears a call | Group membership? More than one function on the key? A route owned elsewhere? | Inspect destination **Incoming** and [Matrix](../configure/matrix.md); edit the owning function. |
| A duplicate route did not get louder | Are both functions the same source/destination pair? | Expected: parallel functions use the highest active gain once. Adjust the intended function, not the number of copies. |
| Crackle, clipping or harsh speech | Already distorted at the microphone/interface? Excess input trim? Multiple open acoustic paths? | Lower physical input gain or correct its source first. Receive volume cannot repair clipping. |
| Echo or feedback | Nearby speakers? Two stations on one desk? A raw route returning audio? | Lower playback, use headsets, close unintended microphones, then inspect routes. |
| Delay or intermittent audio | Poor coverage? Shared WiFi traffic? Bluetooth mode? Backgrounded tab? | Compare a foreground device near the access point and a wired headset, then [measure latency](latency.md). |
| Audio stops when the phone locks | Does the same setup work foreground? OS suspending audio? | Validate the exact lock-screen behavior. Keep Talk foreground if that is the tested working condition. |
| Node absent from I/O nodes | Node running? Correct gateway address/network? Interface available? | Follow [hardware setup](../setup/hardware.md), confirm the bridge identity and restart only that bridge if needed. |
| Node exists, but a physical channel is missing | Was that channel ticked **In use** and **Save channels** pressed? | Enable the correct channel, then configure the resulting input/output port. |
| Wrong physical connector carries audio | In/out direction and channel number correct? Migrated node using the old identity? | Test individual connectors and follow [upgrading](../setup/upgrading.md) for migrated hardware. |
| Cannot disable a channel or delete a port | Does it own functions or have incoming references, group membership or IFB use? | Remove the relevant functions/references first. A rejected save leaves the previous show active. |
| Edits seem not to take effect | **Unsaved changes** visible? Save failed? Looking at a draft versus live Matrix? | Read the error, complete a successful save, then check a real route. |
| Draft warns its port/node was deleted | Another Manager or show replacement removed it? | Copy any needed edits from the retained draft, or discard it. It cannot update the deleted object. |

## Trace one audio path

Choose one speaker and one listener. Work in this order:

1. **Capture:** confirm the selected microphone or physical input works.
2. **Trigger:** in Live, confirm the key or Vox is open when expected. Check Mic off.
3. **Route:** locate the pair in Matrix. A group expands to its members; a conference/IFB adds a bus between source and listener.
4. **Destination:** verify the receiving station or node is connected.
5. **Listening level:** check source level, master volume, output trim where applicable, then device volume.
6. **Playback:** verify the actual headset or physical output connection.

Use labels and physical channel numbers together. A label such as “Truck” can be correct while its cable is on another connector.

## Before escalating

Record the show/station names, device and headset, browser/OS, location, time, exact message, affected route and whether others were affected. Include whether the screen was locked, a phone call occurred or a headset changed. Save a screenshot of the relevant Live or Matrix view if useful, without exposing station PINs.

If safe, repeat on the spare test station. Preserve a [backup](../setup/backup-and-restore.md) before broad configuration changes. For a live show with lost cue communication, use the agreed fallback first and diagnose afterward.
