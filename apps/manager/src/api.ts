import type { Channel, ChannelWrite, PackWrite, PublicPack } from "@comms/protocol";

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api/v1${path}`, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    const detail = ((await response.json().catch(() => ({}))) as { error?: string }).error;
    throw new Error(detail ?? `${method} ${path} failed (${response.status})`);
  }
  return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
}

export const api = {
  createPack: (body: PackWrite) => call<PublicPack>("POST", "/packs", body),
  updatePack: (id: string, body: PackWrite) => call<PublicPack>("PATCH", `/packs/${id}`, body),
  deletePack: (id: string) => call<void>("DELETE", `/packs/${id}`),
  createChannel: (body: ChannelWrite) => call<Channel>("POST", "/channels", body),
  updateChannel: (id: string, body: ChannelWrite) => call<Channel>("PATCH", `/channels/${id}`, body),
  deleteChannel: (id: string) => call<void>("DELETE", `/channels/${id}`),
  health: () => call<{ ok: boolean; mixer: boolean; online: number }>("GET", "/health"),
};
