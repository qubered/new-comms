---
title: Use Manager
sidebar_position: 1
---

Manager is where the show owner creates stations, assigns keys, connects hardware channels, and checks the running show. Open the Manager address supplied when the show starts; see [Start a show](../setup/start-a-show.md). Use **Open Talk** in the sidebar to open the crew app.

[![Manager with the unsaved-changes banner and an IFB draft](/img/manager-draft.png)](/img/manager-draft.png)

<div className="caption">The banner keeps unfinished port and channel edits reachable while you navigate. Save changes applies this IFB draft.</div>

Saved routing changes apply to the running show. Plan significant changes with the crew, especially changes to Always routes or IFB interrupts.

## Find the right page

| Page | Use it to |
| --- | --- |
| Ports | Create ports; edit names, station keys, standing functions, and type-specific settings |
| Groups & conferences | See conference talkers/listeners, group members, and IFB feeds; add members |
| Matrix | Trace routes and open the exact function that owns one |
| I/O nodes | Enable hardware channels, name them, and set trims |
| Live | Check open keys, Vox, incoming callers, levels, and Needs attention |

The sidebar also shows **Gateway**, **Mixer**, and the count **Online**. A reachable Gateway does not guarantee the audio mixer is running. If Mixer shows **Down**, restore it before trying to diagnose keys or microphone settings.

## Create and edit a port

1. Open **Ports** and choose **New port**.
2. Set **Port type** to Station, Conference, Group, or IFB.
3. Enter **Port name** and a short **Label**.
4. Complete the type-specific settings. A group needs members; an IFB needs Program and Destination.
5. Choose **Create port**.
6. Select the saved port whenever you need to edit it. Choose **Save changes** to apply later edits.

Hardware inputs and outputs are created through **I/O nodes**, not the New port selector. Follow the [hardware channel guide](hardware-channels.md).

Use Search, All types, and All nodes to narrow a busy port list. Selecting another port does not save the current port automatically.

## Save and keep track of drafts

Editing a port or hardware node creates an in-memory draft. **Unsaved changes** appears both near the editor controls and in a banner above the page. The banner lists the objects with drafts.

1. Edit a port, then move to another port or Manager page if you need to check something.
2. Select the draft's name in the **Unsaved changes** banner to return to it.
3. Review the changes and choose **Save changes**, **Create port**, or **Save channels**, as appropriate.
4. To abandon the edit, choose **Discard changes** in the editor or **Discard** beside that draft in the banner.

Drafts survive internal navigation and incoming live updates in that Manager tab. They are not saved show configuration and are not a backup. They are not carried to another browser tab, restored after a reload, or stored across a browser restart. The browser warns before leaving or reloading while drafts exist; save before closing the page rather than depending on that warning.

While a save is pending, its controls remain locked even if you leave and reopen the editor. **Saving…** means wait for the result. If a save fails, the error appears and the draft stays available to correct and retry. A response from an older save does not discard a newer draft.

### If a port or node was deleted elsewhere

A saved object can disappear while you still have a draft, for example after another Manager changes the show. Open that draft from the banner. The editor explains that the port or node was deleted and keeps the draft visible for recovery.

Copy the names and settings you need before discarding it. You cannot save that draft back to the deleted object. Recreate the appropriate station or virtual port, or restore the hardware channel, and re-enter the settings. Check routes after recreating an object: a new object is not automatically the old route target.

### Some buttons act immediately

Draft protection does not turn every Manager action into a pending edit:

- **Add member** in Groups & conferences writes that membership immediately.
- **Remove PIN** removes a saved station PIN immediately.
- **Delete port** attempts to delete the port immediately.

Use the normal editor when you want to collect several configuration changes before saving. Coordinate edits with other show owners; a draft is not an exclusive lock on the show.

## Trace a route you did not create

1. Open the receiving port and look under **Incoming**.
2. Identify the source and trigger.
3. Choose **Open** beside the route to reach its owning function.
4. Make the change there and choose **Save changes**.

The incoming list is a view of configuration, not a second set of editable routes. [Matrix](matrix.md) provides the same ownership navigation across the whole show.

## Read errors before retrying

Manager checks that targets exist, groups have members, and routes are valid for their source and destination. A save or deletion can be refused if it would leave a broken reference. Correct the named function or dependent port and retry; dismissing the error does not apply the failed edit.

An empty conference is allowed so you can create it before adding people. It appears under **Needs attention** until it has a talker. Offline stations with keys and offline hardware also appear there. Use the [preflight guide](../operate/preflight.md) before the crew starts work.
