---
title: Preflight a show
description: Check the show, devices, routes and fallback before anyone depends on comms.
---

Finish configuration before the sound check. A station name in the picker proves that configuration loaded; it does not prove that its microphone, audio connection or headset works.

Use this checklist for every venue or meaningful equipment change. The [small-show recipe](../recipes/small-show.md) is a useful first system to test.

## Prepare the show computer

- Start the intended show and verify its name in both Talk and Manager.
- Keep the computer powered, prevent unintended sleep, and arrange access for the person running comms.
- Confirm the address distributed to operators matches the computer's current network address.
- In Manager, check the sidebar's **Gateway** and **Mixer** status. Resolve **The mixer is not running** before testing routes.
- Make a current [backup](../setup/backup-and-restore.md). Record where it is and who can restore it.
- Keep a written station assignment and routing summary. Include any automatic microphones and IFB destinations.

Do not expose Manager beyond the trusted show network. Station PINs help with station selection; they are not a Manager login or a replacement for network control.

## Check the network in the working area

1. Put the show computer and clients on the intended local network.
2. Check WiFi coverage at the actual operator positions, including backstage and movement paths.
3. Test with the expected number of devices present and with other venue network activity representative of the show.
4. Verify that client isolation, firewalls or a guest WiFi policy are not preventing devices reaching the show computer.
5. Confirm the phone trusts the show's secure address and can request microphone access.

Use the [network guide](../setup/network.md) for setup. A successful test next to the access point is not evidence that the loading dock or stage wings will work.

## Check every operator station

For each person:

1. Connect the assigned headset and open the supplied Talk link.
2. Join the assigned station. Close any older tab or device using it.
3. Read the station label and key headings aloud to the person running the check.
4. Confirm listening at a comfortable level.
5. Send a short message on each required talk destination. Ask someone at that destination to confirm both the voice and the correct route.
6. Verify the configured gesture: Hold, Tap or Tap/hold. Make sure the operator knows how to end a latch.
7. Check **Mic off** and, where used, Reply and listen keys.
8. If automatic microphone routes exist, confirm precisely when they open and how the operator stops them.

Opening **Levels** releases keys. If you use it during a check, reopen the intended route afterward before concluding that audio has failed.

## Check specialist routes

| Route | What to prove |
| --- | --- |
| Conference | Every intended member hears the others; nobody is unintentionally contributing. |
| Direct call | Only the intended destination receives it; the incoming name and Reply behavior are understood. |
| Group call | Every member receives the call, including any hardware outputs. |
| Program | The correct source arrives at the required listeners, at a suitable balance. |
| IFB | Program is present normally; an interruption dims or cuts it as intended; release restores it. |
| Vox | Normal speech opens it, pauses close it after the intended hang time, and room noise does not keep it open. |
| Hardware channels | The selected physical connector matches the named port. Test each active input and output independently. |

In Manager → **Live**, resolve **Needs attention** items. An empty conference may be a harmless setup placeholder; a missing node or an offline station expected to work is not. Review the actual requirement rather than clearing warnings by changing unrelated configuration.

## Test failure and recovery before the show

Take a noncritical test device off WiFi, reconnect it and verify that keys remain released until pressed again. If locked-screen listening is required, test that device locked for a realistic period, then test its microphone after return. See [Background and reconnect](../use/background-and-reconnect.md).

Use a spare, isolated station for the [Latency test](latency.md). Record the device, location, headset and test condition with the result.

Agree on a fallback that does not depend on the same failed component: for example, the venue's existing radio system or a designated in-person message path. Tell the crew who calls the fallback and what to do if comms disappears. Do not introduce a new router, headset, browser update or routing scheme immediately before a critical cue without retesting it.
