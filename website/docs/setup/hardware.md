---
title: Connect an audio interface
---

A **comms-node** bridges an operating-system audio device into the show. It can run on the host or another computer on the same LAN. It is useful for program feeds, desk microphones, speakers, external intercom circuits and equipment that already reaches the computer through an audio driver.

## Prepare the bridge computer

Install the same checkout and build prerequisites as the host. Linux nodes also require ALSA development libraries. Connect the interface, install any driver it requires and select a 48 kHz configuration. A Pi or other small computer still needs its own build, driver and sustained-load test; it is not a prevalidated appliance.

List the available audio devices:

```bash
npm run node -- --list
```

Use the exact device name, including spaces and capitalisation. The bridge chooses input and output devices by this same name; there are no separate input/output device flags. If you need different devices, arrange a suitable system audio device or run separate explicitly identified nodes and test that arrangement.

## Start a node

```bash
npm run node -- --gateway http://192.168.10.20:8080 \
  --name "Stage rack" --device "Scarlett 18i20" --node-id stage-rack
```

Replace the example address and interface name with your actual values. `--gateway` is the gateway origin (`http://host:port`), without `/manager/`, `/api/` or a reverse-proxy path. Use a LAN IPv4 address for the documented setup.

| Option | Meaning |
| --- | --- |
| `--gateway` | Where the node registers and receives configuration |
| `--name` | Human-readable rack or location name |
| `--device` | Exact OS audio-device name; omitted means startup defaults |
| `--node-id` | Stable, unique identity used to match saved configuration |
| `--list` | Show devices and exit |

Choose and record a unique `--node-id`. Without it, identity is derived from hostname, node name and selected device; changing those can produce a new node rather than recover the old one. Never run two physical bridges with the same explicit ID. During a v1 upgrade, use the migrated old hardware pack ID as described in [Upgrading](upgrading.md).

## Select physical channels

A newly registered node can appear without carrying audio. Open **Manager → I/O nodes**, select the node, mark the physical inputs and outputs **in use**, name them and save. Follow [Hardware channels](../configure/hardware-channels.md) for channel numbers, trims and routing.

Each selected channel becomes a separate mono port. Selecting Input 3 does not shift it to Input 1, and a selected input does not imply its matching output is selected. Verify physical sockets using a test signal and a low destination level.

The device must support 48 kHz. An unavailable or unsupported direction may report zero channels. Registration alone does not prove audio is passing.

## Connect other audio systems

Dante/AES67 software, USB interfaces and analogue bridges can participate when they expose compatible audio to the node computer. Their clocking, drivers and physical wiring remain their own setup tasks. Do not connect a powered speaker output directly to a line or microphone input. Match the electrical interface and levels using the equipment’s instructions.

For a 2-wire party line, use a proper 2-wire/4-wire interface with its required termination and nulling. The node itself is not a 2-wire electrical adapter. Test feedback and return paths before adding users.

## Changes and outages

Saving a different set of in-use channels replaces the node’s media session and can interrupt it briefly. Function and trim changes apply without restarting the node. The node retries registration in the background; a short gateway outage need not stop an already healthy router audio session.

Keep the node process running and its computer awake. The node selects and enumerates its audio device at startup; registration retries do not rescan the operating system for a replacement interface. After unplugging, replacing or renaming an interface, stop and restart the node outside live operation, then check its console, inventory and every physical channel again. A changed inventory cannot remove a channel while its own functions or other routes still use it; remove those routes deliberately before disabling that channel. See the [hardware microphone example](../recipes/hardware-microphone.md).
