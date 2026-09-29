---
title: Join a show
description: Connect a phone or laptop, choose the right station, and check your audio before talking.
---

A **station** is your place in the show: its name, keys, listening routes and levels. It is not an account. The show operator creates stations in Manager and tells each person which one to use.

[![Talk station picker showing Stage Manager, Director and two cameras](/img/talk-picker.png)](/img/talk-picker.png)

<div className="caption">Choose a role from the current show. The picker does not warn that another device is already using it.</div>

## Before you join

Get three things from the show operator:

- The comms WiFi name and password.
- The **Talk** address for this show.
- Your station name and, if required, its four-digit PIN.

Join the comms network and connect your headset before opening Talk. Start with a comfortable, low device volume. For initial setup, see [Start a show](../setup/start-a-show.md), [Network](../setup/network.md) and [HTTPS](../setup/https.md).

Use the address you were given. A page on the show computer can work while a phone cannot reach it; a different WiFi network, a changed computer address or an untrusted certificate can all be responsible.

## Join, step by step

1. Open the Talk address in your browser. Wait for **Choose your station** and the show name in the top bar.
2. Check the show name. Do not join a similarly named station on a different show.
3. Tap your station. The smaller line under its name previews the targets of its numbered keys.
4. If the station has a **PIN** marker, enter its PIN. Ask the operator if it is rejected; there is no account-password reset flow.
5. Allow microphone access when the browser asks. Keep Talk open while it connects.
6. Wait for the connection message to disappear. Check the station name above the keys.
7. Ask a colleague for a short sound check. First listen; then use the agreed talk key and confirm that the colleague hears the correct person.

**Mic on** means a microphone is available and has not been muted with the dock button. It does not by itself mean a numbered talk key is open. However, the station may also have automatic **Always** or **Vox** microphone routes. The operator should tell you about those before use.

If you see **No mic**, listening can still work. Monitor keys and routes that control someone else's audio remain usable. Your own microphone talk keys and Reply are unavailable. See [Audio devices](audio-devices.md).

## One device per station

A station has one active connection. Choosing it on another device takes over that station and releases the previous connection's keys. The picker does **not** show you an occupied-station warning or ask for takeover approval.

For a deliberate handover:

1. Tell the other operator you are taking over.
2. On the old device, open the three-dot **Menu**, choose **Switch station**, and leave it on the picker. Close any other browser tabs using that station.
3. Join on the new device.
4. Check audio, levels and mic state again before resuming calls.

Do not leave both devices trying to use the same station. Automatic reconnection can cause them to interrupt one another. Two people who need to work at once need two stations, even if their keys are identical.

## Change station or leave

On the Talk screen, open **Menu → Switch station**. This ends your station connection and returns to the picker. Choose a different station only when the operator has assigned it to you.

Closing the page also ends its connection, but network loss or browser suspension may delay the system noticing. Use **Switch station** for a planned handover rather than relying on a disconnected phone eventually timing out.

## If the picker is not ready

| What you see | What to do |
| --- | --- |
| **Connecting…** without a station list | Check the supplied address, WiFi and certificate. Ask whether the show computer is running. |
| **Reconnecting…** and unavailable station buttons | Wait for the gateway connection to recover. Do not keep opening duplicate tabs. |
| **No stations yet. Add one in Manager.** | The operator must create station ports. Conferences and hardware inputs are not selectable stations. |
| **Couldn’t join** | Read the detail. Return to **Choose your station**, check the PIN or station assignment, then try again. |
| The page opens but audio will not connect | The web connection and audio connection are separate. Ask the operator to check the mixer, firewall and network. |

Continue with [Talk and listen](talk-and-listen.md).
