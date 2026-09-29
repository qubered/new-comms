import { useEffect, useState } from 'react';
import { DEFAULT_VOX, functionTarget, hasInput, hasOutput, type Port, type Trigger, type Function as PortFunction, type ShowSnapshot, type PortType, type KeyMode } from '@comms/protocol';
import { api, portWrite } from './api.ts';
import { Field, Head, TYPE_LABEL, MODE_LABEL, label, gateText, opensMic } from './common.tsx';
const FN: Record<PortFunction['fn'], string> = { callToPort: 'Call to port', callToConference: 'Call to conference', callToGroup: 'Call to group', callToIFB: 'Call to IFB', listenToPort: 'Listen to', routeAudio: 'Route audio', reply: 'Reply' };
const makeFunction = (fn: PortFunction['fn'], target: string, owner: string): PortFunction => {
  switch (fn) {
    case 'callToPort': return { fn, to: target };
    case 'callToConference': return { fn, conf: target };
    case 'callToGroup': return { fn, group: target };
    case 'callToIFB': return { fn, ifb: target };
    case 'listenToPort': return { fn, from: target };
    case 'routeAudio': return { fn, from: owner, to: target };
    case 'reply': return { fn };
  }
};
const targets = (fn: PortFunction['fn'], ports: Port[]) => ports.filter(p => {
  switch (fn) {
    case 'callToPort': return p.type === 'station' || p.type === 'output';
    case 'callToConference': return p.type === 'conference';
    case 'callToGroup': return p.type === 'group';
    case 'callToIFB': return p.type === 'ifb';
    case 'listenToPort': return hasInput(p);
    case 'routeAudio': return hasOutput(p);
    default: return false;
  }
});
function FunctionRow({ f, owner, ports, onChange, onRemove }: { f: PortFunction; owner: Port; ports: Port[]; onChange(f: PortFunction): void; onRemove(): void }) {
  const options = (Object.keys(FN) as PortFunction['fn'][]).filter(fn => fn !== 'reply' && (hasInput(owner) || !['callToPort', 'callToGroup', 'callToIFB'].includes(fn)) && (hasOutput(owner) || fn !== 'listenToPort'));
  return <div className="fn">
    <select className="sel" aria-label="Function" value={f.fn} onChange={e => { const fn = e.target.value as PortFunction['fn']; onChange(makeFunction(fn, targets(fn, ports)[0]?.id ?? '', owner.id || ports.find(hasInput)?.id || '')); }}>{options.map(fn => <option key={fn} value={fn}>{FN[fn]}</option>)}</select>
    <select className="sel" aria-label="Target" value={functionTarget(f) ?? ''} onChange={e => onChange({ ...makeFunction(f.fn, e.target.value, owner.id), level: f.level, ...(f.fn === 'routeAudio' ? { from: f.from } : {}) } as PortFunction)}><option value="" disabled>Choose target</option>{targets(f.fn, ports).map(p => <option key={p.id} value={p.id}>{p.label}</option>)}</select>
    <label className="lvl"><input className="in" aria-label="Function level in dB" type="number" min={-100} max={24} value={f.level ?? 0} onChange={e => onChange({ ...f, level: Number(e.target.value) })} />dB</label>
    <button type="button" className="x" aria-label="Remove function" onClick={onRemove}>×</button>
    {f.fn === 'routeAudio' && <label className="field function-source"><span>Route source</span><select className="sel" value={f.from} onChange={e => onChange({ ...f, from: e.target.value })}>{ports.filter(hasInput).map(p => <option key={p.id} value={p.id}>{p.label}</option>)}</select></label>}
  </div>;
}
export const newPort = (type: PortType = 'station'): Port => ({ id: '', name: '', label: '', type, triggers: type === 'station' ? [{ kind: 'reply', mode: 'ptt', functions: [{ fn: 'reply' }] }] : [],
  ...(type === 'station' ? { station: { masterVolume: 80, volumes: {}, replyMode: 'ptt' } } : {}), ...(type === 'group' ? { group: { members: [] } } : {}), ...(type === 'ifb' ? { ifb: { program: '', destination: '', dim: -15 } } : {}) });
