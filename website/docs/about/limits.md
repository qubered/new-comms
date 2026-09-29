---
title: Capabilities and known limits
---

This guide describes implemented behaviour. It does not turn software checks into a claim that every venue, phone or interface has been accepted for live production.

## Included

Browser stations; six numbered keys plus Reply; direct calls; conferences; groups; program monitoring; IFB; Always, Vox and On call gates; remote audio routes; per-source and master listening levels; per-channel hardware trims; multi-channel node bridges; saved local shows; and inspection through Manager’s Ports, Groups & conferences, Matrix and Live views.

## Boundaries to plan around

- One local site/LAN. No configured internet relay or multi-site workflow.
- No user accounts, administrator roles or Manager login. Network access is part of show control.
- A station has one active session. Selecting it elsewhere takes it over.
- Six numbered keys plus Reply per station; functions can be combined but operators must understand the combination.
- Hardware channels are mono and devices must support 48 kHz.
- No native Dante, AES67 or 2-wire endpoint; use a suitable external/OS audio bridge.
- No built-in recording, managed host redundancy, automatic backup schedule or Manager undo history.
- Unsaved Manager drafts survive navigation within the current running page, not a browser crash or reload.
- Certificates do not automatically renew or follow IP changes.
- Speaker selection depends on browser capability. Device and background policies vary.
- The 64-session implementation limit is not a measured production capacity guarantee.

## Checks still required on your equipment

The current software work was checked locally, including builds, automated routing tests and local browser/router audio loops. Physical iPhone/Android acceptance, a second Mac or Pi with a real multi-channel interface, venue WiFi delay and extended screen-locked operation remain unverified in that record.

Before relying on a show, test actual microphone-to-ear delay, full operator load, physical channel identity, listening-only and screen-locked operation, reconnects, and the failover procedure your team will use. The proposed target of p50 at or below 100 ms and p95 at or below 150 ms is a **target**, not a measured promise for your devices.

Talk’s synthetic latency page measures software round trip, not the complete microphone-to-ear path. See [Latency](../operate/latency.md) and [Preflight](../operate/preflight.md).

## When asking for help

Record the software version, host/device OS, browser, interface name, station/node names, route involved, network type, exact error and what changed just before it failed. Include whether the page loaded, whether the station connected and whether another listener heard the same problem. Share state files only through an appropriate private channel: they contain station PINs. Never share the host TLS private key.
