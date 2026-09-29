import { EventEmitter } from "node:events";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { applyEvent, type ServerEvent, type Snapshot } from "@comms/protocol";
import { Gateway } from "./gateway.ts";
import type { MixRouter } from "./router.ts";
import { buildServer, describeClient } from "./server.ts";
import { Store } from "./store.ts";
import { validate } from "./validate.ts";

class FakeRouter extends EventEmitter {
  ready = true;
  configured = 0;
  opened: string[] = [];
  configure() {
    this.configured += 1;
  }
  async open(sessionId: string, packId: string) {
    this.opened.push(`${sessionId}:${packId}`);
    return "v=0 answer";
  }
  close() {}
}

function setup() {
  const router = new FakeRouter();
  const store = new Store(join(mkdtempSync(join(tmpdir(), "comms-")), "state.json"));
  const gateway = new Gateway(store, router as unknown as MixRouter, "Test");
  return { gateway, router };
}

describe("channels and pack keys stay in step", () => {
  it("derives channel members from pack keys", () => {
    const { gateway } = setup();
    const channel = gateway.createChannel({ name: "Production" });
    const pack = gateway.createPack({ name: "SM", keys: [{ channelId: channel.id }] });
    expect(channel.members).toEqual([pack.id]);
  });

  it("adds and removes keys when 'who's on it' is edited", () => {
    const { gateway } = setup();
    const channel = gateway.createChannel({ name: "Production" });
    const a = gateway.createPack({ name: "A" });
    const b = gateway.createPack({ name: "B" });
    gateway.updateChannel(channel.id, { members: [a.id, b.id] });
    expect(a.keys.map((k) => k.channelId)).toEqual([channel.id]);
    expect(b.keys).toHaveLength(1);
    gateway.updateChannel(channel.id, { members: [b.id] });
    expect(a.keys).toHaveLength(0);
    expect(channel.members).toEqual([b.id]);
  });

  it("removes a deleted channel from every pack and keeps key order", () => {
    const { gateway } = setup();
    const one = gateway.createChannel({ name: "One" });
    const two = gateway.createChannel({ name: "Two" });
    const pack = gateway.createPack({ name: "A", keys: [{ channelId: one.id }, { channelId: two.id }] });
    gateway.updatePack(pack.id, { keys: [{ channelId: two.id }, { channelId: one.id }] });
    expect(pack.keys.map((k) => k.channelId)).toEqual([two.id, one.id]);
    gateway.deleteChannel(one.id);
    expect(pack.keys.map((k) => k.channelId)).toEqual([two.id]);
  });

  it("pushes every change to the mixer", () => {
    const { gateway, router } = setup();
    const before = router.configured;
    gateway.createChannel({ name: "X" });
    expect(router.configured).toBe(before + 1);
  });
});

describe("button limits", () => {
  const many = (gateway: Gateway, count: number, type: "partyline" | "pgm" = "partyline") =>
    Array.from({ length: count }, (_, i) => gateway.createChannel({ name: `${type} ${i}`, type }));

  it("gives a person six buttons, and PGM mappings do not count", () => {
    const { gateway } = setup();
    const lines = many(gateway, 7);
    const feeds = many(gateway, 20, "pgm");
    expect(() => gateway.createPack({ name: "A", keys: lines.map((c) => ({ channelId: c.id })) })).toThrow(/at most 6 buttons/);
    const pack = gateway.createPack({ name: "A", keys: lines.slice(0, 6).map((c) => ({ channelId: c.id })) });
    // twenty PGM mappings still fit
    gateway.updatePack(pack.id, { keys: [...lines.slice(0, 6), ...feeds].map((c) => ({ channelId: c.id })) });
    expect(pack.keys).toHaveLength(26);
    // a seventh button does not, whichever way it is added, and nothing is half-applied
    expect(() => gateway.updateChannel(lines[6]!.id, { members: [pack.id] })).toThrow(/at most 6 buttons/);
    expect(pack.keys.some((k) => k.channelId === lines[6]!.id)).toBe(false);
    expect(lines[6]!.members).toEqual([]);
  });

  it("refuses to turn a PGM into a partyline if that would give someone a seventh button", () => {
    const { gateway } = setup();
    const lines = many(gateway, 6);
    const [feed] = many(gateway, 1, "pgm");
    const pack = gateway.createPack({ name: "A", keys: [...lines, feed!].map((c) => ({ channelId: c.id })) });
    expect(() => gateway.updateChannel(feed!.id, { type: "partyline" })).toThrow(/at most 6 buttons/);
    expect(feed!.type).toBe("pgm");
    gateway.updatePack(pack.id, { keys: lines.slice(0, 5).concat(feed!).map((c) => ({ channelId: c.id })) });
    expect(() => gateway.updateChannel(feed!.id, { type: "partyline" })).not.toThrow();
  });

  it("leaves hardware nodes unlimited", () => {
    const { gateway } = setup();
    const lines = many(gateway, 12);
    const node = gateway.createPack({ name: "Rack", type: "hardware", keys: lines.map((c) => ({ channelId: c.id })) });
    expect(node.keys).toHaveLength(12);
  });
});

