---
title: Your comms, from first setup to show time
slug: /
---

new-comms connects the people running a show. One computer hosts the system, operators open **Talk** on their phones or laptops, and the person configuring the show uses **Manager**. Audio interfaces can bring microphones, program feeds and external comms into the same show.

This guide explains how to install it, build your routing, use it during a show and recover when something goes wrong. You do not need to understand the source code.

## Where to start

| What you need to do | Start here |
| --- | --- |
| Join an existing show | [Join a show](use/join-a-show.md), then [talk and listen](use/talk-and-listen.md) |
| Set up the host computer | [Requirements](setup/requirements.md), [installation](setup/install.md), then [start a show](setup/start-a-show.md) |
| Design your first setup | [How it works](concepts/how-it-works.md), then the [small-show example](recipes/small-show.md) |
| Connect an audio interface | [Hardware setup](setup/hardware.md), then [channel configuration](configure/hardware-channels.md) |
| Prepare for doors | [Preflight checklist](operate/preflight.md) |
| Fix a problem now | [Troubleshooting](operate/troubleshooting.md) |

## Three things to know first

1. **Everyone uses the same local network.** The show computer must stay on and connected. Internet access is not the audio path.
2. **A station is a role, not an account.** “Director” can move between devices. Choosing a station already in use takes it over.
3. **Manager configures; Talk operates.** Save a station’s keys in Manager, then use them in Talk. A matrix cell shows the routing that those instructions produce.

## Reading this guide

Instructions use the actual labels in the application, such as **Ports**, **Always** and **Save changes**. Example names such as **Show**, **Director** and **Stage rack** are names you choose for your own show. Replace `SHOW-IP` in addresses with the show computer’s real LAN IPv4 address; do not type the placeholder literally.

Select a screenshot to open its full-size image. Screenshots show a disposable example show in the current application. An offline rack or unavailable microphone in a picture is an example state, not evidence of a tested physical audio system. These guides cover the current **ports, triggers and functions** model. Older channel-model instructions are not interchangeable.

Read [design decisions](about/design-decisions.md) for the reasoning, [limits](about/limits.md) for boundaries, or the [glossary](about/glossary.md) when a term is unfamiliar. Search works from a local index served with this guide; it does not require an external search account.
