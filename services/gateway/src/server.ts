import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import { networkInterfaces } from "node:os";
import type { MediaSessionRequest, NodeRegistration, ServerEvent } from "@comms/protocol";
import { Gateway, HttpError } from "./gateway.ts";

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

/** The address phones should send media to: the one they used to reach us. */
export function candidateIp(request: FastifyRequest, override?: string): string {
  if (override) return override;
  const host = (request.headers["x-forwarded-host"] ?? request.headers.host ?? "").toString().split(":")[0]!;
  if (IPV4.test(host) && host !== "127.0.0.1") return host;
  for (const list of Object.values(networkInterfaces())) {
    for (const info of list ?? []) {
      if (info.family === "IPv4" && !info.internal) return info.address;
    }
  }
  return "127.0.0.1";
}

export function describeClient(userAgent = ""): string {
  const device = /iPhone/.test(userAgent)
    ? "iPhone"
    : /iPad/.test(userAgent)
      ? "iPad"
      : /Android/.test(userAgent)
        ? "Android"
        : /Macintosh/.test(userAgent)
          ? "Mac"
          : /Windows/.test(userAgent)
            ? "Windows"
            : /Linux/.test(userAgent)
              ? "Linux"
              : "Unknown";
  const browser = /Edg\//.test(userAgent)
    ? "Edge"
    : /Firefox\//.test(userAgent)
      ? "Firefox"
      : /Chrome\/|CriOS\//.test(userAgent)
        ? "Chrome"
        : /Safari\//.test(userAgent)
          ? "Safari"
          : "browser";
  return `${device}, ${browser}`;
}

export function buildServer(gateway: Gateway, options: { mediaIp?: string; logger?: boolean } = {}): FastifyInstance {
  const app = Fastify({ logger: options.logger ?? false, bodyLimit: 1_000_000 });

  app.setErrorHandler((error: Error & { statusCode?: number }, _request, reply) => {
    if (error instanceof HttpError) return reply.code(error.status).send({ error: error.message });
    const status = error.statusCode ?? 500;
    if (status >= 500) app.log.error(error);
    return reply.code(status).send({ error: status >= 500 ? "internal error" : error.message });
  });

  app.get("/api/v1/health", async () => ({
    ok: true,
    mixer: gateway.router.ready,
    rev: gateway.rev,
    online: [...gateway.live.values()].filter((live) => live.connected).length,
  }));

  app.get("/api/v1/state", async () => gateway.snapshot());

  app.get("/api/v1/events", (request, reply) => {
    reply.hijack();
    const raw = reply.raw;
    raw.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    });
    const send = (event: ServerEvent) => raw.write(`data: ${JSON.stringify(event)}\n\n`);
    send({ type: "snapshot", ...gateway.snapshot() });
    const onEvent = (event: ServerEvent) => send(event);
    gateway.on("event", onEvent);
    const keepAlive = setInterval(() => raw.write(": keep-alive\n\n"), 15_000);
    request.raw.on("close", () => {
      clearInterval(keepAlive);
      gateway.off("event", onEvent);
    });
  });

  // ---- config ----
  const body = (request: FastifyRequest) => (request.body ?? {}) as Record<string, unknown>;
  const idOf = (request: FastifyRequest) => (request.params as { id: string }).id;

  app.post("/api/v1/packs", async (request, reply) =>
    reply.code(201).send(gateway.publicPack(gateway.createPack(body(request)))),
  );
  app.patch("/api/v1/packs/:id", async (request) =>
    gateway.publicPack(gateway.updatePack(idOf(request), body(request))),
  );
  app.delete("/api/v1/packs/:id", async (request, reply) => {
    gateway.deletePack(idOf(request));
    return reply.code(204).send();
  });
  app.post("/api/v1/channels", async (request, reply) => reply.code(201).send(gateway.createChannel(body(request))));
  app.patch("/api/v1/channels/:id", async (request) => gateway.updateChannel(idOf(request), body(request)));
  app.delete("/api/v1/channels/:id", async (request, reply) => {
    gateway.deleteChannel(idOf(request));
    return reply.code(204).send();
  });

  // ---- media (WHEP-style) ----
  app.post("/api/v1/media/sessions", async (request, reply) => {
    const { packId, offer, pin } = body(request) as unknown as MediaSessionRequest;
    if (!packId || typeof offer !== "string") throw new HttpError(400, "packId and offer are required");
    const result = await gateway.openSession(
      packId,
      offer,
      pin,
      candidateIp(request, options.mediaIp),
      describeClient(request.headers["user-agent"]),
    );
    return reply.code(201).send(result);
  });
  app.delete("/api/v1/media/sessions/:id", async (request, reply) => {
    gateway.closeSession(idOf(request));
    return reply.code(204).send();
  });

  // ---- hardware nodes ----
  app.post("/api/v1/nodes/register", async (request) => {
    const pack = gateway.registerNode(body(request) as unknown as NodeRegistration);
    return { packId: pack.id };
  });

  return app;
}
