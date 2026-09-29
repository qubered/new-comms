---
title: Build a conference party line
sidebar_position: 3
---

A conference is a shared conversation such as **Show**, **Lighting**, or **Cameras**. Members can listen continuously and open their microphones when needed. Each listener hears the other contributors with their own microphone removed from the return.

[![Production conference showing talk and permanent listening membership](/img/manager-groups.png)](/img/manager-groups.png)

<div className="caption">The Show conference derives its talk and listening memberships from station functions. The two rows per station describe different directions.</div>

## Create the conversation

1. Open **Ports → New port**.
2. Choose **Conference** as Port type.
3. Enter a name and short Label, such as `Show`.
4. Choose **Create port**.

An empty conference is valid while you are building the show. **Live → Needs attention** reports that it needs at least one talker until you add one.

## Add stations with the membership page

1. Open **Groups & conferences**.
2. Select **Show** in the list.
3. Under the membership table, use **Choose a port** to select Stage manager.
4. Choose **Add member**.
5. Repeat for Lighting and Audio.

Each Add member action saves immediately. A station receives a **Call to conference** function on its first unused numbered key, in **Hold** mode. The membership table shows both its Talk and Listen routes: keyed contribution into the conference and an Always return from it.

If the station already has six keys, Manager asks you to open its port and choose a trigger. If it is already a member through a conference-call function, edit that function rather than adding another membership.

## Choose the exact key yourself

Use this method when all stations should have Show on the same key number:

1. Open the station in **Ports**.
2. Select the desired key, for example **1**.
3. Choose **+ Add function → Call to conference** and select **Show**.
4. Choose Key mode and **Save changes**.
5. Repeat on the other stations.

Avoid moving a crew member's familiar key during a live show without telling them. The automatic Add member method chooses an available key; it does not guarantee matching key numbers across stations.

## Confirm talk and return behavior

1. Join two different stations in Talk, using headsets.
2. Speak while holding Show on the first station.
3. Confirm the second station hears the voice without pressing Show.
4. Release the key and confirm the microphone contribution stops.
5. Repeat in the other direction.

Pressing Show is not required for listening. A station's conference-call function gives a permanent listen return even when its microphone trigger is closed. That return remains if you change the talk trigger to Vox.

If you want a station to hear the conference only while pressing a key, give it **Listen to → Show** instead. A listen key contributes no microphone audio. See [Program and listen keys](program-and-listen.md).

## Add hardware

In Groups & conferences, adding an **input** to a conference creates an **Always → Call to conference** function. The input contributes continuously while connected. To make a hardware microphone contribute only during speech, add the same Call to conference function under Vox, remove its Always copy, and save once. See [Vox](vox.md) for tuning.

Adding an **output** creates an Always conference return to that output. It does not add a microphone contribution. This is useful for a wired earpiece or monitoring output.

For a station, **Always → Call to conference** creates an open microphone plus a permanent return. Use it only when a continuously open microphone is intended.

## Understand membership and removal

Conference membership is derived from functions. There is no second hidden member list that can override a station's configuration. The membership table's **Owner** column shows where each route is set; **Open** takes you to that function.

To remove a station from the conference, open its owning function, remove it, and save. Removing Call to conference removes both its talk contribution and its passive return. An independent Listen to or Route audio function may still provide another path, so check Matrix if audio remains.

Conferences cannot be freely chained into other conferences or IFBs. The supported exception is using a conference as an IFB's Program source. Keep party lines separate and give an operator more than one conference key when they need access to several teams.
