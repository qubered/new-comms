---
title: Set up the local network
---

## The audio path

Phones and hardware bridges connect to the show computer over the local network. Loading a web page uses TCP; live audio uses UDP. A network that permits the page but blocks peer traffic or UDP can show a working interface with no sound.

Use a dedicated comms network where practical. Connect the host by Ethernet, put operators on a suitable 5 GHz SSID, and turn **client isolation** off for that comms network so its devices can reach the host. Keep guest/public networks separate. Manager has no administrator login, so access to this LAN is part of control over the show.

Do not expose Manager or the gateway directly to the public internet. This release has no configured TURN relay or supported off-site calling workflow.

## Addressing

Give the host a stable address, preferably with a DHCP reservation on the router. The address operators enter, the address the audio router advertises and the names/addresses on the HTTPS certificate must all make sense for the same network.

Multiple adapters, VPNs and virtual network interfaces can confuse automatic address selection. If necessary, specify the reachable **local** IPv4 address at launch:

```bash
COMMS_MEDIA_IP=192.168.10.20 npm run show
```

Use your actual assigned address. This variable does not assign an address to the computer and cannot make a remote or unbound address usable. Disconnecting a VPN or changing the selected interface may also require a new certificate; see [HTTPS](https.md).

## Firewall checklist

| Traffic | Default | Purpose |
| --- | --- | --- |
| TCP to host | 8443 | Talk, Manager and secure signalling |
| TCP to host | 8080 | Hardware registration and HTTP tools |
| Bidirectional UDP | Dynamically allocated media port(s) | Browser and node audio |
| Local TCP | 7100, loopback | Host services communicate internally |
| TCP to guide server, if running | 3000 | Optional user guide |

Allow the audio-router process and relevant LAN traffic in the host firewall. If the venue needs a fixed router media port:

```bash
MIX_ROUTER_PORT=40000 npm run show
```

Permit bidirectional UDP between clients and that host port; clients and nodes still use their own local ports. Do not expose the internal control listener externally. Development-only ports 5173/5174 are not needed for `npm run show`.

## WiFi starting point

Where your access point exposes the controls, use WMM, consider DTIM 1, and test with TWT disabled. Choose a legal, uncongested channel under the access point’s configured country rules. These are starting points for venue testing, not proof of good coverage or guaranteed delay.

Walk the actual operating areas with the actual phones, including crowded locations and transitions between access points. Test listening-only operation, speaking, screen lock and reconnection. A strong signal icon does not establish low jitter or low airtime contention.

## When a page loads but audio does not

First check the correct audio device, microphone permission and routing. Then check UDP firewall rules, client isolation, the advertised media address and whether a VPN is redirecting traffic. Compare a wired browser with a WiFi browser to narrow the problem. See [troubleshooting](../operate/troubleshooting.md) and [latency testing](../operate/latency.md).
