---
title: Ports and names
sidebar_position: 2
---

A **port** is a named place where audio can enter, leave, or be shared. People use station ports; hardware channels become input and output ports. Conferences, groups, and IFBs are ports too, so you can select them as a key's destination.

## Choose a port type

| Type | Use it for | Create it in |
| --- | --- | --- |
| Station | A phone or browser operator with microphone, headphones, and up to six keys plus Reply | **Ports → New port** |
| Input | One capture channel on an audio interface, such as a wired microphone or program input | **I/O nodes**, by enabling **In use** |
| Output | One playback channel on an audio interface, such as a speaker or wired earpiece | **I/O nodes**, by enabling **In use** |
| Conference | A shared party line with each listener's own contribution removed | **Ports → New port** |
| Group | A list of stations and outputs to call together | **Ports → New port** |
| IFB | A program feed with an interrupt that dims or cuts program | **Ports → New port** |

An input cannot hear a reply. An output cannot provide microphone audio. Conferences and IFBs mix audio but are not devices that a person joins in Talk. Groups have members rather than a mixed audio source.

A saved port's type cannot be changed. If you chose the wrong type, create the right port and move its routes before removing the old one.

## Give people a short, useful name

Each port has several naming fields:

| Field | Purpose | Example |
| --- | --- | --- |
| Port name | The full name used when managing the show | `Stage manager headset` |
| Label | The short name used on Talk keys and in many selectors | `Stage` |
| Alias | Additional information about who or what occupies the role | `Priya` |
| Subtitle | Supporting text shown beneath a target's label on Talk keys | `Calls and cueing` |

If you leave Label empty when saving, the port name becomes its label. Keep labels distinct: two different ports named `Program` are difficult to distinguish in a small selector.

Alias is useful in Manager's port list, but it does not replace Label on a Talk key. If the key must say `Priya`, put `Priya` in Label. A key takes its heading and subtitle from the first function's target; it does not have a separate custom title.

### Rename a station without changing its routes

1. Open **Ports** and select the station by its current name.
2. Edit **Port name**, **Label**, **Alias**, or **Subtitle** as needed.
3. Choose **Save changes**.
4. Check a Talk station with a key targeting that station.

The existing routes stay connected to the same port. The displayed names update after the save.

## Find the right port

In **Ports**, use **Search** to search names, labels, and aliases. Combine **All types** with **All nodes** to narrow the list to, for example, inputs belonging to the stage rack. Selecting a node filter excludes non-hardware ports.

A status dot on a station or hardware port tells you about its live connection. A conference or group is a configuration object; it does not need someone to connect to it like a phone. Use **Live** when checking actual devices and active routes.

## Hardware names and channel numbers

Hardware input and output ports are created from channels enabled in **I/O nodes**. A node's input 3 remains physical input 3; it is not renumbered because inputs 1 and 2 are unused.

A **Short name** on a hardware channel becomes its port label when saved. Use names such as `Program L`, `Announce mic`, or `Talent ear` so you do not need to remember channel numbers. Keep the full hardware identity visible in the port editor's **Hardware channel** field when checking cables.

See [hardware channels](../configure/hardware-channels.md) for enabling channels and adjusting trims.

## Before deleting a port

Remove or redirect functions that refer to it, group membership, and IFB program or destination assignments first. Manager refuses a deletion that would leave a broken route. That refusal is a useful reminder to check who depends on the port.

Hardware ports are removed by unticking **In use** for their channel, not with **Delete port** in the port editor. Take a [backup](../setup/backup-and-restore.md) before substantial show changes.
