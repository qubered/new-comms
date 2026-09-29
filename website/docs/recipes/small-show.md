---
title: A small crew party line
description: Build a shared Show conference for three operators, then test it from phones or laptops.
---

This recipe gives a stage manager, lighting operator and audio operator one shared party line. Each person hears the other contributors continuously and presses **Show** when they need to speak. It needs no hardware audio interface.

Have the show running, Manager open and three client devices on the intended network. If you already loaded an example show, inspect its existing ports before creating duplicates. Use distinct names for this exercise if necessary.

## 1. Create the party line

1. In Manager, open **Ports → New port**.
2. Set **Port type** to **Conference**.
3. Set **Port name** to `Show crew` and **Label** to `Show`.
4. Choose **Create port**.

The conference can be created before members. **Needs attention** may report that it needs a talker until you add one. This is expected during construction.

See [Conferences](../configure/conferences.md) if you want several independent party lines.

## 2. Create the three stations

Create three **Station** ports in the same way:

| Port name | Label | Assigned operator |
| --- | --- | --- |
| Stage manager | Stage | Stage manager |
| Lighting operator | LX | Lighting operator |
| Audio operator | Audio | Audio operator |

For each station:

1. Choose numbered key **1** in the beltpack preview.
2. In that key's function area, choose **+ Add function**.
3. Select **Call to conference** and target **Show**.
4. Leave the function level at `0 dB` for the initial check.
5. Set **Key mode** to **Hold**.
6. Choose **Create port** for a new station, or **Save changes** if it already exists.

Using Hold makes the initial check simple: press to contribute, release to stop. You can change selected operators to Tap or Tap/hold later after briefing them. The return is permanent in all three modes.

Optionally set each station's four-digit **PIN** before distributing assignments. The PIN controls joining that station; Manager itself has no account login. See [Stations](../configure/stations.md).

## 3. Confirm the show before joining

Open **Groups & conferences** and choose **Show**. Check that all three stations appear with talk/listen relationships. Open **Matrix** to inspect source-to-conference and conference-to-station routes if anything is missing.

The functions are owned by the stations. If a route needs fixing, the member/Matrix link takes you to its owning port; do not create a second unrelated route merely to hide the omission.

## 4. Join and prove the route

1. Each person opens Talk and joins their own station.
2. Everyone connects a headset and starts at a comfortable volume.
3. The stage manager holds **Show**, says a short check message and releases it.
4. Lighting and audio confirm they heard Stage. They should not need to hold their own keys to listen.
5. Repeat with Lighting speaking, then Audio.
6. Have two operators speak briefly together and verify the listeners receive the combined conference.
7. Check Mic off on one station: that person's microphone should stop, while listening remains available.

If one operator hears nothing, check their **Volume**, source level and headset before rewriting the conference. If everyone hears only when holding a key, inspect whether a monitor function was chosen instead of Call to conference.

## 5. Prepare it for use

Give the crew this rule: **one device per station**. A replacement device must take over only after the original leaves using **Switch station**. Complete the [preflight checklist](../operate/preflight.md) in the real working positions and make a [backup](../setup/backup-and-restore.md).

Possible next steps are a [direct or group call](../configure/direct-and-group-calls.md), a [program feed](../configure/program-and-listen.md), or the [program and IFB recipe](program-and-ifb.md). Add one feature at a time and sound-check its destination.
