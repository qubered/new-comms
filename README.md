# new-comms

Comms anyone can run on devices they already own. Open Talk on phones and laptops, choose a station, and talk over ordinary local WiFi. One computer runs the show; no accounts, PTP or managed switches are required. Audio interfaces are optional bridges.

The [v2 spec](docs/superpowers/specs/2026-09-29-new-comms-matrix-design.md) and [rebuild plan](docs/superpowers/plans/2026-09-29-new-comms-matrix-rebuild-plan.md) describe the port model. The old channel-based application is preserved at the `v1-channels` tag.

## User guide

Read the [published user guide](https://qubered.github.io/new-comms/). The [guide source](website/docs/welcome.md) covers installation, configuration, operator workflows, hardware, show-day checks, troubleshooting and the reasoning behind the system. It includes screenshots and worked examples.

```bash
npm ci
npm run docs:build
npm run docs:serve -- --port 3000
```

Open `http://localhost:3000/` (or `http://<computer-ip>:3000/` on the LAN). The guide is a standalone Docusaurus site with local search. `npm run docs` starts its editing preview; `website/build/` is the static output. GitHub Pages automatically publishes documentation changes merged to `main`.

## Start a show

Install Node 22.12+, the Rust toolchain in `rust-toolchain.toml`, and libopus (`brew install opus` on macOS). Linux audio nodes also need the ALSA development libraries.

```bash
npm install
npm run dev
# In another terminal, seed an empty show:
npm run seed
```

The launcher prints the Talk and Manager addresses. Development uses HTTPS because browsers require a secure page for microphone access. Trust the development certificate on each test device, or configure a trusted certificate for venue use. For a production build:

```bash
npm run show
```

- Talk: `https://<computer-ip>:8443/`
- Manager: `https://<computer-ip>:8443/manager/`
- Hardware nodes and local tools: `http://<computer-ip>:8080/`

Keep all devices on the same LAN. Allow mix-router through the computer’s UDP firewall. Set `MIX_ROUTER_PORT=40000` to use a fixed media port if needed.

## Configure the ports

In Manager → **Ports**, create a station for each operator and a conference for a party line. On each station, assign **Call to conference** to a key. Listening to that conference is permanent; holding or latching the key adds the operator’s microphone. The seed creates four stations, two conferences and an All call group.

Stations have at most six numbered keys plus **Reply**. Keys can hold multiple functions and use Hold, Tap or Tap/hold mode. Standing functions use **Always**, **Vox** or **On call** instead of a key.

- **Call to port** calls a station or output directly.
- **Call to group** fans out to the group’s stations and outputs.
- **Listen to** on a key creates a monitor key; on Always it appears under “Also hearing”.
- **IFB** combines a program source and interruptions, dimming or cutting program while an interruption is open.
- **Route audio** lets a trigger switch a route between other ports.

**Groups & conferences** shows derived membership. Adding a station assigns its next free key; adding hardware writes a standing function. **Matrix** is a view of the functions, with cells linking to the owning port. **Incoming** shows routes owned elsewhere. **Live** shows open keys, Vox, callers and items needing attention. An empty conference can be created first and is flagged until it has a talker.

Save changes in the port editor. Invalid routes are rejected without partially changing the show. Remove referring functions before deleting a port or disabling a channel they use.

Unsaved port and node drafts stay available while you navigate Manager. The unsaved-changes banner returns you to each draft or lets you discard it. Failed saves retain the draft; pending saves stay locked across navigation. Reloading or closing the page warns about unsaved edits. Drafts are kept in memory, not browser storage. If another Manager removes a port or node, its draft remains viewable for copying or discarding.

On Talk, choose a station. The top bar names incoming direct callers. Reply targets the last caller that can receive audio; a microphone input can call you but cannot receive a reply. **Levels** sets volumes per source, and the dock controls master volume and mic kill. Red means the operator’s microphone is open, while listen keys remain dimmed.

## Hardware bridges

```bash
npm run node -- --list
npm run node -- --gateway http://<computer-ip>:8080 \
  --name "Stage rack" --device "Scarlett 18i20" --node-id stage-rack
```

Use the exact device name printed by `--list`. Interfaces must support 48 kHz. `--node-id` gives the bridge a stable explicit identity; otherwise one is derived from hostname, node name and device selection. Keep the identity stable across restarts.

The node appears in Manager → **I/O nodes**. Tick the input and output channels in use, assign short names and trims, then save. Every selected channel becomes its own port and its own mono Opus track. For example, Input 3 can feed SHOW while SHOW feeds Output 7 independently of the other circuits.

In-use changes replace the node’s session automatically. Function and trim changes do not require a node restart. Trims are applied once in the router. The node re-registers in the background and retries across gateway outages. Start without selected channels, then configure them in Manager.

## Persistence and API

The show lives in `data/state.json`: ports, node selections and operator volumes. Stop the gateway before editing the file manually. Loading a v1 show migrates it automatically and preserves the original as `state.json.v1.json`.

When upgrading an existing hardware bridge, start it with `--node-id` set to its migrated node ID (the old hardware pack ID in the state file). The new default derived identity cannot infer that old ID. Migration preserves selected physical channel numbers and disabled directions; an ambiguous selection stops migration with an error instead of routing another channel.

Useful environment variables:

| Variable | Purpose |
| --- | --- |
| `COMMS_DATA` | State file path |
| `COMMS_NAME` | Override the show name in the apps |
| `PORT`, `HTTPS_PORT` | HTTP and HTTPS ports; defaults 8080 and 8443 |
| `COMMS_MEDIA_IP` | Override the router’s advertised media address |
| `MIX_ROUTER_PORT` | Pin the UDP media port |
| `MIX_ROUTER_ADDR` | Gateway’s control destination; default `127.0.0.1:7100` |
| `MIX_ROUTER_CONTROL` | Router’s control listener address |

The v2 API is under `/api/v2`: `state`, `events`, `health`, `ports`, `nodes/register`, `nodes/:id`, `show` and `media/sessions`. Port and node updates use `PUT`. Replacing a complete show uses `PUT /show`. Requests are validated against `packages/protocol/schema/protocol.schema.json`; generated TypeScript is checked by typecheck. SSE sends a snapshot followed by revisioned deltas, and clients resynchronize on a gap. Public state omits station PINs; PINs are four digits and stored in the local state file. Manager trusts the local network and has no account system.

A station has one active session; another device choosing it takes over and releases the previous keys. The gateway and router are separate processes. Restarting the gateway preserves router audio, and reconnect synchronization restores live state. Restarting the router requires the clients to reconnect.

## Audio and WiFi

The router mixes at 5 ms, with 48 kHz mono Opus and 10 ms downstream packets. Its adaptive jitter queue targets measured arrival jitter with a one-frame floor, drains excess backlog gradually, and uses Opus packet-loss concealment on underrun. Health stats expose queue depth and target per track. The router marks UDP audio DSCP EF; access-point behavior still matters.

Talk keeps a sending audio track even when the mic is unavailable or off, using silence and disabling Opus DTX. This is intended to keep phone WiFi downlinks awake. It also requests a screen wake lock, runs heartbeat timing in a worker, registers media-session controls and restores audio after returning to the foreground. Device selection is in **Audio devices**; speaker selection depends on browser support. Physical iOS/Android screen-lock behavior still needs venue validation.

Recommended starting WiFi configuration:

- A dedicated 5 GHz SSID for comms, with client isolation off.
- Channel 44 or 149 where permitted by the access point’s country configuration.
- WMM on, DTIM 1, and TWT off when those controls are available.
- Keep the show computer wired to the access point where practical.

The proposed acceptance target is **p50 ≤ 100 ms and p95 ≤ 150 ms mic-to-ear** on the recommended WiFi. This is a target, not a measured promise. See the [verification record](docs/research/2026-09-29-v2-verification.md) for measured results and remaining physical-device checks.

Talk menu → **Latency test** (or `/#latency`) runs a synthetic marker through the browser, network and router without a microphone. It measures software round trip; halving that number is only a rough one-way estimate and excludes acoustic/device delays. Full mic-to-ear measurements need two devices and a recorder, with repeated impulses and separate p50/p95 results for screen-on, screen-locked and listening-only operation.

## Development checks

```bash
npm run typecheck     # includes generated-schema freshness
npm test              # protocol, gateway, Talk and Rust tests
npm run build         # production apps
npm run smoke         # real router + WebRTC clients, v1 reference and v2 routing/reconnect cases
```

Regenerate types with `npm run generate -w @comms/protocol` after changing the schema. `npx tsx scripts/seed-v2.ts --output /path/to/state.json` writes a v2 seed to a new file without contacting a gateway.

The repository layout remains `apps/talk`, `apps/manager`, `services/gateway`, `crates/mix-router`, `crates/comms-node` and `packages/protocol`. Parallel routes between the same source and destination carry that source once, using the highest active gain after IFB dim. Their individual functions and gates remain visible and editable. A real interface on another machine, WiFi latency and long-running locked-phone behavior require physical acceptance testing before a live show.

An IFB already feeds its configured destination; adding a monitor to that destination does not double its audio. Physical source routes close when their session disconnects, releasing incoming calls, On Call gates and IFB interruptions. Always remains active during silence while connected; use Vox when an interrupt should follow signal activity.
