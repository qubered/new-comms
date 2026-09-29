//! mix-router: terminates WebRTC/Opus for every pack, mixes N-1 per listener every 10 ms,
//! and applies key / volume / mic messages from each peer's data channel. The gateway
//! drives it over stdin/stdout (line-delimited JSON); audio never crosses that pipe.

mod control;
mod mixer;
mod peer;

use std::collections::HashMap;
use std::io::{self, BufRead, ErrorKind};
use std::net::{IpAddr, SocketAddr, UdpSocket};
use std::sync::Arc;
use std::sync::mpsc::{self, RecvTimeoutError, SyncSender};
use std::thread;
use std::time::{Duration, Instant};

use control::{Command, Event, emit};
use mixer::Mixer;
use peer::{FRAME, Peer, PeerEvent};
use socket2::{Domain, Protocol, Socket, Type};

const TICK: Duration = Duration::from_millis(10);
const MAX_PEERS: usize = 64;
const LEVEL_EVERY: u32 = 10; // ticks: 100 ms

enum Input {
    Command(Command),
    Datagram {
        local: SocketAddr,
        source: SocketAddr,
        contents: Vec<u8>,
    },
    ControlClosed,
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
    let address = SocketAddr::new(ip, 0);
    let socket = Socket::new(Domain::for_address(address), Type::DGRAM, Some(Protocol::UDP))?;
    if ip.is_ipv4() {
        let _ = socket.set_tos_v4(DSCP_EF_TOS);
    }
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
                    contents: buffer[..count].to_vec(),
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
    /// session id -> peer
    peers: HashMap<String, Peer>,
    /// pack id -> live session id (a pack has one session; a newer one replaces it)
    by_pack: HashMap<String, String>,
    tick_count: u32,
    frames: HashMap<String, [f32; FRAME]>,
    peaks: HashMap<String, f32>,
    last_levels_nonzero: bool,
}

impl Router {
    fn handle_command(&mut self, command: Command, now: Instant) {
        match command {
            Command::Config { channels, packs } => {
                self.mixer.configure(channels, packs);
                // Push fresh state so every phone sees the volumes the Manager set.
                let ids: Vec<String> = self.by_pack.keys().cloned().collect();
                for id in ids {
                    self.push_state(&id);
                }
            }
            Command::Open {
                session_id,
                pack_id,
                offer,
                candidate_ip,
            } => {
                if self.mixer.pack(&pack_id).is_none() {
                    return emit(&Event::Rejected {
                        session_id: &session_id,
                        detail: "unknown pack",
                    });
                }
                if self.peers.len() >= MAX_PEERS {
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
                match Peer::open(Arc::clone(&self.crypto), pack_id.clone(), local, &offer, now) {
                    Ok((peer, answer)) => {
                        // A pack has one live session: the newest wins.
                        if let Some(old) = self.by_pack.insert(pack_id, session_id.clone()) {
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

    fn push_state(&mut self, pack_id: &str) {
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
                    "pgmOn": state.pgm_on,
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
                }
                PeerEvent::Message(message) => {
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
        self.frames.clear();
        for peer in self.peers.values_mut() {
            if !peer.connected {
                continue;
            }
            let mut frame = [0.0_f32; FRAME];
            if peer.take_frame(&mut frame) {
                let peak = frame.iter().fold(0.0_f32, |m, s| m.max(s.abs()));
                if self.mixer.is_talking(&peer.pack_id) || self.mixer.is_hardware(&peer.pack_id) {
                    let slot = self.peaks.entry(peer.pack_id.clone()).or_insert(0.0);
                    *slot = slot.max(peak);
                }
                self.frames.insert(peer.pack_id.clone(), frame);
            }
        }
        let mut out = [0.0_f32; FRAME];
        for peer in self.peers.values_mut() {
            if !peer.connected {
                continue;
            }
            self.mixer.mix_for(&peer.pack_id, &self.frames, &mut out);
            peer.send_frame(&out, now);
        }
        self.tick_count += 1;
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
            self.peaks.clear();
        }
    }

    fn next_deadline(&self, tick: Instant) -> Instant {
        self.peers
            .values()
            .map(Peer::next_deadline)
            .fold(tick, Instant::min)
    }
}

fn main() {
    let (inputs_tx, inputs) = mpsc::sync_channel::<Input>(1_024);
    {
        let inputs = inputs_tx.clone();
        thread::Builder::new()
            .name("control-reader".into())
            .spawn(move || {
                for line in io::stdin().lock().lines().map_while(Result::ok) {
                    match serde_json::from_str::<Command>(&line) {
                        Ok(command) => {
                            if inputs.send(Input::Command(command)).is_err() {
                                return;
                            }
                        }
                        Err(error) => eprintln!("mix-router: bad command: {error}"),
                    }
                }
                let _ = inputs.send(Input::ControlClosed);
            })
            .expect("spawn control reader");
    }

    let mut router = Router {
        crypto: Arc::new(str0m::crypto::from_feature_flags()),
        sockets: Sockets {
            by_ip: HashMap::new(),
            by_local: HashMap::new(),
            inputs: inputs_tx,
        },
        mixer: Mixer::default(),
        peers: HashMap::new(),
        by_pack: HashMap::new(),
        tick_count: 0,
        frames: HashMap::new(),
        peaks: HashMap::new(),
        last_levels_nonzero: false,
    };
    emit(&Event::Ready);

    let mut next_tick = Instant::now() + TICK;
    loop {
        let now = Instant::now();
        let wait = router.next_deadline(next_tick).saturating_duration_since(now);
        match inputs.recv_timeout(wait) {
            Ok(Input::Command(command)) => router.handle_command(command, Instant::now()),
            Ok(Input::Datagram {
                local,
                source,
                contents,
            }) => router.handle_datagram(local, source, &contents, Instant::now()),
            Ok(Input::ControlClosed) => return,
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
