import { test } from "node:test";
import assert from "node:assert/strict";
import type { Port, Crosspoint } from "@comms/protocol";
import {
  alwaysListens,
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
