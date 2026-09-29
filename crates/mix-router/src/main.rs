//! mix-router: terminates WebRTC/Opus for every pack, mixes N-1 per listener every 10 ms,
//! and applies key / volume / mic messages from each peer's data channel. The gateway
//! drives it over stdin/stdout (line-delimited JSON); audio never crosses that pipe.

mod control;
mod graph;
mod mixer;
mod peer;

use std::collections::HashMap;
use std::io::{self, BufRead, BufReader, ErrorKind};
use std::net::{IpAddr, SocketAddr, TcpListener, TcpStream, UdpSocket};
use std::sync::Arc;
use std::sync::mpsc::{self, RecvTimeoutError, SyncSender};
use std::thread;
use std::time::{Duration, Instant};

use control::{Command, Event, SyncSession, emit, set_sink};
use mixer::Mixer;
use peer::{FRAME, Peer, PeerEvent};
use socket2::{Domain, Protocol, Socket, Type};

const TICK: Duration = Duration::from_millis(5);
const MAX_PEERS: usize = 64;
const LEVEL_EVERY: u32 = 20; // ticks: 100 ms
const STATS_EVERY: u32 = 400; // ticks: 2 s

enum Input {
    Command(u64, Command),
    Datagram {
        local: SocketAddr,
        source: SocketAddr,
        contents: [u8; 2048],
        len: usize,
    },
    /// A gateway connected; it becomes the only control connection.
    ControlOpened(u64, TcpStream),
    ControlClosed(u64),
}

struct Sockets {
    by_ip: HashMap<IpAddr, Arc<UdpSocket>>,
    by_local: HashMap<SocketAddr, Arc<UdpSocket>>,
    inputs: SyncSender<Input>,
}

impl Sockets {
    fn for_ip(&mut self, ip: IpAddr) -> io::Result<SocketAddr> {
        if let Some(socket) = self.by_ip.get(&ip) {
            return socket.local_addr();
        }
        let socket = Arc::new(bind_media_socket(ip)?);
        let local = socket.local_addr()?;
        let reader = Arc::clone(&socket);
        let inputs = self.inputs.clone();
        thread::Builder::new()
            .name(format!("udp-{local}"))
            .spawn(move || receive_datagrams(&reader, local, &inputs))?;
        self.by_ip.insert(ip, Arc::clone(&socket));
        self.by_local.insert(local, socket);
        Ok(local)
    }

    fn send(&self, source: SocketAddr, destination: SocketAddr, contents: &[u8]) {
        if let Some(socket) = self.by_local.get(&source) {
            let _ = socket.send_to(contents, destination);
        }
    }
}

/// DSCP EF: Wi-Fi access points put it in the voice queue.
const DSCP_EF_TOS: u32 = 46 << 2;

fn bind_media_socket(ip: IpAddr) -> io::Result<UdpSocket> {
    // MIX_ROUTER_PORT pins the media port so a venue firewall can allow it; 0 picks a free one.
    let port = std::env::var("MIX_ROUTER_PORT").ok().and_then(|p| p.parse().ok()).unwrap_or(0);
    let address = SocketAddr::new(ip, port);
    let socket = Socket::new(Domain::for_address(address), Type::DGRAM, Some(Protocol::UDP))?;
    if ip.is_ipv4() {
        let _ = socket.set_tos_v4(DSCP_EF_TOS);
    }
    #[cfg(any(target_os = "linux", target_os = "macos"))]
    if ip.is_ipv6() {let _ = socket.set_tclass_v6(DSCP_EF_TOS);}
    socket.bind(&address.into())?;
    Ok(socket.into())
}

fn receive_datagrams(socket: &UdpSocket, local: SocketAddr, inputs: &SyncSender<Input>) {
    let mut buffer = [0_u8; 2_048];
    loop {
        match socket.recv_from(&mut buffer) {
            Ok((count, source)) => {
                let input = Input::Datagram {
                    local,
                    source,
                    contents: buffer,
                    len: count,
                };
                if inputs.send(input).is_err() {
                    return;
                }
            }
            Err(error)
                if matches!(
                    error.kind(),
                    ErrorKind::Interrupted | ErrorKind::ConnectionReset | ErrorKind::WouldBlock
                ) => {}
            Err(_) => return,
        }
    }
}

