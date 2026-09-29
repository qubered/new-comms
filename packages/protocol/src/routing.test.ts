import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { checkPorts, expand } from './routing.ts';
import { migrateV1 } from './migration.ts';
import type { Port, Pack, Channel } from './generated.ts';

const station = (id: string): Port => ({ id, name: id, label: id, type: 'station', station: { masterVolume: 100, volumes: {}, replyMode: 'ptt' }, triggers: [] });
const bus = (id: string): Port => ({ id, name: id, label: id, type: 'conference', triggers: [] });
const mic = (id: string): Port => ({ id, name: id, label: id, type: 'input', hardware: { nodeId: 'rack', channel: 1, trim: 0 }, triggers: [] });

it('reproduces every crosspoint in the Manager mockup', () => {
  const html = readFileSync(new URL('../../../docs/design/mockups/manager-v2.html', import.meta.url), 'utf8');
  const start = html.indexOf('  const P = [];');
  const end = html.indexOf('  const isOpen =');
  const fixture = runInNewContext(`${html.slice(start, end)}; ({ports:P,crosspoints:expand()})`) as { ports: any[]; crosspoints: any[] };
  const ports: Port[] = fixture.ports.map(p => ({
    id: p.id, name: p.name, label: p.label, type: p.type,
    ...(p.station ? { station: { masterVolume: p.station.master, volumes: {}, replyMode: p.station.replyMode } } : {}),
    ...(p.hardware ? { hardware: { nodeId: p.hardware.node, channel: p.hardware.channel, trim: p.hardware.trim } } : {}),
    ...(p.group ? { group: p.group } : {}), ...(p.ifb ? { ifb: p.ifb } : {}),
    triggers: p.triggers.map((t: any) => ({ ...t, functions: t.functions.map((f: any) => {
      const targetField = ({callToPort:'to',callToConference:'conf',callToGroup:'group',callToIFB:'ifb',listenToPort:'from',routeAudio:'to'} as Record<string,string>)[f.fn];
      return { fn: f.fn, level: f.level, ...(targetField ? { [targetField]: f.target } : {}), ...(f.fn === 'routeAudio' ? { from: p.id } : {}) };
    }) })),
  }));
  const actual = expand(ports).map(x => [x.source, x.destination, x.level, x.gate === 'always' ? 'always' : `${x.gate.port}:${x.gate.trigger.kind}:${x.gate.trigger.kind === 'key' ? x.gate.trigger.key : ''}`, x.owner]);
  const expected = fixture.crosspoints.map(x => [x.s, x.d, x.level, x.gate === 'always' ? 'always' : `${x.gate.port}:${x.gate.trigger.kind}:${x.gate.trigger.key ?? ''}`, x.owner]);
  expect(actual).toEqual(expected);
  expect(actual.length).toBeGreaterThan(60);
  expect(checkPorts(ports)).toEqual([]);
});

it('keeps passive conference returns and third-party route gates distinct', () => {
  const a = station('a'), b = station('b'), input = mic('mic'), conf = bus('show');
  a.triggers = [{ kind: 'key', key: 2, functions: [{ fn: 'callToConference', conf: 'show', level: -6 }, { fn: 'routeAudio', from: 'mic', to: 'b' }] }];
  const x = expand([a, b, input, conf]);
  expect(x.map(x => [x.source, x.destination, x.gate])).toEqual([
    ['a','show',{port:'a',trigger:{kind:'key',key:2}}], ['show','a','always'], ['mic','b',{port:'a',trigger:{kind:'key',key:2}}],
  ]);
});

it('routes IFB program and destination once and leaves Reply dynamic', () => {
  const a = station('a'), input = mic('mic');
  const ifb: Port = { ...bus('ifb'), type: 'ifb', ifb: { program: 'mic', destination: 'a', dim: null } };
  a.triggers = [{ kind: 'reply', functions: [{ fn: 'reply' }] }];
  expect(expand([a, input, ifb])).toHaveLength(2);
  a.triggers.push({ kind: 'always', functions: [{ fn: 'listenToPort', from: 'ifb' }] });
  expect(expand([a, input, ifb]).filter(x => x.source === 'ifb' && x.destination === 'a')).toHaveLength(1);
});

it('keeps the permanent IFB destination feed when another route is gated', () => {
  const a = station('a'), input = mic('mic'), controller = station('controller');
  const ifb: Port = { ...bus('ifb'), type: 'ifb', ifb: { program: 'mic', destination: 'a', dim: -20 } };
  a.triggers = [{ kind: 'key', key: 3, functions: [{ fn: 'listenToPort', from: 'ifb' }] }];
  controller.triggers = [{ kind: 'onCall', functions: [{ fn: 'routeAudio', from: 'ifb', to: 'a' }] }];
  const routes = expand([a, input, ifb, controller]).filter(x => x.source === 'ifb' && x.destination === 'a');
  expect(routes.filter(x => x.gate === 'always')).toEqual([expect.objectContaining({ owner: 'ifb' })]);
  expect(routes.filter(x => x.gate !== 'always')).toHaveLength(2);
});

