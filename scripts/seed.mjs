// node scripts/seed.mjs [gateway-url]: create a small demo show if the gateway is empty.
const base = (process.argv[2] ?? "http://localhost:8080") + "/api/v1";
const call = async (method, path, body) => {
  const response = await fetch(base + path, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  if (!response.ok) throw new Error(`${method} ${path}: ${response.status} ${await response.text()}`);
  return response.status === 204 ? null : response.json();
};
const state = await call("GET", "/state");
if (state.packs.length || state.channels.length) {
  console.log("Gateway already has a show; not seeding.");
  process.exit(0);
}
const prod = await call("POST", "/channels", { name: "Production", subText: "SM, cams, LX, A2", type: "partyline" });
const cams = await call("POST", "/channels", { name: "Cameras", subText: "Cam 1, Cam 2, director", type: "partyline" });
const lx = await call("POST", "/channels", { name: "Lighting", subText: "Jo and SM", type: "partyline" });
const pgm = await call("POST", "/channels", { name: "Program", subText: "Show mix", type: "pgm" });
const key = (channel, mode = "ptt") => ({ channelId: channel.id, mode });
await call("POST", "/packs", { name: "Stage Manager", keys: [key(prod, "auto"), key(cams), key(lx, "latch"), key(pgm)] });
await call("POST", "/packs", { name: "Director", pin: "1234", keys: [key(prod, "auto"), key(cams, "auto"), key(pgm)] });
await call("POST", "/packs", { name: "Camera 1", keys: [key(cams), key(prod)] });
await call("POST", "/packs", { name: "Camera 2", keys: [key(cams), key(prod)] });
await call("POST", "/packs", { name: "Lighting", keys: [key(lx, "auto"), key(prod)] });
console.log("Seeded a demo show: 4 channels, 5 packs (Director has PIN 1234).");