struct Router {
    crypto: Arc<str0m::crypto::CryptoProvider>,
    sockets: Sockets,
    mixer: Mixer,
    graph: Option<graph::Graph>,
    graph_states: HashMap<String,graph::PortState>,
    /// session id -> peer
    peers: HashMap<String, Peer>,
    /// pack id -> live session id (a pack has one session; a newer one replaces it)
    by_pack: HashMap<String, String>,
    control_generation: u64,
    tick_count: u32,
    tick_sum_us: u64,
    tick_max_us: u32,
    frames: HashMap<String, [f32; FRAME]>,
    peaks: HashMap<String, f32>,
    last_levels_nonzero: bool,
}

impl Router {
    fn handle_command(&mut self, command: Command, now: Instant) {
        match command {
            Command::Hello => {}
            Command::Stats => emit(&Event::Stats { tick_avg_us:0,tick_max_us:self.tick_max_us,peers:self.peers.len(),queues:serde_json::Value::Array(self.peers.values().map(Peer::queue_stats).collect()) }),
            Command::ConfigPorts { ports, crosspoints } => {
                let graph=self.graph.get_or_insert_with(graph::Graph::default);
                if let Err(error)=graph.configure(ports,crosspoints) {eprintln!("mix-router: invalid graph: {error}");return;}
                // A changed in-use set needs a new offer, while routing edits keep sessions alive.
                for peer in self.peers.values_mut() {
                    if peer.ports()!=graph.session_ports(&peer.pack_id) {peer.close("renegotiate");}
                }
                self.graph_states.retain(|id,_| graph.config(id).is_some());
                self.frames.retain(|id,_|graph.config(id).is_some());
                self.peaks.retain(|id,_|graph.config(id).is_some());
                let ids: Vec<_> = self.by_pack.keys().cloned().collect();
                for id in ids {self.push_device(&id);}
                self.push_graph_states(true);
            }
            Command::Config { channels, packs } => {
                self.mixer.configure(channels, packs);
                // Push fresh state so every phone sees the volumes the Manager set.
                let ids: Vec<String> = self.by_pack.keys().cloned().collect();
                for id in ids {
                    self.push_state(&id);
                    self.push_device(&id);
                }
            }
            Command::Open {
                session_id,
                pack_id,
                offer,
                candidate_ip,
            } => {
                if self.graph.as_ref().map_or_else(||self.mixer.pack(&pack_id).is_none(),|g|g.session_ports(&pack_id).is_empty()) {
                    return emit(&Event::Rejected {
                        session_id: &session_id,
                        detail: "unknown pack",
                    });
                }
                if self.peers.contains_key(&session_id) {
                    return emit(&Event::Rejected { session_id: &session_id, detail: "session ID already exists" });
                }
                if self.peers.len() >= MAX_PEERS && !self.by_pack.contains_key(&pack_id) {
                    return emit(&Event::Rejected {
                        session_id: &session_id,
                        detail: "capacity reached",
                    });
                }
                let local = match self.sockets.for_ip(candidate_ip) {
                    Ok(local) => local,
                    Err(_) => {
                        return emit(&Event::Rejected {
                            session_id: &session_id,
                            detail: "media socket could not be bound",
                        });
                    }
                };
                let opened=if let Some(g)=&self.graph {
                    Peer::open_ports(Arc::clone(&self.crypto),pack_id.clone(),local,&offer,now,&g.session_ports(&pack_id))
                } else {Peer::open(Arc::clone(&self.crypto),pack_id.clone(),local,&offer,now)};
                match opened {
                    Ok((peer, answer)) => {
                        // A pack has one live session: the newest wins.
                        if let Some(old) = self.by_pack.insert(pack_id.clone(), session_id.clone()) {
                            if let Some(graph)=&mut self.graph {graph.release(&pack_id);}
                            if let Some(old_peer) = self.peers.get_mut(&old) {
                                old_peer.close("replaced");
                            }
                        }
                        self.peers.insert(session_id.clone(), peer);
                        emit(&Event::Answer {
                            session_id: &session_id,
                            sdp: &answer,
                        });
                    }
                    Err(detail) => emit(&Event::Rejected {
                        session_id: &session_id,
                        detail: &detail,
                    }),
                }
            }
            Command::Close { session_id } => {
                if let Some(peer) = self.peers.get_mut(&session_id) {
                    peer.close("requested");
                }
            }
        }
    }

