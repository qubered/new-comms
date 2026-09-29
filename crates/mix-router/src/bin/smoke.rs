//! End-to-end check: spawns the real mix-router, connects three str0m clients over loopback
//! UDP (with data channels), keys one, and verifies who hears whom.
//!
//!   cargo run --release -p mix-router --bin smoke

use opus::{Application, Channels, Decoder, Encoder};
use std::io::{BufRead, BufReader, Write};
use std::net::{IpAddr, Ipv4Addr, SocketAddr, UdpSocket};
use std::process::{Command, Stdio};
use std::sync::Arc;
use std::time::{Duration, Instant};
use str0m::change::SdpAnswer;
use str0m::channel::ChannelId;
use str0m::format::Codec;
use str0m::media::{Direction, Frequency, MediaKind, MediaTime, Mid, Pt};
use str0m::net::{Protocol, Receive};
use str0m::{Candidate, Event, Input, Output, Rtc, RtcConfig};

struct Client {
    name: &'static str,
    rtc: Rtc,
    socket: UdpSocket,
    addr: SocketAddr,
    mid: Option<Mid>,
    pt: Option<Pt>,
    channel: Option<ChannelId>,
    encoder: Encoder,
    decoder: Decoder,
    tone: bool,
    sent: u64,
    phase: f32,
    heard: Vec<(Instant, f32)>, // arrival time and rms per received packet
    connected: bool,
    pending_msgs: Vec<String>,
    last_ping: Instant,
    ping: bool,
}

impl Client {
    fn new(name: &'static str, tone: bool, crypto: Arc<str0m::crypto::CryptoProvider>) -> (Self, String, str0m::change::SdpPendingOffer) {
        let socket = UdpSocket::bind((Ipv4Addr::LOCALHOST, 0)).unwrap();
        socket.set_nonblocking(true).unwrap();
        let addr = socket.local_addr().unwrap();
        let mut rtc = RtcConfig::new().set_crypto_provider(crypto).clear_codecs().enable_opus(true).build(Instant::now());
        rtc.add_local_candidate(Candidate::host(addr, "udp").unwrap());
        let mut change = rtc.sdp_api();
        let mid = change.add_media(MediaKind::Audio, Direction::SendRecv, None, None, None);
        change.add_channel("control".into());
        let (offer, pending) = change.apply().unwrap();
        let encoder = Encoder::new(48_000, Channels::Mono, Application::LowDelay).unwrap();
        let decoder = Decoder::new(48_000, Channels::Mono).unwrap();
        (
            Self {
                name, rtc, socket, addr, mid: Some(mid), pt: None, channel: None, encoder, decoder, tone,
                sent: 0, phase: 0.0, heard: Vec::new(), connected: false, pending_msgs: Vec::new(), last_ping: Instant::now(), ping: true,
            },
            offer.to_sdp_string(),
            pending,
        )
    }

