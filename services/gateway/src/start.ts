import fastifyStatic from "@fastify/static";
import Fastify, { type FastifyInstance } from "fastify";
import { existsSync, readFileSync } from "node:fs";
import { networkInterfaces } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Gateway } from "./gateway.ts";
import { MixRouter } from "./router.ts";
import { buildServer } from "./server.ts";
import { Store } from "./store.ts";
import { loadOrCreateCertificate } from "./tls.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const httpPort = Number(process.env.PORT ?? 8080);
const httpsPort = Number(process.env.HTTPS_PORT ?? 8443);
const dataFile = process.env.COMMS_DATA ?? resolve(root, "data/state.json");
const binary =
  process.env.MIX_ROUTER_BIN ??
  ["target/release/mix-router", "target/debug/mix-router"].map((p) => resolve(root, p)).find(existsSync) ??
  resolve(root, "target/release/mix-router");

const router = new MixRouter(binary);
const gateway = new Gateway(new Store(dataFile), router, process.env.COMMS_NAME ?? "Comms");
const options = { mediaIp: process.env.COMMS_MEDIA_IP, logger: { level: "warn" } };

/** Serves the built apps when they exist: Talk at /, Manager at /manager/. */
function withApps(app: FastifyInstance): FastifyInstance {
  const talk = resolve(root, "apps/talk/dist");
  const manager = resolve(root, "apps/manager/dist");
  if (existsSync(manager)) {
    void app.register(fastifyStatic, { root: manager, prefix: "/manager/", decorateReply: false });
  }
  if (existsSync(talk)) {
    void app.register(fastifyStatic, { root: talk, prefix: "/" });
  }
  app.setNotFoundHandler((request, reply) => {
    if (request.method !== "GET" || request.url.startsWith("/api/")) return reply.code(404).send({ error: "not found" });
    const [dir, prefix] = request.url.startsWith("/manager") ? [manager, "manager"] : [talk, ""];
    const index = resolve(dir, "index.html");
    if (!existsSync(index)) return reply.code(404).send({ error: "app is not built; run npm run build" });
    return reply.type("text/html").send(readFileSync(index));
  });
  return app;
}

router.start();

// Plain HTTP: hardware nodes and command-line tools. Browsers use HTTPS below (secure context for the mic).
const http = withApps(buildServer(gateway, options));
await http.listen({ port: httpPort, host: "0.0.0.0" });

const certificate = process.env.COMMS_TLS === "0" ? undefined : loadOrCreateCertificate(resolve(root, "data/tls"));
if (certificate) {
  const https = withApps(buildServer(gateway, { ...options, https: certificate }));
  await https.listen({ port: httpsPort, host: "0.0.0.0" });
}

const ip =
  Object.values(networkInterfaces())
    .flat()
    .find((info) => info?.family === "IPv4" && !info.internal)?.address ?? "localhost";
console.log(`\n  Gateway   http://${ip}:${httpPort}   (hardware nodes)`);
if (certificate) {
  console.log(`  Talk      https://${ip}:${httpsPort}   (phones; accept the certificate warning once)`);
  console.log(`  Manager   https://${ip}:${httpsPort}/manager/\n`);
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    gateway.store.flush();
    router.stop();
    process.exit(0);
  });
}
