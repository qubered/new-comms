---
title: Route audio between ports
sidebar_position: 8
---

**Route audio** connects a selected source to a selected destination. Use it when the familiar Call to and Listen to functions do not express the job clearly, especially when one port's key must control audio between two other ports.

For an ordinary party line, prefer Call to conference. For a direct call with incoming-call and Reply behavior, prefer Call to port or Call to group. Route audio creates an audio path; it does not identify that path as a direct call for incoming-call or Reply behavior.

## Make a standing hardware route

For example, send `Truck input` to `Stage output`:

1. Enable and name both hardware channels in **I/O nodes**.
2. Open Truck input in **Ports**.
3. Under **Standing functions → Always**, choose **+ Add function**.
4. Select **Route audio**.
5. Set the target to **Stage output**.
6. In **Route source**, select **Truck input** explicitly.
7. Leave the function level at **0 dB** and choose **Save changes**.
8. Feed signal into Truck input and confirm it reaches Stage output.

Route source appears beneath the normal function controls. Check it even if the chosen owner seems obvious. It is independent of the target and can name another input or station.

## Use a station key to switch someone else's audio

Suppose Stage needs a key that sends Program to a backstage output only while held.

1. Create and save Stage, Program, and the backstage output before adding the route.
2. Open Stage in Ports and select an unused key.
3. Choose **+ Add function → Route audio**.
4. Set the target to the backstage output.
5. Set **Route source** to Program.
6. Choose **Hold** for Key mode and save.
7. Join Stage in Talk. Hold the key while Program is playing, then release it.

Program opens and closes at the output, even though Stage's own microphone is not its source. The function belongs to Stage, because Stage's key controls it. The key heading comes from its first function's target, which in this example is the backstage output.

If you instead choose Stage itself as Route source, the key carries Stage's microphone and is treated as a microphone key. **Mic off** prevents that microphone route. A key switching another source can remain useful while the operator's own microphone is off.

## Route into or out of a conference

A raw route can put a physical source into a conference or send a conference mix to a station/output. These are separate directions:

- Input → Show adds a contribution to Show.
- Show → output supplies a return from Show.

Unlike Call to conference on a station, one Route audio function does not automatically create the reverse listening direction. Add the required return deliberately, or use Call to conference if a normal party-line assignment is what you want.

Physical source ports must be connected for their routes to open. A virtual conference or IFB does not require its own device connection. Its route may be open while its mixed audio is silent.

## Stay within supported routes

Use a station, input, conference, or IFB as an audio source. Groups are destinations for Call to group, not sources you can listen to. Inputs and groups cannot receive a raw audio route.

Do not use Route audio to build arbitrary conference-to-conference or IFB-to-conference chains. Manager rejects unsupported bus chains. A conference can supply program to an IFB through the IFB's **Program** setting.

For an IFB interruption, use **Call to IFB** so the function's purpose is clear. Configure its program and destination in the IFB editor rather than attempting to recreate the whole IFB with raw routes.

## Find the owner later

In [Matrix](matrix.md), locate the source row and destination column. Select the route entry to open the owner and its specific function, even when the owner is a third station. The receiving port's Incoming list offers the same navigation.

An empty Matrix cell is not an add-route button. Create a function on the intended owner, then return to Matrix to check it.

Several open routes between the same source and destination carry that source once at the highest active gain. A quieter alternate function does not cancel a louder open one. If the output is unexpectedly loud or never closes, inspect every function in that Matrix cell.
