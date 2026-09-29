import type { Port, Show } from './generated.ts';

/** A complete v2 show, usable as an offline seed or an atomic gateway import. */
export function demoShow(): Show {
  const ports: Port[] = [
    { id: 'show', name: 'Production', label: 'Show', subtitle: 'Everyone on the floor', type: 'conference', triggers: [] },
    { id: 'cams', name: 'Cameras', label: 'Cams', type: 'conference', triggers: [] },
  ];
  for (const [id, name, conf] of [['sm', 'Stage Manager', 'show'], ['director', 'Director', 'show'], ['cam1', 'Camera 1', 'cams'], ['cam2', 'Camera 2', 'cams']]) {
    ports.push({ id, name, label: name, type: 'station', station: { masterVolume: 80, volumes: {}, replyMode: 'ptt' }, triggers: [
      { kind: 'key', key: 1, mode: 'auto', functions: [{ fn: 'callToConference', conf }] },
      { kind: 'reply', mode: 'ptt', functions: [{ fn: 'reply' }] },
    ] });
  }
  ports.find(p => p.id === 'director')!.triggers.push(
    { kind: 'key', key: 2, mode: 'auto', functions: [{ fn: 'callToConference', conf: 'cams' }] },
    { kind: 'key', key: 3, mode: 'ptt', functions: [{ fn: 'callToGroup', group: 'all' }] },
  );
  ports.push({ id: 'all', name: 'All call', label: 'All', type: 'group', group: { members: ['sm', 'cam1', 'cam2'] }, triggers: [] });
  return { version: 2, name: 'Stage A', ports, nodes: [] };
}
