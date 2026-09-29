---
title: Triggers and functions
sidebar_position: 3
---

A trigger answers **when**. A function answers **what audio should move**. For example, “when the stage manager holds Key 1, call the Show conference” is a key trigger with a Call to conference function.

![The director holds Key 1 to talk into Show, with a permanent listening return. Show feeds the other members and removes each listener’s own microphone from their return.](/img/trigger-route.svg)

*For a conference call, the key gates talking. Listening remains available when the key is released.*

## The five triggers

| Trigger | What opens it | Where it is available |
| --- | --- | --- |
| Key 1–6 | An operator presses or latches the key in Talk | Stations |
| Reply | An operator uses the Reply key to answer the last eligible caller | Stations |
| Always | The function is permanently selected | Stations, inputs, outputs |
| Vox | The source's own audio crosses its configured threshold | Stations and inputs |
| On call | Another open direct or group call reaches this port | Stations and outputs that can receive a call |

Always, Vox, and On call appear under **Standing functions** in the port editor. They do not use a numbered key. Conferences, groups, and IFBs do not have their own triggers; other ports send to them or listen to them.

**Always still needs a connected physical source.** An offline microphone does not keep a direct call or IFB interrupt open. A connected microphone that sends silence does keep an Always function active. If silence should close the route, choose Vox instead.

## Key modes

The **Key mode** selector uses these labels:

| Mode | Operator action | Suitable use |
| --- | --- | --- |
| Hold | Hold the key to open it; release to close it | Cues and short calls |
| Tap | Tap once to open it; tap again to close it | A feed or conversation that needs to stay open |
| Tap/hold | A short tap latches; a longer hold behaves like push to talk | Operators who want both actions on one key |

For Tap/hold, a tap shorter than about 350 ms latches the key. Set **Reply mode** separately from numbered keys. Start with Hold for a new crew: it makes accidental open microphones easier to avoid.

## Available functions

| Function in Manager | What it does |
| --- | --- |
| Call to port | Sends this port's microphone/input to one station or output |
| Call to conference | Sends into a conference when triggered, and supplies a permanent return where this port can listen |
| Call to group | Sends this port's microphone/input to every group member |
| Call to IFB | Sends this port's microphone/input as an interrupt to an IFB |
| Listen to | Brings the selected source into this port's ear/output while triggered |
| Route audio | Routes a separately chosen source to a target; the owner controls when it opens |
| Reply | Sends this station's microphone to its last eligible caller |

The editor only offers functions appropriate to the port. Reply is supplied as the separate station Reply key, rather than added through **+ Add function**.

### The conference exception that matters

Call to conference has a keyed **talk** side and a permanent **listen** side. Releasing the conference key closes the microphone, not the return audio. On a hardware output, Call to conference supplies only that permanent listen side.

If you want listening itself to open and close, use **Listen to** instead. Changing a conference call's trigger to Vox or On call does not turn its return into a gated listen.

## Add a function to a trigger

1. Open **Ports** and select the port that should control the action.
2. Select a numbered key, or find the appropriate row under **Standing functions**.
3. Choose **+ Add function**.
4. Select the function and its target. Check both explicitly; the editor initially chooses a default.
5. Leave the function level at **0 dB** unless you need a deliberate route adjustment.
6. For a numbered key, choose **Key mode**.
7. Choose **Save changes**, then test in Talk or **Live**.

A trigger can have several functions. They open together; this does not add more keys. Talk uses the first function's target for the key heading, so make that first target meaningful to the operator.

Use the **×** beside a function to remove just that action. **Clear** removes the whole trigger, including all its functions. Clear an unused numbered key to make that key available for another assignment.

## Move a function to another trigger

There is no trigger-type dropdown on an existing function. To change, for example, an Always microphone contribution to Vox:

1. In the same port editor, add the same function and target to the **Vox** row.
2. Copy its intended function level.
3. Remove the old function from **Always** with its **×** button. Use **Clear** only if every function on that old trigger should be removed.
4. Review both rows, then choose **Save changes** once.

Making both edits in one draft avoids saving a temporary second route that keeps the microphone open while you test Vox. The same method moves an action between numbered keys or from a key to a standing trigger.

## Who owns the route?

A normal call lives on the caller, not the recipient. To make a hardware microphone call Stage, edit the microphone's functions. Stage's **Incoming** list shows the route and offers **Open** to take you to its owner.

Route audio is the deliberate exception to “the owner is the source”: the owner can control audio between two other ports. The route still belongs to that owner for editing. Matrix opens the owning function for you.

## Use On call for a response to a call

For example, an output can listen to Show only while a director calls it:

1. Give the director a **Call to port** key targeting that output.
2. On the output, add **On call → Listen to → Show**.
3. Save both ports and press the director's key.

The output receives the director's direct call and, while that call is open, the Show listen route. Releasing the director's key closes the conditional listen.

The input-port editor also displays an On call row, but inputs cannot be direct-call targets or group members in the current show model. Use Always or Vox for input-owned behavior rather than expecting an input to receive a call.

On call is a single-step response. A call opened by On call does not trigger another On call route further along. Do not build a chain of On call functions expecting it to propagate through several ports.
