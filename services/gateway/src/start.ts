import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Gateway } from "./gateway.ts";
import { MixRouter } from "./router.ts";
import { buildServer } from "./server.ts";
import { Store } from "./store.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const port = Number(process.env.PORT ?? 8080);
const dataFile = process.env.COMMS_DATA ?? resolve(root, "data/state.json");
const binary =
  process.env.MIX_ROUTER_BIN ??
  ["target/release/mix-router", "target/debug/mix-router"].map((p) => resolve(root, p)).find(existsSync) ??
  resolve(root, "target/release/mix-router");

const router = new MixRouter(binary);
const gateway = new Gateway(new Store(dataFile), router);
const app = buildServer(gateway, { mediaIp: process.env.COMMS_MEDIA_IP, logger: { level: "warn" } });

router.start();
await app.listen({ port, host: "0.0.0.0" });

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    gateway.store.flush();
    router.stop();
    process.exit(0);
  });
}
