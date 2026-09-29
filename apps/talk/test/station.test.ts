import { test } from "node:test";
import assert from "node:assert/strict";
import type { Port, Crosspoint, PortLiveState } from "@comms/protocol";
import {
  alwaysListens,
  conferenceTalkers,
  keyOpensMic,
  heardSources,
  keyTarget,
  stationKeys,
} from "../src/stationView.ts";
import { continuousOpus } from "../src/opus.ts";

const port = (id: string, type: Port["type"] = "station"): Port => ({
  id,
  name: id,
  label: id.toUpperCase(),
  type,
  triggers: [],
});
test("keys use their number and first target; Always listens have no key", () => {
  const station = port("phone");
  station.triggers = [
    { kind: "key", key: 6, functions: [{ fn: "callToPort", to: "person" }] },
    { kind: "always", functions: [{ fn: "listenToPort", from: "program" }] },
    {
      kind: "key",
      key: 2,
      functions: [
        { fn: "listenToPort", from: "show" },
        { fn: "callToPort", to: "person" },
      ],
    },
  ];
  const ports = [
    station,
    port("person"),
    port("show", "conference"),
    port("program", "input"),
  ];
  assert.deepEqual(
    stationKeys(station).map((key) => key.key),
    [2, 6],
  );
  assert.equal(keyTarget(station, 2, ports)?.id, "show");
  assert.deepEqual(
    alwaysListens(station, ports).map((source) => source.id),
    ["program"],
  );
});
test("Levels deduplicates key returns, Always feeds and incoming calls", () => {
  const station = port("phone");
  const ports = [
    station,
    port("show", "conference"),
    port("program", "input"),
    port("caller"),
  ];
  const crosspoints: Crosspoint[] = ["show", "show", "program"].map(
    (source) => ({
      source,
      destination: station.id,
      owner: station.id,
      role: "audio",
      gate: "always",
      level: 0,
    }),
  );
  assert.deepEqual(
    heardSources(station, ports, crosspoints, ["caller"]).map(
      (source) => source.id,
    ),
    ["show", "program", "caller"],
  );
});
test("Opus offer always disables DTX and requests 10 ms on audio only", () => {
  const sdp =
    "v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\na=rtpmap:111 opus/48000/2\r\na=fmtp:111 minptime=3;useinbandfec=1;usedtx=1\r\na=ptime:20\r\nm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\n";
  const actual = continuousOpus(sdp);
  assert.match(actual, /a=fmtp:111 useinbandfec=1;usedtx=0;minptime=10/);
  assert.equal((actual.match(/a=ptime:10/g) ?? []).length, 1);
  assert.doesNotMatch(actual, /usedtx=1|ptime:20/);
  assert.equal(continuousOpus(actual), actual);
  assert.match(
    continuousOpus("m=audio 9 RTP/AVP 109\r\na=rtpmap:109 opus/48000/2\r\n"),
    /a=fmtp:109 usedtx=0;minptime=10/,
  );
});

test("raw routes from the station microphone are talk keys; remote routes are not", () => {
  const station = port("phone");
  assert.equal(keyOpensMic(station, { kind: "key", key: 1, functions: [{ fn: "routeAudio", from: "phone", to: "show" }] }), true);
  assert.equal(keyOpensMic(station, { kind: "key", key: 1, functions: [{ fn: "routeAudio", from: "program", to: "output" }] }), false);
  assert.equal(keyOpensMic(station, { kind: "key", key: 1, functions: [{ fn: "listenToPort", from: "show" }, { fn: "callToPort", to: "other" }] }), true);
});

test("conference activity identifies keyed and Vox contributors with physical levels", () => {
  const station = port("phone"), conference = port("show", "conference");
  const ports = [station, conference, port("caller"), port("mic", "input"), port("program", "input")];
  const state = (id: string): PortLiveState => ({ portId: id, connected: true, micOff: false, keys: {}, voxOpen: false, incoming: [], audible: [], volumes: {}, masterVolume: 100 });
  const live = Object.fromEntries(ports.map((p) => [p.id, state(p.id)]));
  const crosspoints: Crosspoint[] = [
    { source: "show", destination: "phone", owner: "phone", role: "audio", gate: "always", level: 0 },
    ...["phone", "caller"].map((source): Crosspoint => ({ source, destination: "show", owner: source, role: "audio", gate: { port: source, trigger: { kind: "key", key: 1 } }, level: 0 })),
    { source: "mic", destination: "show", owner: "mic", role: "audio", gate: { port: "mic", trigger: { kind: "vox" } }, level: 0 },
    { source: "program", destination: "show", owner: "program", role: "audio", gate: "always", level: 0 },
  ];
  const levels = { caller: 0.4, mic: 0.7, program: 0 };
  const talkers = () => conferenceTalkers(station, conference, ports, crosspoints, live, levels);
  assert.deepEqual(talkers(), [], "passive return alone is not an active talker");
  live.phone.keys[1] = true;
  live.caller.keys[1] = true;
  live.mic.voxOpen = true;
  assert.deepEqual(talkers(), [{ name: "CALLER", level: 0.4 }, { name: "MIC", level: 0.7 }], "N-1 excludes the listener's own microphone");
  live.caller.micOff = true;
  live.mic.connected = false;
  levels.program = 0.2;
  assert.deepEqual(talkers(), [{ name: "PROGRAM", level: 0.2 }]);
});