    /// Tell a hardware node which interface input/output the Manager chose.
    fn push_device(&mut self, pack_id: &str) {
        if let Some(g)=&self.graph {
            let ports: Vec<_>=g.session_ports(pack_id).iter().filter_map(|(id,_,_)|g.config(id)).filter_map(|p|p.hardware.as_ref().map(|h|serde_json::json!({"portId":p.id,"direction":p.kind,"channel":h.channel,"trim":h.trim}))).collect();
            if !ports.is_empty() {if let Some(peer)=self.by_pack.get(pack_id).and_then(|s|self.peers.get_mut(s)) {peer.send_json(serde_json::json!({"type":"device","ports":ports}).to_string());}}
            return;
        }
        let Some(pack) = self.mixer.pack(pack_id) else { return };
        if pack.config.kind != control::PackType::Hardware {
            return;
        }
        let device = pack.config.device.clone().unwrap_or_default();
        let Some(session) = self.by_pack.get(pack_id) else { return };
        if let Some(peer) = self.peers.get_mut(session) {
            let text = serde_json::json!({ "type": "device", "input": device.input, "output": device.output });
            peer.send_json(text.to_string());
        }
    }

    /// Bring a (re)connected gateway up to date: live sessions, then every pack's state.
    fn sync(&mut self) {
        let sessions: Vec<(String, String)> = self
            .by_pack
            .iter()
            .filter(|(_, session)| self.peers.get(*session).is_some_and(|peer| peer.connected))
            .map(|(pack, session)| (session.clone(), pack.clone()))
            .collect();
        let view: Vec<SyncSession<'_>> = sessions
            .iter()
            .map(|(session_id, pack_id)| SyncSession { session_id, pack_id })
            .collect();
        emit(&Event::Sync { sessions: &view });
        self.push_graph_states(true);
        for (_, pack) in &sessions {
            if let Some(state) = self.mixer.pack(pack).map(|p| p.state()) {
                emit(&Event::PackState(&state));
            }
        }
    }

    fn push_graph_states(&mut self, force: bool) {
        let Some(graph)=&self.graph else {return};
        for state in graph.states() {
            if force || self.graph_states.get(&state.port_id)!=Some(state) {
                emit(&Event::PortState(state));
                if let Some(peer)=self.by_pack.get(&state.port_id).and_then(|s|self.peers.get_mut(s)) {
                    let mut value=serde_json::to_value(state).unwrap();value["type"]=serde_json::json!("state");peer.send_json(value.to_string());
                }
                self.graph_states.insert(state.port_id.clone(),state.clone());
            }
        }
    }

    fn push_state(&mut self, pack_id: &str) {
        if self.graph.is_some() {self.push_graph_states(true);return;}
        let Some(state) = self.mixer.pack(pack_id).map(|pack| pack.state()) else {
            return;
        };
        emit(&Event::PackState(&state));
        if let Some(session) = self.by_pack.get(pack_id) {
            if let Some(peer) = self.peers.get_mut(session) {
                if let Ok(text) = serde_json::to_string(&serde_json::json!({
                    "type": "state",
                    "keyed": state.keyed,
                    "micOff": state.mic_off,
                    "volumes": state.volumes,
                    "masterVolume": state.master_volume,
                })) {
                    peer.send_json(text);
                }
            }
        }
    }

    fn handle_datagram(&mut self, local: SocketAddr, source: SocketAddr, contents: &[u8], now: Instant) {
        for peer in self.peers.values_mut() {
            if peer.receive(now, source, local, contents) {
                return;
            }
        }
    }

    /// Runs every peer's timers, drains output, and applies what came back.
    fn drive(&mut self, now: Instant) {
        let mut applied: Vec<(String, String, PeerEvent)> = Vec::new();
        for (session, peer) in &mut self.peers {
            peer.handle_timeout(now);
            let sockets = &self.sockets;
            let mut events = Vec::new();
            peer.poll(
                &mut |packet| sockets.send(packet.source, packet.destination, packet.contents),
                &mut events,
            );
            for event in events {
                applied.push((session.clone(), peer.pack_id.clone(), event));
            }
        }
        for (session, pack, event) in applied {
            match event {
                PeerEvent::Connected => {
                    emit(&Event::Connected {
                        session_id: &session,
                        pack_id: &pack,
                    });
                    self.push_state(&pack);
                    self.push_device(&pack);
                }
                PeerEvent::PortMessage(message) => {
                    if self.by_pack.get(&pack)==Some(&session) {if let Some(graph)=&mut self.graph {graph.apply(&pack,message);self.push_graph_states(false);}}
                }
                PeerEvent::Message(message) => {
                    if let Some(graph)=&mut self.graph {
                        let message=match message {
                            control::PeerMessage::MicOff{on}=>Some(graph::Message::MicOff{on}),
                            control::PeerMessage::MasterVolume{volume}=>Some(graph::Message::MasterVolume{volume}),
                            control::PeerMessage::Loopback{on}=>Some(graph::Message::Loopback{on}),
                            _=>None,
                        };
                        if self.by_pack.get(&pack)==Some(&session) {if let Some(message)=message {graph.apply(&pack,message);self.push_graph_states(false);}}
                        continue;
                    }
                    // Only the pack's live session may drive it.
                    if self.by_pack.get(&pack) == Some(&session) {
                        if self.mixer.apply(&pack, message).is_some() {
                            self.push_state(&pack);
                        }
                    }
                }
                PeerEvent::Closed(reason) => {
                    self.peers.remove(&session);
                    emit(&Event::Closed {
                        session_id: &session,
                        pack_id: &pack,
                        reason,
                    });
                    if self.by_pack.get(&pack) == Some(&session) {
                        self.by_pack.remove(&pack);
                        if let Some(graph)=&mut self.graph {graph.release(&pack);self.push_graph_states(false);}
                        if let Some(state) = self.mixer.release(&pack) {
                            emit(&Event::PackState(&state));
                        }
                    }
                }
            }
        }
    }

