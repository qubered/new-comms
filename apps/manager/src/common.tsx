import type { ReactNode } from 'react';
import type { Gate, Port, PortType, KeyMode, ShowSnapshot } from '@comms/protocol';
export const TYPE_LABEL: Record<PortType, string> = { station: 'Station', input: 'Input', output: 'Output', conference: 'Conference', group: 'Group', ifb: 'IFB' };
export const MODE_LABEL: Record<KeyMode, string> = { ptt: 'Hold', latch: 'Tap', auto: 'Tap/hold' };
export const label = (state: ShowSnapshot, id: string) => state.ports.find(p => p.id === id)?.label ?? id;
export const gateText = (g: Gate) => g === 'always' ? 'Always' : g.trigger.kind === 'key' ? `Key ${g.trigger.key}` : { reply: 'Reply', vox: 'Vox', onCall: 'On call' }[g.trigger.kind];
export const gateOpen = (g: Gate, state: ShowSnapshot) => g === 'always' || (g.trigger.kind === 'key' ? state.live[g.port]?.keys[String(g.trigger.key)] : g.trigger.kind === 'vox' ? state.live[g.port]?.voxOpen : g.trigger.kind === 'reply' ? state.live[g.port]?.keys.reply : !!state.live[g.port]?.incoming.length);
export function Head({ title, sub, action }: { title: string; sub: string; action?: ReactNode }) { return <div className="head"><div><h1>{title}</h1><div className="sub">{sub}</div></div>{action}</div>; }
export function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="field"><span>{label}</span>{children}</label>; }

export const opensMic = (p: Port, key: string | number) => p.triggers.find(t => String(key) === "reply" ? t.kind === "reply" : t.kind === "key" && String(t.key) === String(key))?.functions.some(f => f.fn.startsWith("callTo") || f.fn === "reply" || f.fn === "routeAudio" && f.from === p.id) ?? false;
