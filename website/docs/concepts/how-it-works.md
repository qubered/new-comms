---
title: How new-comms works
sidebar_position: 1
---

new-comms lets a crew use phones and laptops as an intercom on one local network. A show computer keeps the show running. Crew members open **Talk**, choose a station, and use its keys. The person setting up the show uses **Manager** to decide who can talk to whom.

A headset, a working local network, and a browser are enough for an ordinary party line. An audio interface is optional: add one when you need a wired microphone, a program feed, a speaker output, or an earpiece connected to other equipment.

![Talk and Manager connect to a show computer on the local network; an optional hardware node adds physical audio inputs and outputs.](/img/system-overview.svg)

*Talk needs no audio interface. Add a hardware node only when the show needs physical audio connections.*

## Start with a conversation

Imagine a small show with a stage manager, a lighting operator, and an audio operator.

1. Create a **Station** for each role: `Stage manager`, `Lighting`, and `Audio`.
2. Create a **Conference** named `Show`.
3. Add the three stations to Show.
4. Have each crew member open Talk and select their station.
5. Hold the **Show** key on one station and speak.

The other two hear the speaker without pressing their own Show keys. Pressing a conference key opens that person's microphone into the conversation; listening is already available. The speaker does not hear their own microphone returned through the conference.

Follow the full [small-show recipe](../recipes/small-show.md) or [conference setup](../configure/conferences.md) to build this example.

## The four ideas behind a show

| Idea | What it means | Example |
| --- | --- | --- |
| Port | A named person, audio connection, or shared destination | Lighting, a hardware microphone, Show |
| Trigger | When something happens | Hold Key 1, Always, or Vox |
| Function | What that trigger does | Call Show, listen to Program, or call Lighting |
| Matrix | The combined view of those audio routes | Stage manager's microphone can reach Show while Key 1 is held |

You usually work in that order: create the people and destinations, assign their keys or standing functions, then use Matrix to check the result. You do not need to draw a matrix before anyone can talk.

## Pick the right kind of conversation

- Use a **conference** for a continuing party line. Everyone listens; people open their microphones as needed.
- Use a **direct call** to speak to one station or hardware output. The call is one way. A station can use Reply to answer, or you can give it a key back to the caller.
- Use a **group** to speak to several stations or outputs at once. A group distributes the caller's audio; it does not make its members a party line.
- Use **Listen to** when someone only needs to hear a source, such as program audio.
- Use an **IFB** when talent should hear program until a director interrupts it. The program can become quieter or cut during the interrupt.

The [port guide](ports-and-names.md) explains the available port types.

## What stays with the show

A station is a role in the show, not a particular phone. Its name, keys, feeds, and settings remain when that phone leaves. The next person who selects the station receives that configuration. Assign distinct stations to people who need independent controls.

Saved changes in Manager affect the running show. They are not a private preview. Talk volume controls are personal to the selected station; changing a station's source volume does not change what the rest of the crew hears.

Unsaved Manager edits are retained while you move around Manager, but they have not changed the show yet. See [saving and drafts](../configure/manager.md#save-and-keep-track-of-drafts).

## A local show, with local trust

new-comms is intended for one site and a trusted local network. There are no user accounts or separate Manager permissions. An optional station PIN helps crew choose the correct station, but it is not a replacement for controlling access to the network and show computer.

For the physical setup, begin with [requirements](../setup/requirements.md), [starting a show](../setup/start-a-show.md), and the [network guide](../setup/network.md).