describe('constraints', () => {
  it('rejects invalid and duplicate keys, input keys and output Vox', () => {
    const a = station('a');
    a.triggers = Array.from({ length: 7 }, (_, i) => ({kind:'key' as const,key:i+1,functions:[]}));
    expect(checkPorts([a]).map(x => x.message)).toContain('A station has at most six key triggers.');
    const input = mic('mic'); input.triggers = [{kind:'key',key:1,functions:[]}];
    expect(checkPorts([input])[0].message).toBe('Only stations have keys and Reply.');
    a.triggers = [{kind:'key',key:1,functions:[]},{kind:'key',key:1,functions:[]}];
    expect(checkPorts([a])[0].message).toBe('Each trigger may be configured only once.');
    expect(checkPorts([{...input,type:'output',triggers:[{kind:'vox',functions:[]}]}])[0].message).toBe('Only stations and inputs have Vox.');
  });
  it('rejects groups as sources, empty groups, wrong members and bus chains', () => {
    const a = station('a'), c = bus('c'), d = bus('d');
    const g: Port = {...bus('g'), type:'group',group:{members:[]}};
    a.triggers = [{kind:'always',functions:[{fn:'listenToPort',from:'g'},{fn:'routeAudio',from:'c',to:'d'}]}];
    expect(checkPorts([a,c,d,g]).map(x => x.message)).toEqual(expect.arrayContaining(['Groups are never sources.','A group needs members.','No conference/IFB → conference/IFB crosspoints.']));
    g.group!.members = ['c'];
    expect(checkPorts([a,c,d,g]).map(x => x.message)).toContain('Group members must be stations or outputs.');
  });
  it('requires IFB endpoints and reports empty conferences without blocking creation', () => {
    expect(checkPorts([{...bus('ifb'),type:'ifb'}])[0].message).toBe('An IFB needs a program and a destination.');
    expect(checkPorts([bus('show')])).toEqual([{portId:'show',message:'A conference needs at least one talker.',severity:'attention'}]);
  });
});

it('migrates party lines, PGM, direct calls, hardware trims and operator levels without mutation', () => {
  const channels: Channel[] = [{id:'show',name:'Show',type:'partyline',members:[]},{id:'pgm',name:'Program',type:'pgm',members:[]},{id:'direct',name:'Direct',type:'direct',members:[]}];
  const pack = (id: string): Pack => ({id,name:id,type:'human',masterVolume:80,keys:[{channelId:'show',mode:'auto',volume:65},{channelId:'pgm',mode:'ptt',volume:0},{channelId:'direct',mode:'latch',volume:45}]});
  const a = pack('a'), b = pack('b');
  const node: Pack = {...pack('rack'),type:'hardware',keys:[{channelId:'pgm',mode:'ptt',volume:100}],device:{name:'Rack',address:'local',inputs:['In 1'],outputs:['Out 1'],input:'In 1',output:'Out 1',lastSeen:99,inputTrim:6,outputTrim:-6}};
  const before = JSON.stringify({channels,packs:[a,b,node]});
  const show = migrateV1(JSON.parse(before));
  expect(checkPorts(show.ports)).toEqual([]);
  const migrated = show.ports.find(p => p.id === 'a')!;
  expect(migrated.station!.volumes).toEqual({show:65,b:45});
  expect(migrated.triggers.filter(t => t.kind === 'key').map(t => t.key)).toEqual([1,2]);
  expect(expand(show.ports)).toEqual(expect.arrayContaining([
    expect.objectContaining({source:'rack-in1',destination:'pgm',gate:'always'}),
    expect.objectContaining({source:'pgm',destination:'a',gate:'always'}),
    expect.objectContaining({source:'a',destination:'b',role:'call'}),
  ]));
  expect(show.nodes[0].inputs[0].trim).toBe(6);
  expect(show.ports.find(p => p.id === 'rack-out1')!.hardware!.trim).toBe(-6);
  expect(JSON.stringify({channels,packs:[a,b,node]})).toBe(before);
});

it('migrates a hardware direct receive level onto its input and keeps PGM at full volume', () => {
  const channels: Channel[] = [{ id: 'direct', name: 'Direct', type: 'direct', members: [] }, { id: 'pgm', name: 'PGM', type: 'pgm', members: [] }];
  const packs: Pack[] = [
    { id: 'phone', name: 'Phone', type: 'human', masterVolume: 80, keys: [{ channelId: 'direct', mode: 'ptt', volume: 37 }, { channelId: 'pgm', mode: 'ptt', volume: 0 }] },
    { id: 'rack', name: 'Rack', type: 'hardware', masterVolume: 100, device: { name: 'Rack', address: '', inputs: ['In 1'], outputs: ['Out 1'], input: 'In 1', output: 'Out 1', lastSeen: 0 }, keys: [{ channelId: 'direct', mode: 'ptt', volume: 100 }, { channelId: 'pgm', mode: 'ptt', volume: 100 }] },
  ];
  const show = migrateV1({ channels, packs });
  const phone = show.ports.find(p => p.id === 'phone')!;
  expect(phone.station!.volumes).toEqual({ 'rack-in1': 37 });
  expect(phone.station!.volumes.pgm ?? 100).toBe(100);
  expect(expand(show.ports)).toEqual(expect.arrayContaining([
    expect.objectContaining({ source: 'rack-in1', destination: 'phone', role: 'call' }),
    expect.objectContaining({ source: 'pgm', destination: 'phone', level: 0, gate: 'always' }),
  ]));
});

it('keeps migrated conference IDs distinct from hardware session IDs', () => {
  const show = migrateV1({
    channels: [{ id: 'rack', name: 'Show', type: 'partyline', members: [] }],
    packs: [{ id: 'rack', name: 'Rack', type: 'hardware', masterVolume: 100, device: { name: 'Rack', address: '', inputs: ['In 1'], outputs: ['Out 1'], input: 'In 1', output: 'Out 1', lastSeen: 0 }, keys: [{ channelId: 'rack', mode: 'ptt', volume: 100 }] }],
  });
  expect(show.ports.find(p => p.type === 'conference')?.id).toBe('rack-2');
  expect(show.nodes[0].id).toBe('rack');
  expect(checkPorts(show.ports)).toEqual([]);
});
