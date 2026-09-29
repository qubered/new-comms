---
title: Upgrade and migrate
---

Upgrade outside a live show and retain a path back to the known working installation. A new application version can change the saved show format and device behaviour.

## Routine upgrade

1. Finish and save Manager edits.
2. Stop the host and hardware-node processes.
3. [Back up](backup-and-restore.md) the show, certificates and launch settings; record the current software revision.
4. Obtain the intended new release or branch from the project owner. Keep local changes safe; do not force-reset a checkout with work you need.
5. In the project folder, run `npm ci`, then `cargo build --release -p mix-router` and `npm run build`.
6. Start the host with the same state path. Read startup errors before proceeding.
7. Restart hardware nodes from the compatible checkout, using their recorded IDs and devices.
8. Reload Talk and Manager so their interfaces match the host, then complete [preflight](../operate/preflight.md).

If you use a clean checkout tracking `main`, updating normally means `git pull --ff-only origin main`. Use the release/branch supplied for your installation; do not assume a development branch has already been merged into main.

## Moving from the old channel model

The current application uses **ports, triggers and functions**. On loading a supported v1 show, the gateway migrates it and preserves the original as `<state-path>.v1.json` (normally `data/state.json.v1.json`). An existing migration backup is not overwritten. Make your own fresh backup first regardless.

Hardware selections keep their physical channel numbers and disabled directions. If the old configuration is ambiguous, migration stops with an error instead of guessing a physical channel. Keep the original file and seek a correction with the project maintainer; do not delete fields at random to make it load.

After migration:

- Check each station’s keys, standing functions and volume settings.
- Inspect every conference/group and its derived membership.
- Verify program, IFB and incoming-call behaviour with actual listeners.
- Match each hardware node to the **migrated node ID**, which is its old hardware pack ID.
- Confirm every physical input/output and trim, including disabled channels.

For an old hardware pack with ID `stage-rack-old`, launch its node with `--node-id stage-rack-old`. The new automatic hostname/device-derived identity cannot infer an old pack ID. Use your actual migrated ID from the saved configuration; it is not necessarily the display name. If you cannot identify it, ask the person maintaining the show file before bringing another node online.

## Roll back

Stop the new software. Preserve its state separately, return to the known working software version, and restore the matching pre-upgrade state backup. Do not feed a v2 state file to the old v1 application and expect it to reverse the migration.

A rollback still needs channel, routing, HTTPS and operator checks. Reverting software does not restore a changed network or physical wiring.
