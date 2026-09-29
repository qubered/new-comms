import { test } from "node:test";
import assert from "node:assert/strict";
import { Intercom } from "../src/intercom.ts";

// Exercise lifecycle without browser media. Actual WebRTC is covered in integration.
test("an unanswered microphone prompt cannot block the listen connection", async () => {
  const calls: string[] = [];
  const intercom = Object.assign(Object.create(Intercom.prototype), {
    stopped: false,
    ensureSilence() {
      calls.push("audio");
    },
    startTicker() {},
    enterAudioSession() {},
    applySpeaker() {},
    acquireMic() {
      calls.push("permission");
      return new Promise(() => {});
    },
    audio: { play: async () => {} },
    holdScreenAwake() {},
    publishMediaSession() {},
    connect() {
      calls.push("connect");
    },
  }) as Intercom;
  await intercom.start();
  assert.deepEqual(calls, ["audio", "permission", "connect"]);
});

test("capture resolving after stop is released without attaching a sender", async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  let resolve!: (stream: MediaStream) => void;
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      mediaDevices: {
        getUserMedia: () =>
          new Promise<MediaStream>((done) => {
            resolve = done;
          }),
      },
    },
  });
  try {
    let stoppedTracks = 0;
    const intercom = Object.assign(Object.create(Intercom.prototype), {
      stopped: false,
      micRequest: 0,
    }) as Intercom;
    const result = intercom.acquireMic();
    Object.assign(intercom, { stopped: true });
    resolve({
      getTracks: () => [
        {
          stop() {
            stoppedTracks++;
          },
        },
      ],
    } as unknown as MediaStream);
    assert.equal(await result, false);
    assert.equal(stoppedTracks, 1);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, "navigator", descriptor);
    else Reflect.deleteProperty(globalThis, "navigator");
  }
});
