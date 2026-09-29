---
title: What you need
---

## A minimal show

- A host computer that can remain powered, awake and connected throughout the show.
- A local network and WiFi access point that allow devices to reach one another.
- A phone or laptop with a browser for each operator.
- A microphone and headphones for each person who needs to talk. A wired headset is a useful first test because it removes Bluetooth pairing and profile changes from the setup.
- Time before the show to test the actual devices, coverage and routing.

The host runs the audio mixer and the web service. Operators only need a browser; they do not install the host software. A hardware bridge is optional.

## Host software

The current distribution is installed from the project repository and built locally. There is no packaged point-and-click host installer in this version.

| Requirement | What it is for |
| --- | --- |
| Git | Obtain and update the application |
| Node.js **22.12 or later** on a supported even-numbered release | Run the web service and build the interfaces and guide |
| npm, included with Node | Install the application’s dependencies |
| Rust through rustup; this checkout pins **1.98.1** | Build the audio router and optional hardware bridge |
| Native compiler tools and libopus | Build and encode the audio components |
| OpenSSL command-line tool | Generate the initial local HTTPS certificate |
| ALSA development libraries on Linux hardware nodes | Build the interface bridge |

macOS is the software-verified host environment recorded for this version. Linux and Raspberry Pi deployments need their own build and interface checks. Native Windows host operation is not established by the current launcher or verification record; a Windows browser client is a separate question from a Windows host build. Do not choose an untested show host at the last minute.

## What you do not need

No online account, cloud subscription, PTP clock or managed switch is required by the basic system. You do not need Dante or AES67. Those systems can be connected through an audio device the bridge can use; new-comms does not itself act as a native Dante or AES67 endpoint.

## Sizing a show

Do not treat a session limit as a capacity guarantee. CPU, WiFi airtime, channel count, browser devices and interface drivers all matter. The implementation has a 64-peer/session ceiling; a multi-channel node uses one session, but still carries multiple audio tracks. No 64-operator production capacity claim follows from that number.

Rehearse at your intended load. See [network setup](network.md), [known limits](../about/limits.md) and [preflight](../operate/preflight.md).
