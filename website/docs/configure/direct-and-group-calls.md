---
title: Set up direct and group calls
sidebar_position: 4
---

Use a direct call for one recipient and a group call for several recipients. Both send the caller's audio to the destination while the trigger is open. Neither automatically makes a two-way party line.

## Give Stage a direct key to Lighting

1. Make sure Stage and Lighting already exist as [stations](stations.md).
2. In **Ports**, select **Stage**.
3. Select an unused numbered key and choose **+ Add function**.
4. Choose **Call to port** and select **Lighting** as the target.
5. Choose **Hold** for Key mode and keep the function level at 0 dB initially.
6. Choose **Save changes**.
7. Join both stations in Talk. Hold Lighting on Stage and speak.

Lighting hears Stage and sees the incoming caller in the top bar. Lighting's own key assignments have not changed.

**Call to port** targets a station or a hardware output. To call a conference, group, or IFB, choose the matching Call to function instead.

## Give the recipient a way to answer

A direct call is one way. Lighting can answer with **Reply** while Stage is its last eligible caller. The Reply key uses Lighting's **Reply mode**, set in its station editor.

For a predictable permanent return key:

1. Open Lighting in Ports.
2. Add **Call to port → Stage** to an unused key.
3. Choose the appropriate Key mode and save.
4. Test a call in each direction.

Now each operator has an explicit key to the other. Use a conference instead when several people need to hear both sides of the exchange continuously.

### Reply follows the caller

Reply is not a dedicated return to the last key you pressed. Incoming direct and group calls establish the caller to which Reply can return. A newer caller can change that destination, so the operator should read the Reply label before using it.

A hardware input can call a station, including through Vox, but it has no ear/output to receive a reply. The station shows that input as an incoming caller without offering a reply destination for it. Do not rely on Reply to talk back down a one-way microphone input.

There is no call-accept dialog or ringing workflow. An open call carries audio directly into the recipient's mix. Several open callers can be heard together; this is not a private telephone system.

## Create a group

A group can contain stations and hardware outputs. For example, `Floor team` might contain Stage, Camera 1, Camera 2, and a floor speaker output.

1. Open **Ports → New port**.
2. Choose **Group** as Port type.
3. Enter the Port name and Label.
4. Under **Members**, tick at least one station or output.
5. Choose **Create port**.

A group must have members to save. It cannot contain conferences, inputs, IFBs, or nested groups.

To add another member later, either edit the group's Members checkboxes and **Save changes**, or select it in **Groups & conferences**, choose a port, and click **Add member**. The latter action saves immediately. To remove a member, use the group editor's checkboxes and save.

## Give an operator a group-call key

1. Open the caller's station in Ports.
2. Select a key and choose **+ Add function → Call to group**.
3. Select **Floor team**.
4. Choose Key mode and **Save changes**.
5. Press the group key and confirm every intended member hears it.

The caller's one key fans out to each member. Matrix shows the resulting routes to individual members, not a mixed audio source coming out of the group.

Members do not hear one another just because they share a group. Each eligible station can Reply to the caller, but that reply does not become a conversation with all group members. Use a [conference](conferences.md) for that.

## Keep ownership clear

To change when the group or direct call opens, edit the caller's function. To change which people receive a group call, edit the group membership. The recipient's **Incoming** section lets you trace either route back to its owner.

Removing a group member affects every function that calls that group. Review this before removing a person during the show.
