//! Port routing, independent of WebRTC. Gate resolution is deliberately one-pass for On Call.
use std::collections::HashMap;
use serde::{Deserialize, Serialize};
use crate::peer::FRAME;

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PortConfig {
    pub id: String,
    #[serde(rename = "type")]
    pub kind: String,
    #[serde(default)]
    pub station: Option<Station>,
    #[serde(default)]
    pub hardware: Option<Hardware>,
    #[serde(default)]
    pub vox: Vox,
    #[serde(default)]
    pub ifb: Option<Ifb>,
    #[serde(default)]
    pub triggers: Vec<Trigger>,
}
#[derive(Clone, Debug, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Station {
    pub master_volume: f32,
    #[serde(default)]
    pub volumes: HashMap<String, f32>,
}
#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Hardware {
    pub node_id: String,
    pub channel: usize,
    #[serde(default)]
    pub trim: f32,
}
#[derive(Clone, Debug, Deserialize)]
pub struct Ifb { pub dim: Option<f32> }
#[derive(Clone, Debug, Deserialize)]
pub struct Vox { pub threshold: f32, pub attack: f32, pub hang: f32 }
impl Default for Vox { fn default() -> Self { Self { threshold: -40.0, attack: 20.0, hang: 600.0 } } }
#[derive(Clone, Debug, Deserialize)]
pub struct Trigger {
    pub kind: String,
    pub key: Option<u8>,
    #[serde(default)]
    pub functions: Vec<serde_json::Value>,
}
impl Trigger {
    fn matches_key(&self, key: &str) -> bool {
        if key == "reply" { self.kind == "reply" }
        else { self.kind == "key" && self.key.is_some_and(|n| key.parse::<u8>() == Ok(n)) }
    }
    fn opens_mic(&self, owner: &str) -> bool {
        self.functions.iter().any(|function| match function.get("fn").and_then(|f|f.as_str()) {
            Some("callToPort" | "callToConference" | "callToGroup" | "callToIFB" | "reply") => true,
            Some("routeAudio") => function.get("from").and_then(|from|from.as_str()) == Some(owner),
            _ => false,
        })
    }
}
#[derive(Clone, Debug, Deserialize)]
#[serde(untagged)]
pub enum Gate { Always(String), Trigger { port: String, trigger: Trigger } }
#[derive(Clone, Debug, Deserialize)]
pub struct Crosspoint {
    pub source: String,
    pub destination: String,
    pub level: f32,
    pub gate: Gate,
    #[serde(default)]
    pub role: String,
}
#[derive(Clone, Debug, Default, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PortState {
    pub port_id: String,
    pub keys: HashMap<String, bool>,
    pub mic_off: bool,
    pub vox_open: bool,
    pub incoming: Vec<String>,
    pub last_caller: Option<String>,
    pub audible: Vec<String>,
    pub volumes: HashMap<String, f32>,
    pub master_volume: f32,
}
#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum Message {
    Key { key: serde_json::Value, on: bool },
    MicOff { on: bool },
    Volume { source: String, volume: f32 },
    MasterVolume { volume: f32 },
    Loopback { on: bool },
}
struct Port {
    config: PortConfig,
    state: PortState,
    attack_ms: f32,
    vox_energy: f32,
    vox_samples: usize,
    hang_ms: f32,
    loopback: bool,
    connected: bool,
    reply: Option<usize>,
}
struct Route { source: usize, edges: Vec<usize>, gain: f32 }
struct Edge { source: usize, destination: usize, gain: f32, gate: Gate, role: String, open: bool }
#[derive(Default)]
pub struct Graph {
    ports: Vec<Port>,
    indices: HashMap<String, usize>,
    edges: Vec<Edge>,
    routes: Vec<Vec<Route>>,
    calls: Vec<Vec<usize>>,
    previous_calls: Vec<Vec<usize>>,
    audible_sources: Vec<Vec<usize>>,
}
pub fn gain(db: f32) -> f32 { 10.0_f32.powf(db.clamp(-100.0,24.0) / 20.0) }
impl Graph {
    pub fn configure(&mut self, configs: Vec<PortConfig>, crosspoints: Vec<Crosspoint>) -> Result<(), String> {
        let indices: HashMap<_, _> = configs.iter().enumerate().map(|(i,p)| (p.id.clone(),i)).collect();
        if indices.len() != configs.len() { return Err("duplicate port IDs".into()); }
        let mut edges = Vec::with_capacity(crosspoints.len());
        for x in crosspoints {
            let source = *indices.get(&x.source).ok_or("unknown source")?;
            let destination = *indices.get(&x.destination).ok_or("unknown destination")?;
            if let Gate::Trigger { port, .. } = &x.gate { if !indices.contains_key(port) { return Err("unknown gate owner".into()); } }
            edges.push(Edge { source, destination, gain: gain(x.level), gate: x.gate, role: x.role, open: false });
        }
        let reply_targets: std::collections::HashSet<_> = configs.iter().filter(|p|matches!(p.kind.as_str(),"station"|"output")).map(|p|p.id.clone()).collect();
        let mut old: HashMap<_,_> = std::mem::take(&mut self.ports).into_iter().map(|p| (p.config.id.clone(),p)).collect();
        self.ports = configs.into_iter().map(|config| {
            let state = PortState { port_id: config.id.clone(), master_volume: config.station.as_ref().map_or(100.0, |s|s.master_volume), volumes: config.station.as_ref().map_or_else(HashMap::new, |s|s.volumes.clone()), ..Default::default() };
            let mut p = old.remove(&config.id).unwrap_or(Port { config: config.clone(), state, attack_ms: 0.0, vox_energy: 0.0, vox_samples: 0, hang_ms: 0.0, loopback: false, connected: false, reply: None });
            let mic_off = p.state.mic_off;
            p.state.keys.retain(|key,_| config.triggers.iter().any(|t|t.matches_key(key) && (!mic_off || !t.opens_mic(&config.id))));
            if let Some(s) = &config.station {
                if p.config.station.as_ref().map(|old| old.master_volume) != Some(s.master_volume) { p.state.master_volume = s.master_volume; }
                if p.config.station.as_ref().map(|old| &old.volumes) != Some(&s.volumes) { p.state.volumes = s.volumes.clone(); }
            }
            p.state.volumes.retain(|id,_| indices.contains_key(id));
            if p.state.last_caller.as_ref().is_some_and(|id| !reply_targets.contains(id)) { p.state.last_caller=None; }
            if p.config.kind!=config.kind || p.config.hardware.as_ref().map(|h|(&h.node_id,h.channel))!=config.hardware.as_ref().map(|h|(&h.node_id,h.channel)) {
                p.connected=false;p.state.keys.clear();p.state.vox_open=false;
            }
            p.config = config;
            p.reply = None;
            p
        }).collect();
        self.indices = indices;
        self.routes = (0..self.ports.len()).map(|_|Vec::<Route>::new()).collect();
        for (index, edge) in edges.iter().enumerate() {
            let routes=&mut self.routes[edge.destination];
            if let Some(route)=routes.iter_mut().find(|route|route.source==edge.source) {route.edges.push(index);}
            else {routes.push(Route {source:edge.source,edges:vec![index],gain:0.0});}
        }
        self.edges = edges;
        self.calls = vec![Vec::new(); self.ports.len()];
        self.previous_calls = self.calls.clone();
        self.audible_sources = self.calls.clone();
        Ok(())
    }
    pub fn config(&self, id: &str) -> Option<&PortConfig> { Some(&self.ports[*self.indices.get(id)?].config) }
    #[cfg(test)]
    pub fn state(&self, id: &str) -> Option<&PortState> { Some(&self.ports[*self.indices.get(id)?].state) }
    pub fn states(&self) -> impl Iterator<Item=&PortState> { self.ports.iter().map(|p| &p.state) }
    pub fn input_gain(&self, id: &str) -> f32 { self.config(id).and_then(|p|p.hardware.as_ref()).map_or(1.0,|h|gain(h.trim)) }
    pub fn session_ports(&self, id: &str) -> Vec<(String, bool, bool)> {
        self.ports.iter().filter(|p| p.config.id == id && p.config.kind == "station" || p.config.hardware.as_ref().is_some_and(|h| h.node_id == id))
            .map(|p| (p.config.id.clone(), matches!(p.config.kind.as_str(),"station"|"input"),matches!(p.config.kind.as_str(),"station"|"output"))).collect()
    }
    pub fn apply(&mut self, id: &str, message: Message) -> bool {
        let Some(&idx) = self.indices.get(id) else { return false };
        let p = &mut self.ports[idx];
        if p.config.kind != "station" { return false; }
        match message {
            Message::Key { key, on } => {
                let key = if key.as_str() == Some("reply") { "reply".into() } else if let Some(n) = key.as_u64().filter(|n| (1..=6).contains(n)) { n.to_string() } else { return false };
                let Some(trigger) = p.config.triggers.iter().find(|t|t.matches_key(&key)) else {return false;};
                p.state.keys.insert(key, on && (!p.state.mic_off || !trigger.opens_mic(id)));
            }
            Message::MicOff { on } => {
                p.state.mic_off = on;
                if on {
                    // Release microphone keys, including mixed-function keys, so unmuting
                    // cannot resume a call. Monitoring and remote routes keep their state.
                    p.state.keys.retain(|key,_| p.config.triggers.iter().any(|t|t.matches_key(key) && !t.opens_mic(id)));
                }
            }
            Message::Volume { source, volume } => { if !self.indices.contains_key(&source) || !volume.is_finite() { return false; } p.state.volumes.insert(source,volume.clamp(0.0,100.0)); }
            Message::MasterVolume { volume } => { if !volume.is_finite() { return false; } p.state.master_volume=volume.clamp(0.0,100.0); }
            Message::Loopback { on } => p.loopback=on,
        }
        true
    }
    /// Session presence, not packet energy: a connected silent Always feed remains active.
    pub fn connect(&mut self, id: &str) {
        for p in &mut self.ports {
            if p.config.id==id || p.config.hardware.as_ref().is_some_and(|h|h.node_id==id) {p.connected=true;}
        }
    }
    fn source_active(&self, source:usize) -> bool {
        let p=&self.ports[source];
        !p.state.mic_off && (!matches!(p.config.kind.as_str(),"station"|"input") || p.connected)
    }
    pub fn release(&mut self, id: &str) {
        for p in &mut self.ports {
            if p.config.id == id || p.config.hardware.as_ref().is_some_and(|h| h.node_id == id) {
                p.connected=false; p.state.keys.clear(); p.state.vox_open=false; p.attack_ms=0.0; p.hang_ms=0.0; p.vox_energy=0.0; p.vox_samples=0; p.loopback=false;
            }
        }
    }
    fn gate_open(&self, gate: &Gate, on_call: bool) -> bool {
        match gate {
            Gate::Always(s) => s == "always",
            Gate::Trigger { port, trigger } => {
                let Some(&idx) = self.indices.get(port) else { return false };
                let p=&self.ports[idx];
                match trigger.kind.as_str() {
                    "key" => trigger.key.is_some_and(|n| p.state.keys.get(["", "1", "2", "3", "4", "5", "6"].get(n as usize).copied().unwrap_or("")).copied().unwrap_or(false)),
                    "reply" => p.state.keys.get("reply").copied().unwrap_or(false),
                    "vox" => p.state.vox_open,
                    "onCall" => on_call && !self.calls[idx].is_empty(),
                    _ => false,
                }
            }
        }
    }
    /// Input frames already carry the hardware trim. Vox uses RMS over a 10 ms window.
    pub fn prepare(&mut self, frames: &HashMap<String,[f32;FRAME]>) {
        for p in &mut self.ports {
            p.vox_energy+=frames.get(&p.config.id).map_or(0.0,|f| f.iter().map(|s|s*s).sum::<f32>());
            p.vox_samples+=FRAME;
            if p.vox_samples<480 {continue;}
            let rms=(p.vox_energy/p.vox_samples as f32).sqrt();p.vox_energy=0.0;p.vox_samples=0;
            let above = p.connected && !p.state.mic_off && rms > gain(p.config.vox.threshold);
            if above { p.attack_ms += 10.0; if p.attack_ms >= p.config.vox.attack { p.state.vox_open=true; p.hang_ms=p.config.vox.hang; } }
            else { p.attack_ms=0.0; p.hang_ms=(p.hang_ms-10.0).max(0.0); if p.hang_ms == 0.0 || p.state.mic_off { p.state.vox_open=false; } }
        }
        std::mem::swap(&mut self.calls,&mut self.previous_calls);
        for calls in &mut self.calls { calls.clear(); }
        for i in 0..self.edges.len() {
            let e=&self.edges[i];
            let open=self.gate_open(&e.gate,false) && self.source_active(e.source);
            let (source,destination)=(e.source,e.destination);
            if open && e.role == "call" && !self.calls[destination].contains(&source) { self.calls[destination].push(source); }
            self.edges[i].open=open;
        }
        // Only the first-pass calls drive On Call. Calls opened here cannot chain.
        for i in 0..self.edges.len() {
            if matches!(&self.edges[i].gate,Gate::Trigger{trigger,..} if trigger.kind == "onCall") {
                self.edges[i].open=self.gate_open(&self.edges[i].gate,true) && self.source_active(self.edges[i].source);
            }
        }
        // Parallel functions retain their gates and roles, but each audio pair contributes once.
        for (destination,routes) in self.routes.iter_mut().enumerate() {
            let port=&self.ports[destination];
            let interrupt=port.config.kind=="ifb" && routes.iter().any(|route|route.edges.iter().any(|&i|self.edges[i].open && self.edges[i].role!="program"));
            let dim=if interrupt {port.config.ifb.as_ref().and_then(|i|i.dim).map_or(0.0,gain)} else {1.0};
            for route in routes {
                route.gain=route.edges.iter().filter_map(|&i| {
                    let edge=&self.edges[i];
                    edge.open.then_some(edge.gain * if edge.role=="program" {dim} else {1.0})
                }).fold(0.0,f32::max);
            }
        }
        // Record second-pass call indicators after all gates are resolved, so they cannot chain.
        for e in &self.edges {
            if e.open && e.role == "call" && !self.calls[e.destination].contains(&e.source) { self.calls[e.destination].push(e.source); }
        }
        for destination in 0..self.ports.len() {
            for &caller in &self.calls[destination] {
                if !self.previous_calls[destination].contains(&caller) {
                    // Inputs can call a station, but cannot receive a reply.
                    self.ports[destination].state.last_caller = if matches!(self.ports[caller].config.kind.as_str(),"station"|"output") { Some(self.ports[caller].config.id.clone()) } else { None };
                }
            }
            if !self.ports[destination].state.incoming.iter().map(String::as_str).eq(self.calls[destination].iter().map(|&i|self.ports[i].config.id.as_str())) {
                self.ports[destination].state.incoming=self.calls[destination].iter().map(|&i|self.ports[i].config.id.clone()).collect();
            }
            self.ports[destination].reply=self.ports[destination].state.last_caller.as_ref().and_then(|id|self.indices.get(id)).copied();
        }
        for sources in &mut self.audible_sources {sources.clear();}
        for e in &self.edges {
            if e.open && !self.audible_sources[e.destination].contains(&e.source) {self.audible_sources[e.destination].push(e.source);}
        }
        for (source,p) in self.ports.iter().enumerate() {
            if let Some(destination)=p.reply {
                if self.source_active(source) && p.state.keys.get("reply").copied().unwrap_or(false) && !self.audible_sources[destination].contains(&source) {self.audible_sources[destination].push(source);}
            }
        }
        for destination in 0..self.ports.len() {
            if !self.ports[destination].state.audible.iter().map(String::as_str).eq(self.audible_sources[destination].iter().map(|&i|self.ports[i].config.id.as_str())) {
                self.ports[destination].state.audible=self.audible_sources[destination].iter().map(|&i|self.ports[i].config.id.clone()).collect();
            }
        }
    }
    fn add_source(&self,source:usize,listener:usize,frames:&HashMap<String,[f32;FRAME]>,out:&mut [f32;FRAME],scale:f32,depth:u8) {
        if depth>2 || scale==0.0 {return;}
        let p=&self.ports[source];
        if !self.source_active(source) {return;}
        match p.config.kind.as_str() {
            "conference" | "ifb" => {
                for route in &self.routes[source] {
                    if p.config.kind=="conference" && route.source==listener {continue;}
                    self.add_source(route.source,listener,frames,out,scale*route.gain,depth+1);
                }
            }
            _ => if let Some(frame)=frames.get(&p.config.id) {for (sum,sample) in out.iter_mut().zip(frame) {*sum+=sample*scale;}},
        }
    }
    fn reply_gain(&self, source:usize, listener:usize) -> f32 {
        let port=&self.ports[source];
        if port.reply!=Some(listener) || !self.source_active(source) || !port.state.keys.get("reply").copied().unwrap_or(false) {return 0.0;}
        let level=port.config.triggers.iter().find(|t|t.kind=="reply").and_then(|t|t.functions.first()).and_then(|f|f.get("level")).and_then(|v|v.as_f64()).unwrap_or(0.0) as f32;
        gain(level)
    }
    pub fn mix_for(&self, id: &str, frames: &HashMap<String,[f32;FRAME]>, out: &mut [f32;FRAME]) {
        out.fill(0.0);
        let Some(&listener)=self.indices.get(id) else { return };
        let p=&self.ports[listener];
        for route in &self.routes[listener] {
            let volume=p.state.volumes.get(&self.ports[route.source].config.id).copied().unwrap_or(100.0)/100.0;
            let effective=route.gain.max(self.reply_gain(route.source,listener));
            self.add_source(route.source,listener,frames,out,effective*volume,0);
        }
        for (source,port) in self.ports.iter().enumerate() {
            if self.routes[listener].iter().any(|route|route.source==source) {continue;}
            let volume=p.state.volumes.get(&port.config.id).copied().unwrap_or(100.0)/100.0;
            self.add_source(source,listener,frames,out,self.reply_gain(source,listener)*volume,0);
        }
        if p.loopback { if let Some(frame)=frames.get(id) { for (sum,sample) in out.iter_mut().zip(frame) { *sum+=sample; } } }
        let master=p.state.master_volume/100.0*p.config.hardware.as_ref().map_or(1.0,|h|gain(h.trim));
        for sample in out { let x=*sample*master; *sample=if x.abs()<=0.7 {x} else {x.signum()*(0.7+0.3*((x.abs()-0.7)/0.3).tanh())}; }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    fn config(id: &str, kind: &str) -> serde_json::Value {
        json!({"id":id,"type":kind,"station":{"masterVolume":100,"volumes":{}},"triggers":[{"kind":"key","key":1},{"kind":"reply","functions":[{"fn":"reply"}]}]})
    }
    fn edge(s: &str,d: &str,gate: serde_json::Value,role: &str) -> serde_json::Value { json!({"source":s,"destination":d,"level":0,"gate":gate,"role":role}) }
    fn key(p: &str) -> serde_json::Value { json!({"port":p,"trigger":{"kind":"key","key":1}}) }
    fn setup(ports: Vec<serde_json::Value>,edges: Vec<serde_json::Value>) -> Graph {
        let mut g=Graph::default();g.configure(serde_json::from_value(json!(ports)).unwrap(),serde_json::from_value(json!(edges)).unwrap()).unwrap();for p in &mut g.ports {p.connected=true;}g
    }
    fn frames(values: &[(&str,f32)]) -> HashMap<String,[f32;FRAME]> { values.iter().map(|(id,n)|(id.to_string(),[*n;FRAME])).collect() }
    fn heard(g: &Graph,id: &str,f: &HashMap<String,[f32;FRAME]>) -> f32 { let mut out=[0.0;FRAME];g.mix_for(id,f,&mut out);out[0] }
    fn press(g: &mut Graph,id: &str,on: bool) { assert!(g.apply(id,Message::Key{key:json!(1),on})); }
    #[test]
    fn conference_n_minus_one_and_always_input() {
        let mut g=setup(vec![config("a","station"),config("b","station"),config("mic","input"),config("show","conference")],vec![edge("a","show",key("a"),"audio"),edge("b","show",key("b"),"audio"),edge("mic","show",json!("always"),"audio"),edge("show","a",json!("always"),"audio"),edge("show","b",json!("always"),"audio")]);
        let f=frames(&[("a",0.1),("b",0.2),("mic",0.05)]);
        press(&mut g,"a",true);press(&mut g,"b",true);g.prepare(&f);
        assert!((heard(&g,"a",&f)-0.25).abs()<1e-6);
        assert!((heard(&g,"b",&f)-0.15).abs()<1e-6);
        g.apply("a",Message::MicOff{on:true});g.prepare(&f);
        assert!((heard(&g,"b",&f)-0.05).abs()<1e-6);
    }
    #[test]
    fn vox_attack_hang_call_name_and_no_reply_to_input() {
        let mut g=setup(vec![config("mic","input"),config("b","station")],vec![edge("mic","b",json!({"port":"mic","trigger":{"kind":"vox"}}),"call")]);
        let f=frames(&[("mic",0.1)]);g.prepare(&f);g.prepare(&f);assert_eq!(heard(&g,"b",&f),0.0);
        g.prepare(&f);g.prepare(&f);assert_eq!(heard(&g,"b",&f),0.1);
        assert_eq!(g.state("b").unwrap().incoming,vec!["mic"]);assert_eq!(g.state("b").unwrap().last_caller,None);
        for _ in 0..119 {g.prepare(&HashMap::new());}
        assert!(g.state("mic").unwrap().vox_open);
        g.prepare(&HashMap::new());assert!(!g.state("mic").unwrap().vox_open);
    }
    #[test]
    fn third_party_key_listen_and_one_pass_on_call() {
        let mut g=setup(vec![config("a","station"),config("b","station"),config("c","station"),config("mic","input")],vec![edge("mic","b",key("a"),"audio"),edge("a","b",key("a"),"call"),edge("mic","c",json!({"port":"b","trigger":{"kind":"onCall"}}),"call"),edge("mic","a",json!({"port":"c","trigger":{"kind":"onCall"}}),"audio")]);
        let f=frames(&[("mic",0.2)]);g.prepare(&f);assert_eq!(heard(&g,"b",&f),0.0);
        press(&mut g,"a",true);g.prepare(&f);assert_eq!(heard(&g,"b",&f),0.2);assert_eq!(heard(&g,"c",&f),0.2);assert_eq!(heard(&g,"a",&f),0.0);
        assert_eq!(g.state("c").unwrap().incoming,vec!["mic"]);
        g.prepare(&f);assert_eq!(heard(&g,"a",&f),0.0);
    }
    #[test]
    fn ifb_dims_program_only_during_interrupt() {
        let mut ifb=config("ifb","ifb");ifb["ifb"]=json!({"program":"pgm","destination":"b","dim":-20});
        let mut g=setup(vec![config("a","station"),config("b","station"),config("pgm","input"),ifb],vec![edge("pgm","ifb",json!("always"),"program"),edge("a","ifb",key("a"),"interrupt"),edge("ifb","b",json!("always"),"audio")]);
        let f=frames(&[("pgm",0.2),("a",0.1)]);g.prepare(&f);assert_eq!(heard(&g,"b",&f),0.2);
        press(&mut g,"a",true);g.prepare(&f);assert!((heard(&g,"b",&f)-0.12).abs()<1e-6);
        press(&mut g,"a",false);g.prepare(&f);assert_eq!(heard(&g,"b",&f),0.2);
    }
    #[test]
    fn group_expansion_reply_volume_and_disconnect() {
        let mut g=setup(vec![config("a","station"),config("b","station"),config("c","station")],vec![edge("a","b",key("a"),"call"),edge("a","c",key("a"),"call")]);
        let f=frames(&[("a",0.2),("b",0.1)]);press(&mut g,"a",true);g.prepare(&f);
        assert_eq!(heard(&g,"b",&f),0.2);assert_eq!(heard(&g,"c",&f),0.2);assert_eq!(g.state("b").unwrap().last_caller.as_deref(),Some("a"));
        assert!(g.apply("b",Message::Key{key:json!("reply"),on:true}));g.prepare(&f);assert_eq!(heard(&g,"a",&f),0.1);assert_eq!(g.state("a").unwrap().audible,vec!["b"]);
        g.apply("c",Message::Volume{source:"a".into(),volume:50.0});assert_eq!(heard(&g,"c",&f),0.1);
        g.release("a");g.prepare(&f);assert_eq!(heard(&g,"b",&f),0.0);
    }
    #[test]
    fn config_preserves_live_volumes_but_applies_manager_edits_and_drops_deleted_reply() {
        let ports=vec![config("a","station"),config("b","station")];
        let edges=vec![edge("a","b",key("a"),"call")];
        let mut g=setup(ports.clone(),edges.clone());
        press(&mut g,"a",true);g.prepare(&frames(&[("a",0.2)]));
        g.apply("b",Message::MasterVolume{volume:42.0});
        g.apply("b",Message::Volume{source:"a".into(),volume:23.0});
        g.configure(serde_json::from_value(json!(ports)).unwrap(),serde_json::from_value(json!(edges)).unwrap()).unwrap();
        assert_eq!(g.state("b").unwrap().master_volume,42.0);
        assert_eq!(g.state("b").unwrap().volumes["a"],23.0);
        let mut b=config("b","station");b["station"]["masterVolume"]=json!(75);
        g.configure(serde_json::from_value(json!([b])).unwrap(),vec![]).unwrap();
        assert_eq!(g.state("b").unwrap().master_volume,75.0);
        assert!(g.state("b").unwrap().last_caller.is_none());
        assert!(g.state("b").unwrap().volumes.is_empty());
        g.prepare(&HashMap::new());assert!(g.state("b").unwrap().incoming.is_empty());
    }
    #[test]
    fn duplicate_routes_have_one_audible_source_and_release_resets_vox_window() {
        let mut g=setup(vec![config("a","station"),config("b","station")],vec![edge("a","b",key("a"),"call"),edge("a","b",json!("always"),"audio")]);
        let f=frames(&[("a",0.2)]);press(&mut g,"a",true);g.prepare(&f);
        assert_eq!(g.state("b").unwrap().audible,vec!["a"]);
        g.release("a");g.prepare(&HashMap::new());g.prepare(&HashMap::new());
        assert!(!g.state("a").unwrap().vox_open);
        assert!(g.state("b").unwrap().incoming.is_empty());
    }

    #[test]
    fn mic_off_preserves_and_accepts_monitor_and_third_party_route_keys() {
        let mut a=config("a","station");
        a["triggers"]=json!([
            {"kind":"key","key":1,"functions":[{"fn":"listenToPort","from":"mic"}]},
            {"kind":"key","key":2,"functions":[{"fn":"routeAudio","from":"mic","to":"b"}]}
        ]);
        let mut g=setup(vec![a,config("b","station"),config("mic","input")],vec![
            edge("mic","a",key("a"),"audio"),
            edge("mic","b",json!({"port":"a","trigger":{"kind":"key","key":2}}),"audio")
        ]);
        let f=frames(&[("a",0.1),("mic",0.2)]);
        press(&mut g,"a",true);
        g.apply("a",Message::Key{key:json!(2),on:true});
        g.apply("a",Message::MicOff{on:true});g.prepare(&f);
        assert_eq!(heard(&g,"a",&f),0.2,"muting the microphone must preserve a listen key");
        assert_eq!(heard(&g,"b",&f),0.2,"muting the owner must preserve another source's route");
        for key in [1,2] {g.apply("a",Message::Key{key:json!(key),on:false});}
        g.prepare(&f);assert_eq!(heard(&g,"a",&f),0.0);assert_eq!(heard(&g,"b",&f),0.0);
        for key in [1,2] {g.apply("a",Message::Key{key:json!(key),on:true});}
        g.prepare(&f);assert_eq!(heard(&g,"a",&f),0.2);assert_eq!(heard(&g,"b",&f),0.2);
        // Editing a held monitor key into a talk key while muted must not arm the mic.
        let mut changed=config("a","station");
        changed["triggers"]=json!([{"kind":"key","key":1,"functions":[{"fn":"callToPort","to":"b"}]}]);
        g.configure(serde_json::from_value(json!([changed,config("b","station")])).unwrap(),serde_json::from_value(json!([edge("a","b",key("a"),"call")])).unwrap()).unwrap();
        g.apply("a",Message::MicOff{on:false});g.prepare(&f);
        assert_eq!(heard(&g,"b",&f),0.0);
    }
    #[test]
    fn mic_off_releases_call_reply_and_mixed_keys_without_reopening_on_unmute() {
        let mut a=config("a","station");
        a["triggers"]=json!([
            {"kind":"key","key":1,"functions":[{"fn":"callToPort","to":"b"}]},
            {"kind":"key","key":2,"functions":[{"fn":"listenToPort","from":"mic"},{"fn":"routeAudio","from":"a","to":"b"}]},
            {"kind":"reply","functions":[{"fn":"reply"}]}
        ]);
        let mut g=setup(vec![a,config("b","station"),config("mic","input")],vec![
            edge("a","b",key("a"),"call"),edge("b","a",json!("always"),"call"),
            edge("a","b",json!({"port":"a","trigger":{"kind":"key","key":2}}),"audio"),
            edge("mic","a",json!({"port":"a","trigger":{"kind":"key","key":2}}),"audio")
        ]);
        let f=frames(&[("a",0.1),("mic",0.2)]);g.prepare(&f);
        for key in [json!(1),json!(2),json!("reply")] {g.apply("a",Message::Key{key,on:true});}
        g.prepare(&f);assert!((heard(&g,"b",&f)-0.1).abs()<1e-6);
        g.apply("a",Message::MicOff{on:true});g.prepare(&f);
        assert_eq!(heard(&g,"b",&f),0.0);assert!(g.state("a").unwrap().keys.values().all(|on|!*on));
        for key in [json!(1),json!(2),json!("reply")] {g.apply("a",Message::Key{key,on:true});}
        g.prepare(&f);assert_eq!(heard(&g,"b",&f),0.0);
        g.apply("a",Message::MicOff{on:false});g.prepare(&f);
        assert_eq!(heard(&g,"b",&f),0.0,"muted presses must not arm a call for unmute");
        press(&mut g,"a",true);g.prepare(&f);assert_eq!(heard(&g,"b",&f),0.1);
    }

    #[test]
    fn parallel_routes_take_highest_open_gain_instead_of_summing() {
        let mut quiet=edge("a","b",json!("always"),"audio");quiet["level"]=json!(-6.0);
        let mut g=setup(vec![config("a","station"),config("b","station")],vec![quiet,edge("a","b",key("a"),"call"),edge("b","a",json!("always"),"call")]);
        let f=frames(&[("a",0.2)]);g.prepare(&f);
        assert!((heard(&g,"b",&f)-0.2*gain(-6.0)).abs()<1e-6);
        press(&mut g,"a",true);g.prepare(&f);assert_eq!(heard(&g,"b",&f),0.2);
        g.apply("a",Message::Key{key:json!("reply"),on:true});g.prepare(&f);assert_eq!(heard(&g,"b",&f),0.2,"Reply overlaps the existing pair");
        press(&mut g,"a",false);g.prepare(&f);assert_eq!(heard(&g,"b",&f),0.2);
        g.apply("a",Message::Key{key:json!("reply"),on:false});g.prepare(&f);
        assert!((heard(&g,"b",&f)-0.2*gain(-6.0)).abs()<1e-6);
    }
    #[test]
    fn duplicate_bus_contributions_and_ifb_monitor_do_not_amplify() {
        let mut ifb=config("ifb","ifb");ifb["ifb"]=json!({"dim":-20.0});
        let mut g=setup(vec![config("a","station"),config("b","station"),config("mic","input"),config("show","conference"),ifb],vec![
            edge("mic","show",json!("always"),"audio"),edge("mic","show",key("a"),"audio"),
            edge("show","ifb",json!("always"),"program"),edge("show","ifb",json!("always"),"program"),
            edge("a","ifb",key("a"),"interrupt"),edge("a","ifb",key("a"),"interrupt"),
            edge("ifb","b",json!("always"),"audio"),edge("ifb","b",key("a"),"audio")
        ]);
        let f=frames(&[("a",0.1),("mic",0.2)]);g.prepare(&f);assert_eq!(heard(&g,"b",&f),0.2);
        press(&mut g,"a",true);g.prepare(&f);assert!((heard(&g,"b",&f)-0.12).abs()<1e-6);
        assert_eq!(g.edges.len(),8,"individual function metadata is retained");
    }

    #[test]
    fn offline_always_call_releases_incoming_on_call_and_ifb_dim_but_silence_does_not() {
        let mut input=config("mic","input");input["hardware"]=json!({"nodeId":"rack","channel":1});
        let mut ifb=config("ifb","ifb");ifb["ifb"]=json!({"dim":-20.0});
        let ports=vec![input,config("pgm","input"),config("b","station"),config("c","station"),ifb];
        let edges=vec![edge("mic","b",json!("always"),"call"),edge("mic","ifb",json!("always"),"interrupt"),edge("pgm","ifb",json!("always"),"program"),edge("ifb","c",json!("always"),"audio"),edge("pgm","b",json!({"port":"b","trigger":{"kind":"onCall"}}),"audio")];
        let mut g=Graph::default();g.configure(serde_json::from_value(json!(ports.clone())).unwrap(),serde_json::from_value(json!(edges.clone())).unwrap()).unwrap();
        g.connect("pgm");g.connect("b");g.connect("c");
        // Even stale buffered samples cannot make an offline hardware source available.
        let f=frames(&[("mic",0.1),("pgm",0.2)]);g.prepare(&f);
        assert!(g.state("b").unwrap().incoming.is_empty());assert_eq!(heard(&g,"b",&f),0.0);assert_eq!(heard(&g,"c",&f),0.2);
        g.connect("rack");let silent=frames(&[("pgm",0.2)]);g.prepare(&silent);
        assert_eq!(g.state("b").unwrap().incoming,vec!["mic"]);assert_eq!(heard(&g,"b",&silent),0.2);assert!((heard(&g,"c",&silent)-0.02).abs()<1e-6);
        g.configure(serde_json::from_value(json!(ports)).unwrap(),serde_json::from_value(json!(edges)).unwrap()).unwrap();g.prepare(&silent);
        assert_eq!(g.state("b").unwrap().incoming,vec!["mic"],"routing edits preserve established session presence");
        g.release("rack");g.prepare(&f);
        assert!(g.state("b").unwrap().incoming.is_empty());assert_eq!(heard(&g,"b",&f),0.0);assert_eq!(heard(&g,"c",&f),0.2);
        g.connect("rack");g.prepare(&silent);assert_eq!(g.state("b").unwrap().incoming,vec!["mic"]);
    }

    #[test]
    fn parallel_program_and_interrupt_take_maximum_after_dim() {
        let mut ifb=config("ifb","ifb");ifb["ifb"]=json!({"dim":-20.0});
        let mut interrupt=edge("mic","ifb",key("a"),"interrupt");interrupt["level"]=json!(-6.0);
        let mut g=setup(vec![config("a","station"),config("b","station"),config("mic","input"),ifb],vec![edge("mic","ifb",json!("always"),"program"),interrupt,edge("ifb","b",json!("always"),"audio")]);
        let f=frames(&[("mic",0.2)]);g.prepare(&f);assert_eq!(heard(&g,"b",&f),0.2);
        press(&mut g,"a",true);g.prepare(&f);
        assert!((heard(&g,"b",&f)-0.2*gain(-6.0)).abs()<1e-6,"program dim applies before choosing the strongest parallel route");
    }

}
