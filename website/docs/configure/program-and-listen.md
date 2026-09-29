---
title: Add program feeds and listen keys
sidebar_position: 5
---

Use **Listen to** when a station or hardware output should hear a source without contributing microphone audio to it. Choose **Always** for a standing feed or a numbered key for a feed the operator can switch.

The source can be a hardware input, a station microphone, a conference mix, or an IFB feed. Groups cannot be audio sources.

## Give a station a standing program feed

Before starting, make the program source available. For hardware program audio, [enable its input channel](hardware-channels.md) and give it a useful label such as `Program`.

1. Open the receiving station in **Ports**.
2. Find **Standing functions → Always**.
3. Choose **+ Add function**.
4. Select **Listen to**, then select **Program** as the target/source to hear.
5. Leave the function level at **0 dB** initially.
6. Choose **Save changes**.
7. In Talk, check **Also hearing: Program** and play signal into the program source.

The feed uses no numbered key. The operator adjusts it in **Levels**, independently of the station's overall Volume.

**Also hearing** lists configured Always Listen to feeds. It is not a signal meter or a complete inventory of every route into the station. A conference return or an incoming direct call may be audible without appearing there.

## Make program switchable with a listen key

1. Open the station and select a free numbered key.
2. Choose **+ Add function → Listen to**.
3. Select Program.
4. Set **Key mode** to **Tap** if the operator should turn the monitor on and leave it on, or **Hold** for a momentary check.
5. Choose **Save changes**.
6. In Talk, turn the key on and off and confirm the feed follows it.

A listen-only key is visually different from a microphone key. **Mic off** does not prevent monitoring: an operator can keep or activate a listen key while their microphone is killed.

If Program keeps playing after the key is turned off, check for an Always listen or another route to the station. The key controls its own function; it does not cancel other functions.

## Listen to a conference without joining its talk side

Use **Listen to → Show**, on either a key or Always. This allows a person to monitor Show without opening their microphone into that conference.

Do not use **Call to conference** if the goal is a switched monitor. That function supplies a permanent return even when its key is released. It also adds a talk contribution where the owner has a microphone.

## Create a shared program mix

If several inputs should make up one named program source, use a conference as the mix:

1. Create a Conference called `Program`.
2. On each required hardware input, add **Always → Call to conference → Program** and save.
3. On each receiving station, add **Always → Listen to → Program** and save.
4. Check each physical input level and then the combined feed at a receiving station.

The receiving station now has one Program fader for the combined source. Keep ordinary show communications out of that conference unless they are meant to be part of program.

A conference used as Program can also feed an [IFB](ifb.md). Avoid adding an extra direct program listen to the IFB listener, because that extra path would remain when the IFB dims its own program.

## Feed a hardware output

Open the output port and add **Always → Listen to → Program**, then save. The output plays Program continuously while the required source and hardware connections are available.

A hardware output's **Trim (dB)** changes the physical output level. It does not provide a crew-facing Talk volume slider. Coordinate the output trim with the connected equipment's input level and begin testing at a modest listening level.

## Check silence in the right order

1. Verify the physical program source is connected and has signal in **Live**.
2. Verify the intended function is saved and its target is correct.
3. If it is keyed, verify the listen key is open.
4. Check the source's personal Levels fader and overall Volume on the receiving station.
5. Use [Matrix](matrix.md) to find an unexpected gate or a route owned elsewhere.

An offline input closes its routes. A connected but silent input still has an open Always route; silence alone does not mean the configuration is wrong.
