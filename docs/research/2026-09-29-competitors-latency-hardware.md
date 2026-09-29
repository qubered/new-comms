# Competitors, latency and a hardware path

Research, 2026-09-29. Not a spec: nothing here is decided. Prices are US street or list prices
found on the linked pages and move often. Every latency figure is marked:

- **V**: vendor claim (datasheet, manual, release notes)
- **R**: a review or press article states it; unclear whether measured
- **S**: a standard
- **E**: our own estimate from component figures
- **?**: could not verify, or sources disagree

No independent, instrumented latency measurement of any competitor was found. Riedel, RTS and
Clear-Com FreeSpeak II publish no end-to-end figures at all.

## 1. Short version

- **On latency we can already beat every browser/app intercom, and cannot yet match beltpacks.**
  Browser incumbents publish 200 to 360 ms (Telos Infinity VIP, Eyevinn Open Intercom); our
  software path measures about 50 ms one way on one machine and is estimated at 110 to 150 ms p50
  from a phone on WiFi. Wireless beltpacks sit at 35 to 60 ms and wired IP systems at 10 to 35 ms.
- **The biggest cheap wins are ours to take, not the browser's**: a jitter queue in mix-router that
  drains after a burst (today it can sit at 80 ms indefinitely), keeping phones sending so WiFi
  power save never kicks in, and DSCP EF on the router's socket. See §4.
- **Under about 60 ms on WiFi needs our own client stack** (native app or dedicated hardware),
  because the browser's jitter buffer (NetEQ) cannot be pushed below its own estimate.
- **The market gap is adoptability.** Pro systems cost thousands per endpoint ($2 to 4k
  interfaces, $1.2 to 1.5k wired beltpacks, $2 to 3k wireless packs plus about $4k per 10-pack
  transceiver) and need a specialist to set up. The app-based systems that crews actually pick up
  need a native install and a dedicated server, and publish no WiFi latency. Comms that runs from
  a link, on phones people already own, with pro depth underneath, is the opening. Direction
  (decided, spec "Product direction"): we are not another AES67 platform; interop is a bridge.
- **Hardware order**: accessories first (PTT buttons, Stream Deck keys, a Pi appliance), then an
  I/O box that bridges existing rigs in (2-wire, 4-wire, GPIO; AES67 optional), then a PoE
  keypanel and wired beltpack, then a WiFi 6 beltpack. DECT last, if ever. §6.

## 2. Where we are today

From `README.md` and the code:

| Measurement | Figure |
|---|---|
| Mixer alone, loopback (`npm run smoke`) | 15 to 30 ms p50 |
| Browser software round trip, Chrome, same machine, no WiFi | 83 to 103 ms (about 50 ms one way) |
| Phone on WiFi, mic to ear | not measured yet |
| Target (v1 spec) | under 150 ms mic to ear on LAN WiFi |

Things in the code that matter for latency:

- The gateway adds `a=ptime:10` to the answer (`services/gateway/src/server.ts:131`), so browsers
  do send 10 ms frames. 10 ms is the floor for the browser's built-in encoder.
- The browser uplink is **not CELT-only**, whatever we ask. Chrome always encodes mono in Opus VOIP
  mode (6.5 ms lookahead, not 2.5), and at its default ~32 kbps it very likely picks SILK or hybrid.
  Mode does not change latency much; lookahead does, and we cannot change it from a browser. Verify
  by logging the Opus TOC byte in mix-router (configs 16 to 31 are CELT-only).