    fn pump(&mut self, now: Instant) {
        let mut buf = [0u8; 2048];
        while let Ok((n, source)) = self.socket.recv_from(&mut buf) {
            let receive = Receive::new(Protocol::Udp, source, self.addr, &buf[..n]).unwrap();
            let _ = self.rtc.handle_input(Input::Receive(now, receive));
        }
        let _ = self.rtc.handle_input(Input::Timeout(now));
        loop {
            match self.rtc.poll_output().unwrap() {
                Output::Timeout(_) => break,
                Output::Transmit(t) => {
                    let _ = self.socket.send_to(&t.contents, t.destination);
                }
                Output::Event(Event::Connected) => self.connected = true,
                Output::Event(Event::MediaAdded(m)) => self.mid = Some(m.mid),
                Output::Event(Event::ChannelOpen(id, _)) => self.channel = Some(id),
                Output::Event(Event::MediaData(d)) => {
                    let mut pcm = vec![0f32; 5760];
                    if let Ok(count) = self.decoder.decode_float(&d.data, &mut pcm, false) {
                        let rms = (pcm[..count].iter().map(|s| s * s).sum::<f32>() / count as f32).sqrt();
                        self.heard.push((Instant::now(), rms));
                    }
                }
                Output::Event(_) => {}
            }
        }
        if self.ping && self.channel.is_some() && now.duration_since(self.last_ping) >= Duration::from_secs(1) {
            self.last_ping = now;
            self.pending_msgs.push(r#"{"type":"ping"}"#.into());
        }
        if let Some(id) = self.channel {
            for message in self.pending_msgs.drain(..) {
                if let Some(mut channel) = self.rtc.channel(id) {
                    let _ = channel.write(false, message.as_bytes());
                }
            }
        }
    }

    fn send_audio(&mut self, now: Instant) {
        let (Some(mid), true) = (self.mid, self.connected) else { return };
        if self.pt.is_none() {
            self.pt = self.rtc.writer(mid).and_then(|w| w.payload_params().find(|p| p.spec().codec == Codec::Opus).map(|p| p.pt()));
        }
        let Some(pt) = self.pt else { return };
        let mut frame = [0f32; 480];
        if self.tone {
            for s in frame.iter_mut() {
                *s = (self.phase).sin() * 0.4;
                self.phase += 2.0 * std::f32::consts::PI * 1_000.0 / 48_000.0;
            }
        }
        let mut packet = [0u8; 1275];
        let len = self.encoder.encode_float(&frame, &mut packet).unwrap();
        let time = MediaTime::new(self.sent * 480, Frequency::FORTY_EIGHT_KHZ);
        self.sent += 1;
        if let Some(writer) = self.rtc.writer(mid) {
            if let Err(e) = writer.write(pt, now, time, packet[..len].to_vec()) { if self.sent % 100 == 1 { eprintln!("client {} write error: {e}", self.name); } }
        }
    }

    fn mean_recent(&self, packets: usize) -> f32 {
        let tail = &self.heard[self.heard.len().saturating_sub(packets)..];
        if tail.is_empty() { 0.0 } else { tail.iter().map(|(_, r)| r).sum::<f32>() / tail.len() as f32 }
    }
}

fn main() {
    let binary = std::env::var("MIX_ROUTER_BIN").unwrap_or_else(|_| {
        let exe = std::env::current_exe().unwrap();
        exe.parent().unwrap().join("mix-router").display().to_string()
    });
    let port = std::net::TcpListener::bind("127.0.0.1:0").unwrap().local_addr().unwrap().port();
    let control = format!("127.0.0.1:{port}");
    let mut child = Command::new(&binary).args(["--control", &control]).stdin(Stdio::null()).spawn().expect("start mix-router");
    let stream = (0..50)
        .find_map(|_| std::net::TcpStream::connect(&control).ok().or_else(|| { std::thread::sleep(Duration::from_millis(100)); None }))
        .expect("connect to mix-router control port");
    let mut stdin = stream.try_clone().unwrap();
    let lines = BufReader::new(stream).lines();
    let mut lines = lines;
    let mut send = move |value: serde_json::Value| {
        writeln!(stdin, "{value}").unwrap();
        stdin.flush().unwrap();
    };
    let (ev_tx, ev_rx) = std::sync::mpsc::channel::<serde_json::Value>();
    std::thread::spawn(move || {
        for line in lines.by_ref().map_while(Result::ok) {
            if std::env::var("SMOKE_DEBUG").is_ok() && !line.contains("levels") { eprintln!("router: {line}"); }
            if ev_tx.send(serde_json::from_str(&line).unwrap()).is_err() { return; }
        }
    });
    let read = || -> serde_json::Value { ev_rx.recv().unwrap() };

    send(serde_json::json!({ "cmd": "hello" }));
    assert_eq!(read()["event"], "ready");

    // A stray connection (a browser, a port scan) must not take the control link from us.
    {
        use std::io::Read;
        let mut stray = std::net::TcpStream::connect(&control).expect("stray connect");
        stray.write_all(b"GET / HTTP/1.1\\r\\nHost: x\\r\\n\\r\\n").unwrap();
        stray.set_read_timeout(Some(Duration::from_secs(2))).unwrap();
        let mut sink = [0u8; 16];
        // The router closes it without answering.
        assert!(matches!(stray.read(&mut sink), Ok(0) | Err(_)), "router answered a stray connection");
    }
    let key = |c: &str| serde_json::json!({"channelId": c, "volume": 100, "pgmListen": "always"});
    send(serde_json::json!({
        "cmd": "config",
        "channels": [{"id": "prod", "type": "partyline", "members": ["a", "b", "c"]}],
        "packs": [
            {"id": "a", "type": "human", "masterVolume": 100, "keys": [key("prod")]},
            {"id": "b", "type": "human", "masterVolume": 100, "keys": [key("prod")]},
            {"id": "c", "type": "human", "masterVolume": 100, "keys": []},
        ],
    }));

    let crypto = Arc::new(str0m::crypto::from_feature_flags());
    let mut clients = Vec::new();
    for (name, tone) in [("a", true), ("b", false), ("c", false)] {
        let (client, offer, pending) = Client::new(name, tone, Arc::clone(&crypto));
        send(serde_json::json!({
            "cmd": "open", "sessionId": name, "packId": name, "offer": offer,
            "candidateIp": IpAddr::V4(Ipv4Addr::LOCALHOST),
        }));
        let answer = loop {
            let event = read();
            if event["event"] == "answer" {
                break event["sdp"].as_str().unwrap().to_owned();
            }
            assert_ne!(event["event"], "rejected", "{event}");
        };
        let mut client = client;
        client.rtc.sdp_api().accept_answer(pending, SdpAnswer::from_sdp_string(&answer).unwrap()).unwrap();
        clients.push(client);
    }

    let start = Instant::now();
    let mut keyed = false;
    let mut next_audio = start;
    let mut measured = (0.0, 0.0, 0.0);
    while start.elapsed() < Duration::from_secs(6) {
        let now = Instant::now();
        for client in &mut clients {
            client.pump(now);
        }
        if now >= next_audio {
            for client in &mut clients {
                client.send_audio(now);
            }
            next_audio += Duration::from_millis(10);
        }
        if !keyed && clients.iter().all(|c| c.channel.is_some() && c.connected) {
            clients[0].pending_msgs.push(r#"{"type":"key","channelId":"prod","on":true}"#.into());
            keyed = true;
            for c in &mut clients { c.heard.clear(); }
        }
        if keyed && start.elapsed() > Duration::from_secs(5) && measured.0 == 0.0 {
            measured = (clients[0].mean_recent(100), clients[1].mean_recent(100), clients[2].mean_recent(100));
        }
        std::thread::sleep(Duration::from_millis(1));
    }
    // Impulse latency: tone starts on a, first loud packet at b. Loopback, so this is the
    // mixer's own floor (packetisation + prime buffer + tick + codec), not mic-to-ear.
    let mut latencies = Vec::new();
    if measured.1 > 0.1 {
        for _ in 0..20 {
            clients[0].tone = false;
            let quiet = Instant::now() + Duration::from_millis(250);
            while Instant::now() < quiet {
                let now = Instant::now();
                for c in &mut clients { c.pump(now); }
                if now >= next_audio { for c in &mut clients { c.send_audio(now); } next_audio += Duration::from_millis(10); }
                std::thread::sleep(Duration::from_millis(1));
            }
            let t0 = Instant::now();
            clients[0].tone = true;
            let until = t0 + Duration::from_millis(400);
            while Instant::now() < until {
                let now = Instant::now();
                for c in &mut clients { c.pump(now); }
                if now >= next_audio { for c in &mut clients { c.send_audio(now); } next_audio += Duration::from_millis(10); }
                std::thread::sleep(Duration::from_millis(1));
            }
            if let Some((at, _)) = clients[1].heard.iter().find(|(at, rms)| *at >= t0 && *rms > 0.1) {
                latencies.push(at.duration_since(t0).as_secs_f32() * 1000.0);
            }
        }
        latencies.sort_by(|a, b| a.partial_cmp(b).unwrap());
        if let (Some(min), Some(max)) = (latencies.first(), latencies.last()) {
            println!("impulse latency over loopback ({} trials): min {min:.0} ms, p50 {:.0} ms, p95 {:.0} ms, max {max:.0} ms", latencies.len(), latencies[latencies.len() / 2], latencies[(latencies.len()*95).div_ceil(100)-1]);
        }
    }
    // Heartbeat: a phone that stops pinging is dropped, and its keys released.
    clients[2].ping = false;
    let silent_since = Instant::now();
    let mut dropped_after = None;
    while silent_since.elapsed() < Duration::from_secs(8) && dropped_after.is_none() {
        let now = Instant::now();
        for c in &mut clients { c.pump(now); }
        if now >= next_audio { for c in &mut clients { c.send_audio(now); } next_audio += Duration::from_millis(10); }
        while let Ok(event) = ev_rx.try_recv() {
            if event["event"] == "closed" && event["packId"] == "c" {
                assert_eq!(event["reason"], "timeout");
                dropped_after = Some(silent_since.elapsed());
            }
        }
        std::thread::sleep(Duration::from_millis(1));
    }
    match dropped_after {
        Some(after) => println!("silent peer dropped after {:.1} s", after.as_secs_f32()),
        None => panic!("a peer that stopped pinging was never dropped"),
    }
    let _ = child.kill();
    let names: Vec<_> = clients.iter().map(|c| c.name).collect();
    println!("packets heard {:?}", clients.iter().map(|c| c.heard.len()).collect::<Vec<_>>());
    println!("mean rms heard {:?} = {:?}", names, measured);
    assert!(keyed, "clients never connected with data channels");
    assert!(measured.0 < 0.01, "a heard itself: {}", measured.0);
    assert!(measured.1 > 0.1, "b (has key) did not hear a: {}", measured.1);
    assert!(measured.2 < 0.01, "c (no key on prod) should hear nothing: {}", measured.2);
    println!("ok");
}
