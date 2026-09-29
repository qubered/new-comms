import { useEffect, useState } from 'react';
import type { Crosspoint } from '@comms/protocol';
import { useShowState } from '@comms/protocol/react';
import { api } from './api.ts';
import { DraftProvider, useDrafts } from './drafts.tsx';
import { Ports } from './Ports.tsx';
import { Groups, Matrix, Hardware, Live } from './Views.tsx';
type Tab = 'ports' | 'groups' | 'matrix' | 'hardware' | 'live';
export function App() { return <DraftProvider><Manager /></DraftProvider>; }
function Manager() {
  const { drafts, discard, pending } = useDrafts();
  const [focus,setFocus]=useState<Crosspoint>();
  const { state, online, levels }=useShowState(); const [tab,setTab]=useState<Tab>('ports'),[selected,setSelected]=useState(''),[error,setError]=useState(''),[health,setHealth]=useState<Awaited<ReturnType<typeof api.health>>>();
  useEffect(()=>{const check=()=>api.health().then(setHealth).catch(()=>setHealth(undefined));void check();const timer=setInterval(check,5000);return()=>clearInterval(timer);},[]);
  if(!state)return <main><p className="muted">Can’t reach the gateway. Retrying…</p></main>;
  const select=(id:string,route?:Crosspoint)=>{setSelected(id);setFocus(route);}; const open=(id:string,route?:Crosspoint)=>{setSelected(id);setFocus(route);setTab('ports');};const props={state,onOpen:open,onError:setError};
  return <div className="shell"><aside className="side"><div className="brand"><b>Manager</b><span>{state.name}</span></div><nav className="nav">{([['live','Live'],['ports','Ports'],['groups','Groups & conferences'],['matrix','Matrix'],['hardware','I/O nodes']] as const).map(([id,name])=><button key={id} className={tab===id?'on':''} onClick={()=>setTab(id)}>{name}</button>)}</nav><div className="gw"><div className="r"><span>Gateway</span><span>{online?location.hostname:'Unreachable'}</span></div><div className="r"><span>Mixer</span><span>{health?.mixer?`OK${health.mixerStats?`, ${(health.mixerStats.tickAvgUs/1000).toFixed(2)} ms`:''}`:'Down'}</span></div><div className="r"><span>Online</span><span>{Object.values(state.live).filter(s=>s.connected).length} / {state.ports.filter(p=>['station','input','output'].includes(p.type)).length}</span></div><a href="/" target="_blank" rel="noreferrer">Open Talk</a></div></aside><main>{drafts.size > 0 && <div className="offline-note" role="status"><b>Unsaved changes</b> — kept while you navigate. {[...drafts].map(([key,value]) => <span key={key}><button className="btn quiet sm" onClick={() => { if (key.startsWith('port:')) open(key.slice(5)); else setTab('hardware'); }}>{(value as {name?:string}).name || 'New port'}</button><button className="btn quiet sm" disabled={pending.has(key)} aria-label={`Discard draft ${(value as {name?:string}).name || 'New port'}`} onClick={() => discard(key)}>Discard</button></span>)}</div>}{!online&&<div className="offline-note">Connection lost. Showing the last known state.</div>}{health&&!health.mixer&&<div className="err-banner">The mixer is not running. Start it to restore audio.</div>}{error&&<div className="err-banner" role="alert">{error}<button onClick={()=>setError('')} aria-label="Dismiss error">×</button></div>}{tab==='ports'&&<Ports state={state} selected={selected} focus={focus} onSelect={select} onError={setError}/>} {tab==='groups'&&<Groups {...props}/>} {tab==='matrix'&&<Matrix {...props}/>} {tab==='hardware'&&<Hardware {...props}/>} {tab==='live'&&<Live {...props} levels={levels}/>}</main></div>;
}
