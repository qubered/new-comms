---
title: Back up and restore a show
---

The show is saved on the host, normally at `data/state.json`. It includes ports, routing, node channel selections and saved operator volumes. Station PINs are stored in this file in plain text. Store backups where only the people responsible for the show can read them.

## What to preserve

| Item | Why |
| --- | --- |
| State file (`data/state.json`, or your `COMMS_DATA` file) | Show configuration |
| Exact software version/commit | Reproduce the version that worked with the show |
| Host launch settings | Name, custom state path, network and port overrides |
| Each node’s command line and identity | Reconnect the same physical channels to the saved configuration |
| `data/tls` securely, if retaining certificate identity | HTTPS private key and certificate |
| Device/network notes | IP reservation, interface names, physical wiring, device permissions |

Browser-local audio-device preferences and operating-system permissions are not a substitute for those notes. Unsaved Manager drafts are in memory; they are not saved in the state file.

## Make a consistent backup

1. Arrange a break in operation. Stopping the full launcher stops show audio.
2. Save wanted edits in Manager and wait for those saves to finish. Resolve or deliberately discard other drafts. After changing operator levels, allow at least a second for the host’s short save delay before stopping.
3. Stop the launcher with Ctrl-C and let it finish shutdown.
4. Copy the state file to a dated backup outside the active state location. Copy certificate files only into a suitably protected backup.
5. Record the software version and launch/node settings beside it.
6. Restart and verify the show when appropriate.

Example, from the project folder after stopping:

```bash
mkdir -p backups
cp data/state.json backups/rehearsal-2026-09-29.json
```

Use your real date and a new filename. If you launched with `COMMS_DATA`, copy that file instead. Keep a second backup outside the host before a major upgrade or travelling to a venue.

## Restore

1. Stop the gateway/launcher. Never edit or replace its active state file while it is running.
2. Preserve the current file as a separate backup so you can undo the restore.
3. Copy the chosen backup to the state path you will launch with.
4. Use a compatible software version and the recorded node IDs.
5. Start the host, inspect Manager and reconnect nodes and operators.
6. Test every critical call, program path and IFB before returning to operation.

Do not assume a file copy brings back microphone permissions, WiFi settings or an interface driver. A restore on a different computer needs network and HTTPS checks as well.

## Use a separate rehearsal show

A different `COMMS_DATA` path lets you keep rehearsal configuration apart from the live show. It does not create a second independent audio system on the same occupied ports. Stop one launcher before starting the other, and label your terminals/files clearly. See [Start a show](start-a-show.md).

There is currently no Manager export/import wizard, automatic backup schedule or one-click undo history. Make backups explicitly before bulk routing changes.
