import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import { networkInterfaces } from "node:os";
import type { PortSessionRequest, ShowEvent } from "@comms/protocol";
import { HttpError } from "./errors.ts";
import { Gateway } from "./gateway.ts";
import { validate } from "./validate.ts";

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

export function buildServer(
  gateway: Gateway,
  options: { mediaIp?: string; logger?: boolean | { level: string }; https?: { key: Buffer; cert: Buffer } } = {},
): FastifyInstance {
  const app = (options.https
    ? Fastify({ logger: options.logger ?? false, bodyLimit: 1_000_000, https: options.https })
    : Fastify({ logger: options.logger ?? false, bodyLimit: 1_000_000 })) as unknown as FastifyInstance;

  app.setErrorHandler((error: Error & { statusCode?: number }, _request, reply) => {
    if (error instanceof HttpError) return reply.code(error.status).send({ error: error.message });
    const status = error.statusCode ?? 500;
    if (status >= 500) app.log.error(error);
    return reply.code(status).send({ error: status >= 500 ? "internal error" : error.message });
  });

  app.get('/api/v2/health', async () => ({ ok: true, mixer: gateway.router.ready, mixerStats: gateway.mixerStats ?? null, rev: gateway.rev, online: [...gateway.live.values()].filter(s => s.connected).length }));
  app.get('/api/v2/state', async () => gateway.snapshot());
  app.get('/api/v2/events', (request, reply) => {
    reply.hijack();
    const raw = reply.raw;
    raw.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache, no-transform', connection: 'keep-alive', 'x-accel-buffering': 'no' });
    const send = (event: ShowEvent) => raw.write(`data: ${JSON.stringify(event)}\n\n`);
    send({ type: 'snapshot', ...gateway.snapshot() });
    gateway.on('event', send);
    const keepAlive = setInterval(() => raw.write(': keep-alive\n\n'), 15000);
    request.raw.on('close', () => { clearInterval(keepAlive); gateway.off('event', send); });
  });
  const id = (request: FastifyRequest) => (request.params as { id: string }).id;
  app.put('/api/v2/show', async request => gateway.replaceShow(request.body));
  app.post('/api/v2/ports', async (request, reply) => reply.code(201).send(gateway.createPort(request.body)));
  app.put('/api/v2/ports/:id', async request => gateway.updatePort(id(request), request.body));
  app.delete('/api/v2/ports/:id', async (request, reply) => { gateway.deletePort(id(request)); return reply.code(204).send(); });
  app.post('/api/v2/ports/:id/pin', async (request, reply) => {
    const body = validate<{ pin?: string }>('PinCheck', request.body);
    gateway.verifyPin(id(request), body.pin); return reply.code(204).send();
  });
  app.delete('/api/v2/ports/:id/pin', async (request, reply) => { gateway.clearPin(id(request)); return reply.code(204).send(); });
  app.post('/api/v2/media/sessions', async (request, reply) => {
    const body = validate<PortSessionRequest>('PortSessionRequest', request.body);
    if (!!body.portId === !!body.nodeId) throw new HttpError(400, 'Choose exactly one station or node.');
    const result = await gateway.openSession(body.portId ?? body.nodeId!, body.offer, body.pin, candidateIp(request, options.mediaIp), describeClient(request.headers['user-agent']));
    const answer = result.answer.replace(/(a=rtpmap:\d+ opus\/48000\/2\r\n)/g, '$1a=ptime:10\r\n');
    return reply.code(201).send({ ...result, answer });
  });
  app.delete('/api/v2/media/sessions/:id', async (request, reply) => { gateway.closeSession(id(request)); return reply.code(204).send(); });
  app.post('/api/v2/nodes/register', async request => gateway.registerNode(request.body));
  app.put('/api/v2/nodes/:id', async request => gateway.updateNode(id(request), request.body));
  return app;
}