    /// One 10 ms mixing cycle.
    fn tick(&mut self, now: Instant) {
        let started = Instant::now();
        // Keep the per-port buffers allocated. Missing/disconnected inputs contribute silence.
        for frame in self.frames.values_mut() {frame.fill(0.0);}
        for peer in self.peers.values_mut() {
            if !peer.connected {
                continue;
            }
            if let Some(graph)=&self.graph {
                peer.take_port_frames(|id,mut frame| {
                    let trim=graph.input_gain(id);for sample in &mut frame {*sample*=trim;}
                    let peak=frame.iter().fold(0.0_f32,|m,s|m.max(s.abs()));
                    if let Some(slot)=self.peaks.get_mut(id) {*slot=slot.max(peak);} else {self.peaks.insert(id.to_owned(),peak);}
                    if let Some(slot)=self.frames.get_mut(id) {*slot=frame;} else {self.frames.insert(id.to_owned(),frame);}
                });
                continue;
            }
            let mut frame = [0.0_f32; FRAME];
            if peer.take_frame(&mut frame) {
                let trim = self.mixer.input_gain(&peer.pack_id);
                if trim != 1.0 {
                    for sample in frame.iter_mut() {
                        *sample *= trim;
                    }
                }
                let peak = frame.iter().fold(0.0_f32, |m, s| m.max(s.abs()));
                if self.mixer.is_talking(&peer.pack_id) || self.mixer.is_hardware(&peer.pack_id) {
                    let slot = self.peaks.entry(peer.pack_id.clone()).or_insert(0.0);
                    *slot = slot.max(peak);
                }
                self.frames.insert(peer.pack_id.clone(), frame);
            }
        }
        if let Some(graph)=&mut self.graph {graph.prepare(&self.frames);}
        self.push_graph_states(false);
        let mut out = [0.0_f32; FRAME];
        for peer in self.peers.values_mut() {
            if !peer.connected {
                continue;
            }
            if let Some(graph)=&self.graph {
                peer.send_port_frames(now,|id,out|graph.mix_for(id,&self.frames,out));
                continue;
            }
            self.mixer.mix_for(&peer.pack_id, &self.frames, &mut out);
            peer.send_frame(&out, now);
        }
        self.tick_count += 1;
        let spent = started.elapsed().as_micros().min(u32::MAX as u128) as u32;
        self.tick_sum_us += u64::from(spent);
        self.tick_max_us = self.tick_max_us.max(spent);
        if self.tick_count.is_multiple_of(STATS_EVERY) {
            emit(&Event::Stats {
                tick_avg_us: (self.tick_sum_us / u64::from(STATS_EVERY)) as u32,
                tick_max_us: self.tick_max_us,
                peers: self.peers.values().filter(|peer| peer.connected).count(),
                queues: serde_json::Value::Array(self.peers.values().map(Peer::queue_stats).collect()),
            });
            self.tick_sum_us = 0;
            self.tick_max_us = 0;
        }
        if self.tick_count.is_multiple_of(LEVEL_EVERY) {
            let nonzero = self.peaks.values().any(|level| *level > 0.01);
            if nonzero || self.last_levels_nonzero {
                let levels: HashMap<String, f32> = self
                    .peaks
                    .iter()
                    .map(|(id, level)| (id.clone(), (level * 100.0).round() / 100.0))
                    .collect();
                emit(&Event::Levels { levels: &levels });
            }
            self.last_levels_nonzero = nonzero;
            for peak in self.peaks.values_mut() {*peak=0.0;}
        }
    }