export function PortEditor({ port, state, onSelect, onError, onSaved }: { port: Port; state: ShowSnapshot; onSelect(id: string): void; onError(s: string): void; onSaved(p: Port): void }) {
  const [draft, setDraft] = useState(() => structuredClone(port)); const [dirty, setDirty] = useState(false); const [busy, setBusy] = useState(false); const [key, setKey] = useState(1);
  useEffect(() => { if (!dirty) setDraft(structuredClone(port)); }, [port]);
  const edit = (fn: (p: Port) => void) => { const next = structuredClone(draft); fn(next); setDraft(next); setDirty(true); };
  const run = async (fn: () => Promise<void>) => { setBusy(true); try { await fn(); } catch (e) { onError((e as Error).message); } finally { setBusy(false); } };
  const save = () => run(async () => { const body = { ...draft, label: draft.label || draft.name }; const result = draft.id ? await api.updatePort(body) : await api.createPort(portWrite(body)); setDraft(result); setDirty(false); onSaved(result); });
  const virtual = ['group', 'conference', 'ifb'].includes(draft.type);
  const triggerEditor = (kind: Trigger['kind'], number?: number) => {
    const index = draft.triggers.findIndex(t => t.kind === kind && (t.kind !== 'key' || t.key === number));
    const t = draft.triggers[index];
    const update = (fn: (t: Trigger) => void) => edit(p => {
      const existing = p.triggers.find(t => t.kind === kind && (t.kind !== 'key' || t.key === number));
      const tr: Trigger = existing ?? (kind === 'key' ? { kind, key: number!, mode: 'ptt', functions: [] } : { kind, functions: [] });
      if (!existing) p.triggers.push(tr);
      fn(tr);
    });
    return <div className="row" key={`${kind}:${number}`}><div className="tname">{kind === 'key' ? `Key ${number}` : kind === 'onCall' ? 'On call' : kind[0].toUpperCase() + kind.slice(1)}{kind === 'key' && <select className="sel" aria-label="Key mode" value={t?.kind === 'key' ? t.mode ?? 'ptt' : 'ptt'} onChange={e => update(t => { if (t.kind === 'key') t.mode = e.target.value as KeyMode; })}>{Object.entries(MODE_LABEL).map(([v,n]) => <option key={v} value={v}>{n}</option>)}</select>}</div><div className="fns">{t?.functions.map((f, i) => <FunctionRow key={i} f={f} owner={draft} ports={state.ports} onChange={f => update(t => { t.functions[i] = f; })} onRemove={() => update(t => { t.functions.splice(i, 1); })} />)}{!t?.functions.length && <span className="nothing">No functions</span>}<button type="button" className="addfn" onClick={() => update(t => { const fn = targets('callToConference', state.ports).length ? 'callToConference' : hasInput(draft) ? 'callToPort' : 'listenToPort'; t.functions.push(makeFunction(fn, targets(fn, state.ports)[0]?.id ?? '', draft.id)); })}>+ Add function</button></div>{t && <button type="button" className="btn quiet sm" onClick={() => edit(p => { p.triggers.splice(index, 1); })}>Clear</button>}</div>;
  };
  const incoming = state.crosspoints.filter(x => x.destination === draft.id && x.owner !== draft.id);
  return <form className="editor" onSubmit={e => { e.preventDefault(); void save(); }}>
    <fieldset disabled={busy} className="editor">
      <div className="ed-head"><span className={`sw ${draft.type}`} /><input className="name-in" required aria-label="Port name" placeholder="Port name" value={draft.name} onChange={e => edit(p => { p.name = e.target.value; })} />{draft.id ? <span className="badge">{TYPE_LABEL[draft.type]}</span> : <select className="sel" style={{ width: 150 }} aria-label="Port type" value={draft.type} onChange={e => { setDraft({ ...newPort(e.target.value as PortType), name: draft.name, label: draft.label }); setDirty(true); }}>{(['station','conference','group','ifb'] as const).map(type => <option key={type} value={type}>{TYPE_LABEL[type]}</option>)}</select>}</div>
      <div className="fields">{(['label','alias','subtitle'] as const).map(field => <Field key={field} label={field[0].toUpperCase()+field.slice(1)}><input className="in" value={draft[field] ?? ''} placeholder={field === 'label' ? draft.name : ''} onChange={e => edit(p => { p[field] = e.target.value; })} /></Field>)}</div>
      {draft.type === 'station' && <>
        <section className="blk"><h3>Keys <span className="dim">Pick a key to edit its functions</span></h3><div className="bp">{[1,2,3,4,5,6].map(n => { const t = draft.triggers.find(t => t.kind === 'key' && t.key === n); const f = t?.functions[0]; return <button type="button" key={n} className={`bpkey${key===n?' on':''}${state.live[draft.id]?.keys[n]&&opensMic(draft,n)?' hot':''}`} onClick={() => setKey(n)}><span className="n">{n}</span><b>{f ? label(state,functionTarget(f) ?? '') : 'Empty'}</b><small>{f ? FN[f.fn] : 'Add a function'}</small></button>; })}</div><div className="trig">{triggerEditor('key',key)}</div></section>
        <div className="fields"><Field label="Reply mode"><select className="sel" value={draft.station!.replyMode} onChange={e => edit(p => { p.station!.replyMode=e.target.value as KeyMode; const tr=p.triggers.find(t=>t.kind==='reply'); if(tr?.kind==='reply')tr.mode=e.target.value as KeyMode; })}>{Object.entries(MODE_LABEL).map(([v,n])=><option key={v} value={v}>{n}</option>)}</select></Field><Field label={draft.hasPin ? 'Replace PIN' : 'PIN (optional)'}><input className="in" type="password" inputMode="numeric" pattern="[0-9]{4}" maxLength={4} autoComplete="new-password" value={draft.station!.pin ?? ''} onChange={e=>edit(p=>{if(e.target.value)p.station!.pin=e.target.value;else delete p.station!.pin;})}/></Field><Field label="Master volume"><input className="in" type="number" min={0} max={100} value={draft.station!.masterVolume} onChange={e=>edit(p=>{p.station!.masterVolume=Number(e.target.value);})}/></Field></div>
        {draft.hasPin && <button type="button" className="btn quiet" onClick={()=>void run(async()=>{await api.clearPin(draft.id);edit(p=>{p.hasPin=false;delete p.station!.pin;});})}>Remove PIN</button>}
      </>}
      {!virtual && <section className="blk"><h3>Standing functions</h3><div className="trig">{triggerEditor('always')}{draft.type!=='output'&&triggerEditor('vox')}{triggerEditor('onCall')}</div></section>}
      {['station','input'].includes(draft.type) && <section className="blk"><h3>Vox</h3><div className="fields">{(['threshold','attack','hang'] as const).map(field=><Field key={field} label={`${field[0].toUpperCase()+field.slice(1)} (${field==='threshold'?'dBFS':'ms'})`}><input className="in" type="number" min={field==='threshold'?-100:0} max={field==='threshold'?0:field==='attack'?1000:10000} value={(draft.vox??DEFAULT_VOX)[field]} onChange={e=>edit(p=>{p.vox={...(p.vox??DEFAULT_VOX),[field]:Number(e.target.value)};})}/></Field>)}</div></section>}
      {draft.group && <section className="blk"><h3>Members</h3><div className="checks">{state.ports.filter(p=>['station','output'].includes(p.type)).map(p=><label key={p.id}><input type="checkbox" checked={draft.group!.members.includes(p.id)} onChange={e=>edit(d=>{d.group!.members=e.target.checked?[...d.group!.members,p.id]:d.group!.members.filter(id=>id!==p.id);})}/>{p.label}</label>)}</div></section>}
      {draft.ifb && <div className="fields">{(['program','destination'] as const).map(field=><Field key={field} label={field==='program'?'Program':'Destination'}><select className="sel" required value={draft.ifb![field]} onChange={e=>edit(p=>{p.ifb![field]=e.target.value;})}><option value="">Choose port</option>{state.ports.filter(p=>field==='program'?['station','input','conference'].includes(p.type):['station','output'].includes(p.type)).map(p=><option key={p.id} value={p.id}>{p.label}</option>)}</select></Field>)}<Field label="Program dim"><select className="sel" value={draft.ifb.dim===null?'cut':String(draft.ifb.dim)} onChange={e=>edit(p=>{p.ifb!.dim=e.target.value==='cut'?null:Number(e.target.value);})}>{[0,-6,-12,-15,-20,-30,-60].map(n=><option key={n} value={n}>{n} dB</option>)}<option value="cut">Cut</option></select></Field></div>}
      {draft.hardware && <div className="fields"><Field label="Hardware channel"><span>{draft.hardware.nodeId} · {draft.type} {draft.hardware.channel}</span></Field><Field label="Trim (dB)"><input className="in" type="number" min={-24} max={24} step={0.5} value={draft.hardware.trim} onChange={e=>edit(p=>{p.hardware!.trim=Number(e.target.value);})}/></Field></div>}
      {draft.id && <section className="blk"><h3>Incoming <span className="dim">Set on the other port</span></h3><div className="inc">{incoming.map((x,i)=><div className="it" key={i}><span>{label(state,x.source)} · {gateText(x.gate)}</span><button type="button" className="go" onClick={()=>onSelect(x.owner)}>Open {label(state,x.owner)}</button></div>)}{!incoming.length&&<div className="nothing">Nothing calls or feeds this port yet.</div>}</div></section>}
    </fieldset>
    <div className="editor-actions"><button className="btn primary" type="submit" disabled={busy||(!dirty&&!!draft.id)}>{busy?'Saving…':draft.id?'Save changes':'Create port'}</button>{dirty&&<button className="btn" type="button" onClick={()=>{setDraft(structuredClone(port));setDirty(false);}}>Discard changes</button>}{draft.id&&!draft.hardware&&<button type="button" className="btn quiet" onClick={()=>void run(async()=>{await api.deletePort(draft.id);onSelect('');})}>Delete port</button>}</div>
  </form>;
}
export function Ports({ state, selected, onSelect, onError }: { state: ShowSnapshot; selected: string; onSelect(id:string):void; onError(s:string):void }) {
  const [filter,setFilter]=useState('all'),[search,setSearch]=useState(''),[node,setNode]=useState('');
  const p=selected==='new'?newPort():state.ports.find(p=>p.id===selected);
  const visible=state.ports.filter(p=>(filter==='all'||p.type===filter)&&(node===''||p.hardware?.nodeId===node)&&`${p.name} ${p.label} ${p.alias??''}`.toLowerCase().includes(search.toLowerCase()));
  return <><Head title="Ports" sub="Pick a port to set its keys, standing functions and incoming routes." action={<button className="btn primary" onClick={()=>onSelect('new')}>New port</button>}/><div className="toolbar"><input aria-label="Search ports" placeholder="Search" value={search} onChange={e=>setSearch(e.target.value)}/><select className="sel" style={{width:170}} aria-label="Filter by type" value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">All types</option>{Object.entries(TYPE_LABEL).map(([v,n])=><option key={v} value={v}>{n}</option>)}</select><select className="sel" style={{width:170}} aria-label="Filter by node" value={node} onChange={e=>setNode(e.target.value)}><option value="">All nodes</option>{state.nodes.map(n=><option key={n.id} value={n.id}>{n.name}</option>)}</select></div><div className="ports"><div className="ptable"><table className="pt"><thead><tr><th>Name</th><th>Label</th><th>Alias</th><th>Type</th></tr></thead><tbody>{visible.map(p=><tr key={p.id} className={p.id===selected?'on':''}><td><button onClick={()=>onSelect(p.id)}><span className={`dot ${state.live[p.id]?.connected?'':'off'}`}/> {p.name}</button></td><td>{p.label}</td><td>{p.alias||'—'}</td><td>{TYPE_LABEL[p.type]}</td></tr>)}</tbody></table>{!visible.length&&<p className="nothing">No ports yet. Create a station and a conference to start.</p>}</div>{p?<PortEditor key={selected} port={p} state={state} onSelect={onSelect} onError={onError} onSaved={p=>onSelect(p.id)}/>:<div className="nothing">Select a port.</div>}</div></>;
}