describe("hardware packs", () => {
  it("can be made ahead of time and are claimed by a node of the same name, keeping every channel", () => {
    const { gateway } = setup();
    const a = gateway.createChannel({ name: "A" });
    const b = gateway.createChannel({ name: "B" });
    const rack = gateway.createPack({ name: "Stage rack", type: "hardware", keys: [{ channelId: a.id }, { channelId: b.id }] });
    const claimed = gateway.registerNode({ deviceName: "stage RACK", availableInputs: ["In 1"], availableOutputs: ["Out 1"], address: "10.0.0.5" });
    expect(claimed.id).toBe(rack.id);
    expect(claimed.keys).toHaveLength(2);
    expect(() => gateway.updatePack(rack.id, { type: "human" })).toThrow(/registered node/);
  });

  it("stores input and output trim within plus or minus 24 dB", () => {
    const { gateway } = setup();
    const node = gateway.registerNode({ deviceName: "Rack", availableInputs: ["In 1"], availableOutputs: ["Out 1"], address: "10.0.0.5" });
    gateway.updatePack(node.id, { device: { inputTrim: 6.5, outputTrim: -24 } });
    expect(node.device).toMatchObject({ inputTrim: 6.5, outputTrim: -24 });
    expect(() => gateway.updatePack(node.id, { device: { inputTrim: 24.5 } })).toThrow(/inputTrim/);
    expect(() => gateway.updatePack(node.id, { device: { outputTrim: -25 } })).toThrow(/outputTrim/);
    expect(node.device).toMatchObject({ inputTrim: 6.5, outputTrim: -24 });
  });

  it("lets a person become hardware before a node exists, dropping the PIN", () => {
    const { gateway } = setup();
    const a = gateway.createChannel({ name: "A" });
    const b = gateway.createChannel({ name: "B" });
    const pack = gateway.createPack({ name: "X", pin: "1234", keys: [{ channelId: a.id }, { channelId: b.id }] });
    gateway.updatePack(pack.id, { type: "hardware" });
    expect(pack.type).toBe("hardware");
    expect(pack.keys).toHaveLength(2);
    expect(pack.pin).toBeUndefined();
  });
});

describe("PINs", () => {
  it("never appear in public state, must be four digits, and gate sessions", async () => {
    const { gateway } = setup();
    expect(() => gateway.createPack({ name: "Bad", pin: "12" })).toThrow(/pin must match/);
    const pack = gateway.createPack({ name: "Director", pin: "1234" });
    const snapshot = JSON.stringify(gateway.snapshot());
    expect(snapshot).not.toContain("1234");
    expect(gateway.snapshot().packs[0]!.hasPin).toBe(true);
    await expect(gateway.openSession(pack.id, "offer", "0000", "10.0.0.1", "x")).rejects.toThrow(/wrong PIN/);
    await expect(gateway.openSession(pack.id, "offer", "1234", "10.0.0.1", "x")).resolves.toMatchObject({ answer: "v=0 answer" });
    gateway.updatePack(pack.id, { pin: "" });
    expect(gateway.snapshot().packs[0]!.hasPin).toBe(false);
  });
});

describe("live state from the mixer", () => {
  it("persists volumes, broadcasts deltas and clears keys when a pack disconnects", () => {
    const { gateway, router } = setup();
    const channel = gateway.createChannel({ name: "Production" });
    const pack = gateway.createPack({ name: "SM", keys: [{ channelId: channel.id }] });
    const events: ServerEvent[] = [];
    gateway.on("event", (event: ServerEvent) => events.push(event));

    router.emit("event", { event: "connected", sessionId: "s1", packId: pack.id });
    gateway.sessions.set("s1", pack.id);
    router.emit("event", {
      event: "packState",
      packId: pack.id,
      keyed: { [channel.id]: true },
      micOff: false,
      volumes: { [channel.id]: 55 },
      masterVolume: 40,
    });
    expect(gateway.live.get(pack.id)?.keyed[channel.id]).toBe(true);
    expect(pack.masterVolume).toBe(40);
    expect(pack.keys[0]!.volume).toBe(55);

    router.emit("event", { event: "closed", sessionId: "s1", packId: pack.id, reason: "disconnected" });
    expect(gateway.live.get(pack.id)).toMatchObject({ connected: false, keyed: {} });

    const revs = events.filter((e) => "rev" in e).map((e) => (e as { rev: number }).rev);
    expect(revs).toEqual([...revs].sort((a, b) => a - b));
    expect(new Set(revs).size).toBe(revs.length);
  });
});