    fn next_deadline(&self, tick: Instant) -> Instant {
        self.peers
            .values()
            .map(Peer::next_deadline)
            .fold(tick, Instant::min)
    }
}

/// `--control ADDR` or MIX_ROUTER_CONTROL; the gateway connects here. Loopback by default.
fn control_address() -> String {
    let mut args = std::env::args().skip(1);
    while let Some(flag) = args.next() {
        if flag == "--control" {
            if let Some(addr) = args.next() {
                return addr;
            }
        }
    }
    std::env::var("MIX_ROUTER_CONTROL").unwrap_or_else(|_| "127.0.0.1:7100".to_owned())
}

fn main() {
    let (inputs_tx, inputs) = mpsc::sync_channel::<Input>(1_024);
    let control_addr = control_address();
    let listener = TcpListener::bind(&control_addr).unwrap_or_else(|error| {
        eprintln!("mix-router: cannot listen for the gateway on {control_addr}: {error}");
        std::process::exit(2);
    });
    eprintln!("mix-router: control on {control_addr}");
    {
        let inputs = inputs_tx.clone();
        thread::Builder::new()
            .name("control-accept".into())
            .spawn(move || {
                let mut generation = 0_u64;
                for stream in listener.incoming().map_while(Result::ok) {
                    generation += 1;
                    let id = generation;
                    let _ = stream.set_nodelay(true);
                    let Ok(writer) = stream.try_clone() else { continue };
                    let inputs = inputs.clone();
                    let _ = thread::Builder::new().name("control-reader".into()).spawn(move || {
                        // A connection only becomes *the* control link once it sends a valid command
                        // (the gateway opens with `hello`). Anything else, such as a browser or a port
                        // scanner, is dropped without disturbing the gateway that is attached.
                        let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));
                        let control = stream.try_clone().ok();
                        let mut writer = Some(writer);
                        let mut adopted = false;
                        for line in BufReader::new(stream).lines().map_while(Result::ok) {
                            let Ok(command) = serde_json::from_str::<Command>(&line) else {
                                if adopted {
                                    eprintln!("mix-router: ignoring an unreadable command");
                                    continue;
                                }
                                return;
                            };
                            if !adopted {
                                if !matches!(command,Command::Hello) {return;}
                                adopted = true;
                                if let Some(control) = &control {
                                    let _ = control.set_read_timeout(None);
                                }
                                if let Some(writer) = writer.take() {
                                    if inputs.send(Input::ControlOpened(id, writer)).is_err() {
                                        return;
                                    }
                                }
                            }
                            if inputs.send(Input::Command(id, command)).is_err() {
                                return;
                            }
                        }
                        if adopted {
                            let _ = inputs.send(Input::ControlClosed(id));
                        }
                    });
                }
            })
            .expect("spawn control listener");
    }

    let mut router = Router {
        crypto: Arc::new(str0m::crypto::from_feature_flags()),
        sockets: Sockets {
            by_ip: HashMap::new(),
            by_local: HashMap::new(),
            inputs: inputs_tx,
        },
        mixer: Mixer::default(),
        graph: None,
        graph_states: HashMap::new(),
        peers: HashMap::new(),
        by_pack: HashMap::new(),
        control_generation: 0,
        tick_count: 0,
        tick_sum_us: 0,
        tick_max_us: 0,
        frames: HashMap::new(),
        peaks: HashMap::new(),
        last_levels_nonzero: false,
    };
    let mut next_tick = Instant::now() + TICK;
    loop {
        let now = Instant::now();
        let wait = router.next_deadline(next_tick).saturating_duration_since(now);
        match inputs.recv_timeout(wait) {
            Ok(Input::Command(id, command)) => { if id == router.control_generation { router.handle_command(command, Instant::now()); } },
            Ok(Input::Datagram {
                local,
                source,
                contents, len,
            }) => router.handle_datagram(local, source, &contents[..len], Instant::now()),
            Ok(Input::ControlOpened(id, stream)) => {
                router.control_generation = id;
                set_sink(Some(stream));
                emit(&Event::Ready);
                router.sync();
            }
            Ok(Input::ControlClosed(id)) => {
                if id == router.control_generation {
                    set_sink(None);
                }
            }
            Err(RecvTimeoutError::Timeout) => {}
            Err(RecvTimeoutError::Disconnected) => return,
        }
        let now = Instant::now();
        if now >= next_tick {
            router.tick(now);
            next_tick += TICK;
            if now.saturating_duration_since(next_tick) > Duration::from_millis(50) {
                next_tick = now + TICK; // fell far behind; do not burst to catch up
            }
        }
        router.drive(Instant::now());
    }
}
