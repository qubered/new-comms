import type { ShowEvent, ShowSnapshot } from './generated.ts';
export function applyShowEvent(state: ShowSnapshot | null, event: ShowEvent): ShowSnapshot | null | 'resync' {
  if (event.type === 'snapshot') { const { type, ...snapshot } = event; return snapshot; }
  if (event.type === 'levels') return state;
  if (!state || event.rev !== state.rev + 1) return 'resync';
  if (event.type === 'config') { const { type, ...config } = event; return { ...state, ...config, live: Object.fromEntries(Object.entries(state.live).filter(([id]) => event.ports.some(p => p.id === id))) }; }
  return { ...state, rev: event.rev, live: { ...state.live, [event.portId]: event.live } };
}
