---
title: Why the system works this way
---

The aim is comms that people can run on devices they already own: one local host, an ordinary network, and a browser for each operator. The deeper routing controls exist to support that workflow rather than make specialised audio networking a prerequisite.

## Roles rather than accounts

A station represents a job such as Director or Camera 1. The show configuration stays with that role when its operator changes device. This makes handover simple, but also means selecting an occupied station takes it over. Coordinate handovers and leave the old session deliberately. A four-digit PIN reduces accidental selection; it is not an administrator permission system.

## Configuration in one place, operation in another

Manager is where a system owner defines intent. Talk gives an operator a small set of useful controls. Operators should not need to understand the complete routing graph to call their team. Name keys and ports for the people using them, and rehearse what each key does.

## Ports, triggers and functions

A port is an audio role or endpoint. A trigger says **when** something should happen. Its functions say **what** happens. “When Director holds key 1, call Show” can be understood and edited at Director’s station.

The matrix is derived from these instructions. It helps you inspect where a connection comes from; it is not a second, competing configuration surface. This avoids a hidden crosspoint changing a route while the station editor says something different. Incoming routes link you to their owner for the same reason.

## Conferences keep listening simple

Putting a conference call on a station gives it a standing return from that conference. The key controls whether its microphone joins the conversation. Operators can listen without holding a key, and the mix avoids returning their own contribution through the conference. A group is different: it fans a call out to several destinations without creating a shared permanent return.

## Explicit gates for different jobs

**Always** means active while its physical source is connected and not mic-muted, including silence. Mic off closes routes carrying that station’s own microphone; it does not disconnect the station or stop its listening mix. **Vox** follows signal activity. **On call** responds to an incoming direct/group call. Keys require an operator action. Keeping these choices visible makes an interrupting microphone’s behaviour predictable and explains why “silent” and “disconnected” are different states.

## An IFB describes the listener’s feed

An IFB combines a program feed, a destination and a dim/cut policy for interruptions. The destination gets the feed as part of that definition. The user should not have to build a second parallel monitor path just to hear it. Where the same source-to-destination connection has several active functions, the strongest active gain wins rather than adding duplicate copies of that route.

## Hardware is a bridge

The core system does not require a particular audio-network brand. A node exposes individual physical channels as ports, so Input 3 can serve a completely different job from Output 3. Explicit channel selection and stable identities protect a show from silently moving to the wrong socket after a restart.

## Local operation and its tradeoffs

Keeping the show on the LAN avoids a cloud audio dependency. It also puts responsibility for host power, WiFi quality, backups, certificate trust and access to Manager with the system owner. This is not a managed redundant service, and it does not make a poor venue network reliable by itself.

## Phones remain phones

Talk sends a continuous audio track, uses silence when the microphone is off, and attempts to preserve or recover playback as the device changes state. These measures are intended to reduce interruption and WiFi sleep effects. They cannot promise that every mobile OS, Bluetooth device or power-saving policy will behave identically. Test the devices and operating conditions you will actually use.

See [How it works](../concepts/how-it-works.md) for the practical model and [Known limits](limits.md) for boundaries.