describe("snapshot + delta protocol", () => {
  it("applies in-order deltas and asks for a resync on a gap", () => {
    const { gateway } = setup();
    const channel = gateway.createChannel({ name: "P" });
    const pack = gateway.createPack({ name: "SM", keys: [{ channelId: channel.id }] });
    let state: Snapshot | null | "resync" = applyEvent(null, { type: "snapshot", ...gateway.snapshot() });
    const rev = (state as Snapshot).rev;
    const live = { ...gateway.snapshot().live[pack.id]!, connected: true };
    state = applyEvent(state as Snapshot, { type: "live", rev: rev + 1, packId: pack.id, live });
    expect((state as Snapshot).live[pack.id]!.connected).toBe(true);
    expect(applyEvent(state as Snapshot, { type: "live", rev: rev + 5, packId: pack.id, live })).toBe("resync");
    expect(applyEvent(null, { type: "live", rev: 1, packId: pack.id, live })).toBe("resync");
  });
});

describe("schema validation", () => {
  it("rejects unknown fields, bad enums and out-of-range volumes with a message naming the field", () => {
    const { gateway } = setup();
    expect(() => gateway.createPack({ name: "A", colour: "red" })).toThrow(/additional properties/);
    expect(() => gateway.createChannel({ name: "A", type: "conference" })).toThrow(/type must be equal to one of/);
    const channel = gateway.createChannel({ name: "P" });
    expect(() => gateway.createPack({ name: "A", keys: [{ channelId: channel.id, volume: 400 }] })).toThrow(/keys\.0\.volume/);
    expect(() => gateway.registerNode({ deviceName: "" })).toThrow(/availableInputs|deviceName/);
  });
});

describe("contracts", () => {
  it("the gateway's own snapshot and SSE events conform to the schema", () => {
    const { gateway } = setup();
    const channel = gateway.createChannel({ name: "Production", subText: "SM" });
    gateway.createPack({ name: "SM", pin: "1234", keys: [{ channelId: channel.id, mode: "auto" }] });
    const events: unknown[] = [];
    gateway.on("event", (event) => events.push(event));
    gateway.createChannel({ name: "Other" });
    expect(() => validate("Snapshot", gateway.snapshot())).not.toThrow();
    expect(() => validate("SnapshotEvent", { type: "snapshot", ...gateway.snapshot() })).not.toThrow();
    for (const event of events) expect(() => validate("ServerEvent", event)).not.toThrow();
  });
});

describe("mixer reconnect", () => {
  it("rebuilds who is connected from the router's sync after the gateway restarts", () => {
    const { gateway, router } = setup();
    const pack = gateway.createPack({ name: "SM" });
    router.emit("event", { event: "sync", sessions: [{ sessionId: "s9", packId: pack.id }] });
    expect(gateway.live.get(pack.id)?.connected).toBe(true);
    expect(gateway.sessions.get("s9")).toBe(pack.id);
  });
});

describe("HTTP", () => {
  it("serves state and health, rejects bad input with JSON errors", async () => {
    const { gateway } = setup();
    const app = buildServer(gateway);
    const health = await app.inject({ method: "GET", url: "/api/v1/health" });
    expect(health.json()).toMatchObject({ ok: true, mixer: true });
    const created = await app.inject({ method: "POST", url: "/api/v1/channels", payload: { name: "Production", type: "partyline" } });
    expect(created.statusCode).toBe(201);
    const bad = await app.inject({ method: "POST", url: "/api/v1/packs", payload: { name: "  " } });
    expect(bad.statusCode).toBe(400);
    expect(bad.json()).toEqual({ error: "name is required" });
    const missing = await app.inject({ method: "PATCH", url: "/api/v1/packs/nope", payload: {} });
    expect(missing.statusCode).toBe(404);
    const state = await app.inject({ method: "GET", url: "/api/v1/state" });
    expect(state.json().channels).toHaveLength(1);
  });

  it("names clients from the user agent", () => {
    expect(describeClient("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) AppleWebKit Version/17 Safari/605.1")).toBe("iPhone, Safari");
    expect(describeClient("Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/126 Mobile Safari/537.36")).toBe("Android, Chrome");
  });
});
