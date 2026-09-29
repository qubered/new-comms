import type { Port, PortWrite, Node, NodeWrite } from '@comms/protocol';
async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api/v2${path}`, { method, headers: body ? { 'content-type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
  if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error ?? `${method} ${path} failed (${response.status})`);
  return response.status === 204 ? undefined as T : response.json();
}
export const portWrite = ({ id, hasPin, ...p }: Port): PortWrite => p;
export const api = {
  createPort: (body: PortWrite) => call<Port>('POST', '/ports', body),
  updatePort: (p: Port) => call<Port>('PUT', `/ports/${encodeURIComponent(p.id)}`, portWrite(p)),
  deletePort: (id: string) => call<void>('DELETE', `/ports/${encodeURIComponent(id)}`),
  clearPin: (id: string) => call<void>('DELETE', `/ports/${encodeURIComponent(id)}/pin`),
  updateNode: (id: string, body: NodeWrite) => call<Node>('PUT', `/nodes/${encodeURIComponent(id)}`, body),
  health: () => call<{ mixer: boolean; mixerStats: { tickAvgUs: number; tickMaxUs: number; peers: number; queues?: {portId:string;queueMs:number;targetMs:number}[][] } | null }>('GET', '/health'),
};
