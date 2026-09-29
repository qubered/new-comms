# A budget PoE station on a microcontroller

Research, 2026-09-29. Not a spec and not in the plan yet. Follows
`2026-09-29-competitors-latency-hardware.md` §6, which covers the wider hardware path.

## Idea

A wired PoE comms station built on a microcontroller rather than a Linux board, with a
screen, keys, volume encoders and a headset. It joins as an ordinary **station** port, the
same as a phone, so nothing in the port model changes.

## Can a microcontroller speak our WebRTC?

Yes, if it is strong enough. The server side needs nothing new: the gateway takes one HTTP
POST with an SDP offer, and mix-router is standard WebRTC (ICE-lite, DTLS-SRTP, Opus, one
data channel). comms-node itself cannot run on a microcontroller (str0m needs a full OS), so
the firmware would be C on the vendor's stack.

| Chip | Fit |
|---|---|
| Raspberry Pi Pico (RP2040) | No. Too slow for 48 kHz Opus plus DTLS. |
| Pico 2 (RP2350) | Maybe. Tight on CPU; no Ethernet (needs a W5500); no maintained WebRTC stack, so we would port one. |
| **ESP32-P4** | **Best fit.** 360 to 400 MHz dual RISC-V, Ethernet MAC, PSRAM, and Espressif maintains a WebRTC stack for it ([esp-webrtc-solution](https://github.com/espressif/esp-webrtc-solution), [esp_peer](https://components.espressif.com/components/espressif/esp_peer/versions/1.2.7/readme): Opus, DTLS-SRTP, data channel, jitter buffer). |
| STM32H7, i.MX RT1170 | Enough power; no ready WebRTC stack. |

## A board to start on

Waveshare **ESP32-P4-WIFI6-POE-ETH** ([wiki](https://www.waveshare.com/wiki/ESP32-P4-_WIFI6-POE-ETH))
or a clone; seen on AliExpress for about A$39.

- ESP32-P4, 32 MB PSRAM, 16 MB flash
- 100 Mbps Ethernet (IP101) with PoE. The PoE standard, isolation, and whether the PoE part
  is fitted as standard are not documented; check with the seller.
- ES8311 codec, onboard mic, 3.5 mm headphone out, 2 W speaker amp
- 28 free GPIO, I²S pins exposed
- ESP32-C6 for WiFi 6 and Bluetooth (not needed for PoE; useful for a wireless version)

Waveshare also sells an ESP32-P4-ETH without the C6
([CNX](https://www.cnx-software.com/2025/08/20/waveshare-esp32-p4-eth-development-board-supports-ethernet-and-poe/)).

## Screen, keys and encoders

The P4 has room for a real front panel:

- **Screen**: MIPI-DSI or SPI LCD, drawn with LVGL. Shows each key's label, who is talking on
  it, the last caller for Reply, and levels.
- **Keys**: GPIO buttons, one per key plus Reply, with a talk LED each (red only when the mic
  is hot, per the design rules).
- **Volume encoders**: rotary encoders on the P4's pulse counter peripheral; one per key's
  listen level, or one master plus a select.
- **Headset**: the dev board's mic is onboard and its jack is likely output only. A headset
  (mic with bias, TRRS or XLR-4) needs our own board later.

What the device sends is already in the protocol: `key`, `volume`, `masterVolume` and
`micOff` on the data channel. What it needs back is key labels and who is talking; phones
get labels from the gateway's snapshot and live state from the router. Open question for
later: have the device read the gateway's snapshot (plain JSON over HTTP; fine with 32 MB
PSRAM), or push a trimmed "panel" message over the data channel.

## Latency

No OS audio stack: the codec feeds I²S DMA in 2.5 to 5 ms blocks, and wired Ethernet removes
WiFi jitter. Estimated 15 to 30 ms talker to listener through the mixer, once the phase 1
router work is in (estimate, not measured). Beltpacks are 35 to 60 ms.

## Cost

Estimated A$40 to 60 in parts for a PoE desk station with screen, keys and encoders, before
enclosure. Wired incumbents start around A$1,800 per beltpack.

## Risks and unknowns

- DTLS handshake time and CPU use on the P4 (unmeasured).
- The gateway uses self-signed HTTPS in dev; the device must trust it, or the gateway needs a
  plain-HTTP signalling port on the LAN.
- PoE details on the specific board.
- Firmware is C, a second codebase beside the Rust crates.

## Spike, when we get to it

One or two boards: join as a station over PoE, two GPIO keys and a talk LED, then measure
connect time, CPU load and key-to-ear latency against a phone. Screen and encoders after that
works.