- `receiver.jitterBufferTarget = 0` (`apps/talk/src/intercom.ts:371`) does nothing useful. In
  NetEQ it only raises a floor; the target is the 95th percentile of arrival delay and starts at
  80 ms ([delay_manager.cc](https://webrtc.googlesource.com/src/+/refs/heads/main/modules/audio_coding/neteq/delay_manager.cc)).
  Harmless, but it is not a lever.
- mix-router primes at 20 ms, re-primes on underrun, and only trims above 80 ms back to 30 ms
  (`crates/mix-router/src/peer.rs:30-33`). After a WiFi stall the late burst sits in the queue and,
  because production and consumption rates are equal, stays there. This is the largest cheap win.
- AEC, noise suppression and AGC are all on (`intercom.ts:169`). With a wired headset, AEC is not
  needed.
- The README notes Chrome stops sending during silence. A phone that stops sending lets its WiFi
  doze, and an AP holds downlink frames for a dozing phone until the next beacon (about 100 ms,
  up to 300 ms for multicast). Measured by Mozilla at about 100 ms added
  ([bug 888268](https://bugzilla.mozilla.org/show_bug.cgi?id=888268)). Needs checking on a phone.

## 3. Competitors

### 3.1 Table

| Product | Core | Transport and codec | Stated latency | Clients | Price |
|---|---|---|---|---|---|
| **Unity Intercom** | Central server on a Mac | Proprietary UDP/TCP; codec undisclosed, ~50 kbps VBR | 10 ms end to end for *wired* clients in "ultra-low latency" mode; nothing for phones (V) | iOS, Android, Mac, Windows | $660 base (3 users), ~$105/user after; Pro $600/yr |
| **Clear-Com LQ / Gen-IC + Agent-IC** | Link group of up to 6 units; forwards loudest talkers, client mixes | Opus 5 to 60 ms frames (default 10 ms, 64 kbps) | 25 to 80 ms per unit at the default jitter buffer (V) | iOS, Android, Mac, Windows | LQ $2.6 to 5.6k; client $475 perpetual or $290/yr |
| **Clear-Com Eclipse HX + Agent-IC** | Central matrix mixes per client | G.722, 7 kHz, 140 kbps | Receive ≤12 ms LAN, ≤200 ms internet (V) | same | quote |
| **Clear-Com FreeSpeak Edge / Arcadia** | Central station | Own 5 GHz radio; AES67 or Dante | <35 ms; 60 ms pack to pack (V) | beltpacks | pack $2.5 to 3.1k; Arcadia from $15.4k |
| **Riedel Artist + Virtual SmartPanel** | Fibre-ring matrix; WebRTC gateway for apps | ST 2110-30/AES67; WebRTC | none published (?) | browser, iOS, Android | per-user subscription, quote |
| **Riedel Bolero** | Artist-integrated or standalone (antennas mix) | DECT 1.9 GHz, 7 kHz, AES67 antennas | ~35 ms pack to pack (R, ?) | beltpacks | ~$3k per pack |
| **RTS VLink** | Central software matrix | WebRTC browser panel, SIP, Dante | none published (?) | browser, iOS, Android, desktop | quote |
| **RTS ROAMEO** | Matrix + DECT | DECT + OMNEO (Dante) | ~40 ms pack to pack (V) | beltpacks | quote |
| **Green-GO** | **No master**: every device mixes itself | Multicast UDP, near-PCM 32 to 48 kHz, DSCP 46 | 10 ms headset to headset, wired (V) | hardware; Talk app via Bridge X | BPX $1.2k; no licence fees |
| **Telos Infinity VIP** | Matrixless containers, on-prem or cloud | WebRTC/Opus, AES67, NDI, SIP | 360 ms full path, down from 700 (V) | browser, iOS, Android | per server + per panel |
| **Eyevinn Open Intercom** | SFU, open source (MIT) | WebRTC/Opus; Node/Fastify + Go | "sub-200 ms" (V) | browser | free, or €69/month hosted |
| **Pliant MicroCom / CrewCom** | Standalone RF / control units | 900 MHz and 2.4 GHz FHSS | <35 ms (V) | beltpacks | pack ~$2.2k |
| **Hollyland Solidcom C1** | Master headset, up to 3 hubs over IP | DECT, 16 kHz | "40 ms" vs "near-zero" (?) | headsets | $799 for 4 |
| **Studio Technologies 5422A** | Dante engine | Dante/AES67 PCM | <0.1 ms processing + Dante (V) | Dante beltpacks | quote |

Sources:
- Unity: [FAQ](https://www.unityintercom.com/faq-1), [manual](https://update.unityintercom.com/Manuals/Unity_Manual3-en.pdf), [pricing](https://www.unityintercom.com/pricing)
- Clear-Com LQ: [datasheet](https://clearcom.com/DownloadCenter/datasheets/LQSeries/LQ_Series_Datasheet.pdf), [latency table](https://www.clearcom.com/DownloadCenter/manuals/LQSeries_Online_Manual/Content/Project/New%20features%20LQ3/local_audio_mix.htm)
- Agent-IC: [datasheet](https://www.clearcom.com/DownloadCenter/datasheets/Agent-IC/Agent-IC_Datasheet.pdf); Clear-Com [2023 MSRP](https://anuvisiontech.com/wp-content/uploads/2023/03/Clear-Com-MSRP-2023.pdf)
- FreeSpeak Edge: [datasheet](https://www.fullcompass.com/common/files/60517-FSEBP50X4DataSheet.pdf); HelixNet: [networking guide](https://www.clearcom.com/DownloadCenter/technicaldocs/HelixNet_IP_Networking_Guide.pdf) (30 to 35 ms pack to pack, V)
- Riedel: [Bolero brochure](https://www.riedel.net/fileadmin/user_upload/800-downloads/02-Brochures/EN/BOLERO_Brochure_EN.pdf), [VSP](https://www.riedel.net/en/products-solutions/intercom/smartpanels/virtual-smartpanels), [VSP STUN/TURN](https://manuals.riedel.net/en/stage/1.0/riedel-stagetm-virtual-smartpanel-how-to-implement)
- RTS: [VLink](https://rtsintercoms.com/technology/cloud-based-intercom/), [ROAMEO](https://www.fullcompass.com/prod/608061-rts-tr-1800-dect-4-channel-wireless-beltpack-for-roameo-intercom-system), [OMNEO panels](https://products.rtsintercoms.com/na/en/oki) (<20 ms, V)
- Green-GO: [network guide](https://manual.greengoconnect.com/en/guides/network/), [features](https://manual.greengoconnect.com/en/features/)
- Telos: [VIP](https://telosalliance.com/ip-intercom-communications/telos-infinity/VIP-virtual-intercom-platform), [release notes](https://docs.telosalliance.com/docs/infinity-software-update-and-release-notes)
- Eyevinn: [Open Intercom](https://www.eyevinn.se/open-intercom.html)
- Pliant: [MicroCom](https://www.bhphotovideo.com/c/product/1807045-REG/pliant_technologies_pmc_900m_microcom_m_900mhz_full_duplex.html); Hollyland: [C1 Pro](https://www.hollyland.com/product/solidcom-c1-pro); Studio Technologies: [5422A](https://studio-tech.com/products/m5422a/)

### 3.2 Who matters most to us

- **Riedel Virtual SmartPanel** is the closest product: WebRTC keys in a browser, iOS and Android,
  on an Artist matrix. It needs Artist or SAME plus the STAGE platform and a subscription. We are
  the same idea without the frame.
- **Eyevinn Open Intercom** is the closest *stack*: WebRTC, Node/Fastify, browser-first, MIT
  licensed, backed by SVT, YLE, NRK and TV2. It has no Artist-style model and claims only
  "sub-200 ms". Worth watching; it will set expectations for "free".
- **Unity Intercom** is the product people mean by "comms on your own phone". Cheap, perpetual
  licences, rich feature list (tally to the phone's LED, program feeds panned per ear). Needs a Mac
  server and a native app, publishes no WiFi latency, and its reviews complain about AirPods and
  "stuck on speaker".
- **Green-GO** is the template for the business: free software, no master, money made on $1.2 to
  3.7k endpoints. Its 10 ms wired figure comes from sending near-PCM multicast with no codec.
- **Clear-Com LQ** shows the Opus-over-IP ceiling for a hardware vendor: 25 to 80 ms per unit at
  10 ms frames. That is the number to beat for our hardware nodes.

### 3.3 What app users complain about

The complaints in the Agent-IC and Unity reviews are not about latency. They are:

- dropped audio when roaming between access points, with no automatic reconnect
- the screen locking and background audio stopping
- Bluetooth and AirPods routing (stuck on speaker, battery drain)
- every source going live at login, a loud burst
- feedback on the phone speaker

Our reconnect handling and "latches never survive a reconnect" already address part of the first.
The rest is a checklist for phase 6.

## 4. Latency

### 4.1 How much is enough

| Situation | Threshold | Source |
|---|---|---|
| Hearing your own voice in headphones | ~10 ms is a comb-filter "ears sucked out" effect; 20 to 30 ms induces stutter | [Telos, Hierarchy of Latency](https://telosalliance-uat.s3.amazonaws.com/public/White%20Paper%20Assets/TheHeirarchyOfLatency.pdf) |
| DECT sidetone | ≤5 ms round trip (S) | [ETSI EN 300 175-8](https://www.etsi.org/deliver/etsi_en/300100_300199/30017508/02.08.01_60/en_30017508v020801p.pdf) |
| Conversation | 0 to 150 ms preferred, 150 to 400 degraded (S) | [ITU-T G.114](https://www.itu.int/rec/dologin_pub.asp?lang=e&id=T-REC-G.114-200305-I%21%21PDF-E) |
| Operator feedback loop | 50 to 70 ms | Telos, above |
| IFB against picture | EBU R37 +40/−60 ms | [audio sync](https://en.wikipedia.org/wiki/Audio_synchronizer) |

G.114's 150 ms is a telephone number. Intercom buyers compare against analog party line (0 ms)
and beltpacks (35 to 60 ms). Two practical consequences:

- Never return a talker's own voice through the network. We already mix N-1; keep it that way and
  never offer network sidetone.
- In a shared room, people hear the acoustic voice and the comms feed together. Below about 30 ms
  they fuse; around 100 ms the feed is a distinct echo (E).

### 4.2 Where the time goes, phone browser on WiFi (today's architecture)

| Component | Typical ms | Best ms |
|---|---|---|
| Mic and OS capture buffer | 10 to 20 | 5 |
| Browser 10 ms block + Opus frame | 10 | 10 |
| Opus lookahead (VOIP mode, fixed in browsers) | 6.5 | 6.5 |
| WiFi uplink (awake, best effort) | 3 to 10 (p95 20 to 50) | 1 to 2 |
| mix-router jitter queue (20 ms prime, can creep to 80) | 20 to 40 | 10 |
| Mixer tick phase (10 ms tick) | 0 to 10 | 0 |
| Mix + Opus low-delay lookahead | 3 | 2.5 |
| WiFi downlink (power-save spikes 100 to 300) | 3 to 10 | 1 to 2 |
| Browser jitter buffer (NetEQ) | 40 to 80 | 10 to 20 |
| Decode, 10 ms pull, OS output buffer | 15 to 30 | 8 to 10 |
| **Total** | **110 to 200, p50 ~140 (E)** | **55 to 70 (E)** |

Bluetooth headsets add roughly 100 to 250 ms on top (E; general knowledge, not sourced here).

### 4.3 What each kind of client can reach (E)

| Client | Typical | Best | Comparable to |
|---|---|---|---|
| Phone browser on WiFi, fixes in §4.4 applied | 80 to 120 | 55 to 70 | better than every browser incumbent |
| Native app on WiFi (Oboe / iOS RemoteIO, 5 ms Opus, own jitter buffer, 5 ms mixer tick) | 45 to 75 | 25 to 30 | FreeSpeak Edge, ROAMEO |
| Our own WiFi 6 beltpack (I2S codec, 2.5 ms frames, 2.5 ms tick) | 25 to 40 | 15 to 20 | Bolero, Pliant, HelixNet |
| Wired panel on AES67 (1 ms packets) | 5 to 10 | 2 to 3 | Green-GO, RTS OMNEO |
| comms-node on Ethernet, today's Opus 10 ms path | 45 to 70 | | Clear-Com LQ |

### 4.4 What to change, most value first

1. **Make the mix-router jitter queue adaptive.** Target about the p95 of measured arrival jitter
   with a one-frame floor; when above target, drain gradually (drop or cross-fade a frame); on
   underrun, use Opus PLC instead of re-priming. Export queue depth per peer. Saves 10 to 40 ms,
   mostly at p95 (E).
2. **Measure p50 and p95 per client type on real phones.** Pull `jitterBufferDelay`,
   `jitterBufferEmittedCount` and `jitterBufferTargetDelay` from `getStats`; log inter-arrival
   jitter and the Opus TOC byte in mix-router. Screen on, screen locked, listen-only.
3. **Keep phones awake.** Always send, even when muted or silent (no DTX, no recvonly); add a small
   keep-alive for listen-only stations. Check whether Chrome's silence gap lets the phone doze.
4. **Mark DSCP EF (46) on mix-router's UDP socket.** WMM access points map it to the voice queue
   on the downlink. Browsers do not mark their uplink by default, so the downlink is what we control.
5. **Publish a WiFi recipe.** Dedicated 5 GHz SSID for comms, channel 44 or 149 (where Apple's
   AirDrop radio hops, which otherwise causes 3 to 90 ms swings,
   [The Register](https://www.theregister.com/2025/10/23/apple_airdrop_awdl_latency_research/)),
   20 MHz, WMM on, DTIM 1, target wake time (TWT) off, 802.11r for roaming, about 15 to 20 phones per
   radio at 10 ms frames (E, scaled from
   [Cisco](https://www.cisco.com/en/US/docs/solutions/Enterprise/Mobility/emob30dg/Voice.html)).
6. **Headset mode**: echo cancellation and AGC off when a wired or USB headset is in use; keep noise
   suppression. Saves 0 to 10 ms (E, measure it).
7. **5 ms mixer tick**, keeping 10 ms browser uplink frames, and optionally 5 ms downlink frames
   (all browsers decode them). Halves the tick phase wait; doubles downlink packet rate, so only on
   uncongested networks.
8. **comms-node**: Opus restricted low-delay at 2.5 to 5 ms frames, fixed small cpal buffers
   (128 to 256 samples), ≤5 ms jitter buffer on wired links.
9. **Longer term, for phones under 60 ms**: a native app, or a browser stack of AudioWorklet +
   WebCodecs Opus (`frameDuration`, `application: "lowdelay"`) + WebTransport datagrams + our own
   jitter buffer. Now shipping in Chrome, Firefox and Safari 26.x; Safari's Opus *encoding* in
   WebCodecs and echo-cancellation behaviour outside WebRTC are unverified.
10. **Restate the target** once measured, e.g. "p50 ≤ 100 ms, p95 ≤ 150 ms on the recommended
    WiFi", with a separate figure for hardware. A single number hides the WiFi tail that users feel.

Items 1, 3, 4 and 7 are mix-router changes that fit phase 1 of the rebuild plan (it already ends
with "latency floor re-measured"). Item 2 fits phase 6.

## 5. Features: table stakes and gaps

Against spec v2 rev 3:

| Feature | Everyone has it | Us |
|---|---|---|
| Party lines, talk and listen per key | yes | yes (callToConference) |
| Per-key listen volume | yes | yes (operator volumes) |
| Point-to-point and reply | yes | yes (callToPort, Reply) |
| Program feed, IFB with interrupt | yes | yes (listenToPort, IFB with dim) |
| Groups, roles | yes | yes (groups; stations as roles) |
| Vox | common | yes |
| Encryption | AES-256 standard | yes by default (DTLS-SRTP) |
| Call signalling (call light + tone) | yes | out of scope |
| All-call / priority override | yes | not in MVP (priority is one field, spec §3) |
| 4-wire interface | yes | yes via comms-node and any audio interface |
| 2-wire party-line interface (Clear-Com, RTS TW) | yes | no; needs hybrid hardware (§6) |
| GPIO in and out | yes | out of scope |
| Remote users over internet | yes | out of scope |
| Bluetooth headset handling | yes, and the top complaint | untested |

Differentiators seen in the field, roughly in order of how often they come up:

- browser clients with nothing to install (VLink, Riedel VSP, Telos, Open Intercom; we have this)
- no single point of failure (Green-GO)
- tally to the phone (Unity: ATEM, vMix, TriCaster, TSL)
- Stream Deck and Bitfocus Companion control (Unity, Telos, Open Intercom, Clear-Com, Riedel)
- SIP and phone lines (VLink, LQ, Telos)
- recording per client, video in the panel (VLink)
- ST 2022-7 or redundant WebRTC paths (Riedel VSP, 2110 systems)

## 6. Hardware

### 6.1 Incumbent prices

| Category | Examples | Price |
|---|---|---|
| Matrix / central station | Riedel Artist-1024 (16 ports), Clear-Com Arcadia X4-32P | $11.2k, $17.4k |
| 32-key panel | RTS KP-5032, Riedel RSP-1232HL | $6.0k, $4.5k |
| Rack station | Green-GO MCX | $3.7k |
| Wired PoE beltpack | Green-GO BPX, Clear-Com HXII-BP | $1.2k, $1.5k |
| Wireless beltpack | FreeSpeak Edge, Bolero, FreeSpeak II, Pliant CRP-22 | $2.2k to 3.1k |
| Wireless transceiver / antenna | FreeSpeak Edge transceiver (10 packs) | $4.0k |
| Prosumer DECT | Hollyland Solidcom M1 pack | $449 |
| 2-wire / 4-wire interface | Clear-Com LQ-4W2, Green-GO Interface X, Riedel NSA-002A | $3.0k, $2.1k, €3.9k |

Sources: [Markertek](https://www.markertek.com/product/artist-1024/riedel-artist-1024-19-inch-2ru-artist-intercom-frame-holds-up-to-10x-uic-universal-interface-cards),
[Full Compass](https://www.fullcompass.com/prod/602536-clear-com-arcadia-x4-32p-arcadia-32-port-ip-based-intercom-central-station-dante-xlr-4m-headset-connector-1ru),
[Adorama](https://www.adorama.com/grogbpx.html),
[Sweetwater](https://www.sweetwater.com/store/detail/LQ4W2--clear-com-lq-4w2-compact-2-port-4-wire-partyline-ip-interface),
[Hollyland](https://store.hollyland.com/products/solidcom-m1-beltpack).

### 6.2 Staged roadmap (all BOM and effort figures E, team of 2 to 4)

| Stage | What | BOM | Effort | Main risks | Unlocks | Sell at |
|---|---|---|---|---|---|---|
| 1. Appliances | comms-node image for Pi 5 with a HAT or USB interface; show-server image; Stream Deck as keys; Bluetooth PTT buttons for phones | $150 to 400 off the shelf | 1 to 3 months | Pi price swings, USB clock drift, support load | "a box that just works"; first hardware revenue | $500 to 900 |
| 2. I/O box | CM5; 4× 4-wire, 2× 2-wire (Clear-Com/RTS switchable hybrid), 4 GPI + 4 GPO relays, PoE; AES67 open source, Dante optional | $250 to 600 without Dante | 6 to 9 months | 2-wire hybrid tuning and line power; Dante licence terms; PTP accuracy | plugs into every existing rig; undercuts $2 to 3k interfaces | $900 to 1,500 |
| 3. Keypanel | CM5 or i.MX 93; 12 or 16 keys with displays, encoders, speaker, gooseneck, headset, GPIO, PoE+ | $300 to 700 | 9 to 15 months | enclosure tooling ($10 to 40k), echo cancellation, display supply | broadcast and theatre credibility; replaces $3.7 to 6k panels | $1.5 to 2.5k |
| 4. Wired beltpack | ESP32-P4 or i.MX 93; 2 to 4 keys, OLED, XLR-4/5 headset, 802.3af, IP54 | $120 to 250 | 6 to 12 months | ruggedness, connectors, ESD, headset noise | undercuts $1.2 to 1.5k packs | $500 to 800 |
| 5. Wireless beltpack | A: WiFi 6 (ESP32-P4 + C5, or i.MX 93W) with a recommended AP kit. B: DECT with Renesas or Synaptics modules and our own antennas | $150 to 300 per pack | A: 12 to 18 months. B: 24 to 36 | battery, SAR, UN38.3, roaming, RF credibility; DECT needs its own infrastructure and US/EU variants | the high-margin category | A: $700 to 1,200. B: $1,000 to 1,500 |

One CM5 or i.MX carrier board and one OS image can run the existing comms-node Rust binary on
stages 2 to 4. The ESP32-P4 path is shared by stages 4 and 5A.

### 6.3 Platforms

- **Raspberry Pi 5 / CM5**: runs str0m, cpal and Opus unchanged. Best start. Prices rose with
  memory costs in 2026 ([Raspberry Pi](https://www.raspberrypi.com/news/more-memory-driven-price-rises/)).
- **NXP i.MX 8M Mini**: Audinate's Dante Embedded Platform reference design runs on it
  ([DEP datasheet](https://www.getdante.com/wp-content/uploads/2025/02/dante-embedded_platform_datasheet.pdf)).
  Choose it if Dante in software matters most.
- **NXP i.MX 93 / 93W**: 2× GbE with hardware PTP/TSN for accurate AES67, 7 I2S ports; the 93W
  integrates WiFi 6 ([NXP](https://www.nxp.com/products/IMX93W)). Good for panels and a Linux
  wireless pack.
- **TI AM62x**: under $5 at volume; a cost-down option once proven on CM5.
- **ESP32-P4 + ESP32-C5**: P4 hosts audio; C5 is a dual-band WiFi 6 radio in mass production.
  Espressif's `esp_peer` does Opus, DTLS-SRTP, ICE and a jitter buffer in under 60 KB
  ([esp_peer](https://components.espressif.com/components/espressif/esp_peer/versions/1.2.7/readme),
  [esp-webrtc-solution](https://github.com/espressif/esp-webrtc-solution)). Opus at 10 ms mono is
  feasible; DTLS handshake time on roam and battery cost are unmeasured.
- **Codecs**: TI TLV320AIC3204 (low power, beltpack), Cirrus CS42L42 (headset detect), ADI
  ADAU1761 (SigmaDSP for panels), Nuvoton NAU88C22 (~$0.60, cheap desk station).
- **Dante**: Brooklyn 3 module, or DEP with "Dante Ready" so the customer buys the licence in the
  field. Pricing is NDA-only. **AES67 without royalty**: PipeWire ≥1.1 with linuxptp, or
  [aes67-linux-daemon](https://github.com/bondagit/aes67-linux-daemon); both need NIC hardware
  timestamping. Dante devices in AES67 mode can subscribe to us.
- **PoE**: 802.3af (12.95 W) covers beltpacks and interfaces; panels with speakers want 802.3at.
  Silvertel Ag5300 is a drop-in module; TI TPS2372 for cost-down.

### 6.4 WiFi or DECT for the wireless pack

| | DECT 1.9 GHz | WiFi 6, 5 GHz, our stack |
|---|---|---|
| Access | TDMA slots, predictable latency | contention, latency depends on the network |
| Spectrum | reserved; clear of UHF mics and IEMs; different US and EU bands (two variants) | shared with venue and audience WiFi |
| Audio | 7 kHz typical (Bolero) | as wide as we like |
| Roaming | seamless DECT handover | depends on AP 802.11r/k/v |
| Infrastructure | we build antennas and an IP bridge | none, or a recommended AP kit |
| Stack | new | reuses mix-router, WebRTC, Opus |
| Certification | FCC Part 15D + EN 301 406, custom-radio class | pre-certified modules cover the radio |

Everyone in pro wireless intercom is on DECT except Clear-Com FreeSpeak Edge, which went to 5 GHz
but still built its own transceivers rather than trust house WiFi. DECT NR+ (DECT-2020) is
promising for live audio but test labs and silicon are early.

The practical path: **start wireless with phones**. A rugged push-to-talk Android phone (Sonim
exposes its PTT key to apps as `com.sonim.intent.action.PTT_KEY_DOWN/UP`) running Talk, on a
managed 5 GHz network, is a wireless beltpack available today. Build a WiFi 6 pack once that
experience is proven. Treat DECT as a later, funded programme.

### 6.5 Certification (E where marked)

| Item | Cost | Time |
|---|---|---|
| FCC Part 15B, no radio or pre-certified module | $1.5 to 10k | 2 to 6 weeks |
| Custom radio | $5 to 30k | 4 to 16 weeks |
| SAR, body-worn (beltpacks) | +$3 to 30k | |
| CE RED with modules | not published | 4 to 6 weeks |
| DECT (FCC 15D + EN 301 406) | $20 to 60k (E) | 3 to 6 months (E) |
| UN38.3 battery transport | $500 to 930 | ~3 weeks |

Sources: [MarkReady](https://markready.io/learn/fcc-certification-cost),
[AESTECHNO](https://www.aestechno.com/en/ce-red-certification-iot/),
[spilma](https://www.spilma.com/en/guides/dect-forum-certification),
[JJR](https://www.jjrlab.com/news/how-much-does-un383-testing-cost.html).
Keeping stages 1 to 4 wired keeps certification to EMC and a declaration of conformity.

### 6.6 Off-the-shelf surfaces and how others did it

- **Elgato Stream Deck Module 32**: $200, unbranded, documented HID, no royalties
  ([Elgato](https://www.elgato.com/us/en/p/stream-deck-module-32-keys)). A keypanel's keys and
  displays as a subassembly.
- **Bitfocus Companion**: Clear-Com and Riedel already ship modules. A module for our REST/SSE API
  is low effort and highly visible.
- **Bluetooth PTT buttons** (Pryme, AINA): already supported by Unity and Telos.
- **Unity** sells software plus bundled hardware ($10.5k broadcast stations, headsets) before
  designing its own. **Green-GO** gives the software away and sells endpoints. **Blackmagic**
  puts a standard 2-wire port on cheap boxes, which is how it gets into everyone's rig.

### 6.7 Interop, most credibility per unit of effort first

These are bridges in through a comms-node, never requirements of the core (spec, "Product
direction"). They matter for selling into rigs that already exist, not for the first show.

| Standard | Why | Path | Effort (E) |
|---|---|---|---|
| 2-wire / 4-wire analog | every rig has it | stage 2 box | moderate |
| AES67 / ST 2110-30 | Riedel, Clear-Com and RTS all speak it; we become ports on their frames | PipeWire or aes67-linux-daemon in comms-node | medium |
| Bitfocus Companion | operators already use it | module against our API | low |
| NMOS IS-04/05 | discovery and connection in 2110 facilities | [nmos-cpp](https://github.com/sony/nmos-cpp) next to the gateway | medium |
| SIP | phone lines, callers, PBX | SIP user agent as a port type | medium |
| Dante | dominant in live sound | DEP or Brooklyn 3, or AES67 mode | licence + medium |
| Ember+ | broadcast control systems | provider in the gateway | low to medium |
| AES70 | device control (RTS OMNEO) | AES70.js | medium, later |

## 7. Not verified

- Latency for Riedel Artist, Bolero (the 35 ms figure is from a review page that returned 403),
  Clear-Com FreeSpeak II and Eclipse HX, RTS VLink and ODIN, Riedel VSP, and Hollyland.
- Unity's codec.
- User complaints on Reddit (not reachable from this session); app-store reviews used instead.
- That Chrome's uplink is SILK or hybrid rather than CELT (inferred from libopus thresholds).
- Chrome's silence behaviour letting a phone's WiFi doze in our setup.
- `jitterBufferTarget` on Safari, and Opus encoding in Safari's WebCodecs.
- Every estimate marked E, in particular the scenario budgets in §4.2 and §4.3 and all hardware
  BOM, effort and price figures.
- Dante DEP and Brooklyn 3 pricing (NDA-only), exact CM5 pricing in 2026.
