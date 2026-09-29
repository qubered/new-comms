---
title: Read and edit the Matrix
sidebar_position: 9
---

Matrix gives you the whole show's routes in one place. Use it to answer “why can this person hear that source?” or “which key controls this output?” It shows the result of the functions you configured; those functions remain the place where changes are saved.

[![Matrix of the example show with Always returns and numbered-key routes](/img/manager-matrix.png)](/img/manager-matrix.png)

<div className="caption">The example matrix shows permanent conference returns (A) and keyed contributions (K). Select a populated cell to find the owning function.</div>

## Read a cell

Sources run down the left. Destinations run across the top. Find the source row, then move across to the destination column.

| Mark | Meaning |
| --- | --- |
| A | Always route |
| K1–K6 | Route controlled by that numbered key on its owner |
| Vox | Route controlled by voice activation |
| On call | Route opened in response to a direct or group call |
| P | IFB program path |
| I | IFB interrupt path |
| · | No configured route in that cell |

A cell can contain several entries because more than one function provides that source-to-destination path. Hover over an entry to see its trigger, level in dB, and owner.

A group's calls appear as routes to its individual members. There is no mixed source row coming out of the group.

Reply is resolved from the station's last caller during operation, so it has no fixed configured crosspoint in Matrix. Check the station's Reply label in Talk and the caller information in Live when diagnosing a return call.

## Open the function behind a route

1. Open **Matrix**.
2. Find the source row and destination column.
3. Select the relevant route entry in that cell.
4. Manager opens **Ports** at the owning port. For a function route, it selects the relevant key where necessary and focuses the specific function.
5. Change the function, target or level as needed. To move it to another trigger, add the equivalent function on the new trigger and remove the old one in the same draft; there is no trigger-move dropdown.
6. Choose **Save changes** and return to Matrix to verify the result.

Program and automatic destination routes belonging to an IFB lead to the IFB's port editor, where you edit Program, Destination, and Program dim. They are not independent numbered-key functions.

The owner can be different from both the source and destination. A Stage key may control Program → Backstage output through Route audio; selecting that entry opens Stage's function.

An empty cell cannot be toggled on directly. Create the function on the port that should own it, following [Route audio](route-audio.md) or the appropriate Call to/Listen to guide.

## Distinguish configured from open

Entries remain in Matrix while their keys are released. Highlighting shows which configured function routes are currently open.

- A physical microphone/input must be connected and not killed for its source routes to open.
- A key, Vox, or On call trigger must also be active where required.
- A connected silent Always source remains open.
- Conference and IFB sources are virtual mixes and do not need a device to join them.

Highlighting is not an audio meter. An open conference return can be silent because nobody is contributing. Check **Live** and the actual listener when validating sound.

On call highlighting follows a single response step. A route opened by On call cannot cascade through another On call trigger. See [Triggers and functions](../concepts/triggers-and-functions.md).

## Understand duplicate entries

If several functions open the same source-to-destination connection, all of their ownership entries may highlight. The source still contributes once at the highest active gain, after any IFB program dim.

For example, an Always route at −12 dB and a Key 2 route at 0 dB can both be open. The effective connection is 0 dB while Key 2 is held. Closing Key 2 leaves the −12 dB route; it does not make the connection silent.

Do not delete an entry solely because another entry shares the cell. One might be an intentional alternate gate or level. Open each owner and check its purpose.

## Trace an unexpected sound

1. Identify the receiving station or output column.
2. Look down that column for routes from the unexpected source or from a conference/IFB carrying it.
3. If a bus is involved, inspect that bus's incoming source rows too.
4. Open each relevant function and identify its trigger.
5. Check for an Always function, a latched key, Vox still in Hang, or another open IFB interrupt.
6. Correct the owner, save, and verify with the listener.

The port editor's **Incoming** list is a compact alternative when you already know the recipient. **Live → Needs attention** helps identify offline devices and unfinished configuration, but a clean list is not a substitute for a listening test.
