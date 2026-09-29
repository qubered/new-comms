//! One independent mono Opus track for every hardware channel in use.
use opus::{Application, Channels, Decoder, Encoder};
use serde::Deserialize;
use std::net::{IpAddr, SocketAddr, UdpSocket};
use std::sync::{mpsc::Receiver, Arc};
use std::time::{Duration, Instant};
use str0m::change::SdpAnswer;
use str0m::format::Codec;
use str0m::media::{Direction, Frequency, MediaKind, MediaTime, Mid};
use str0m::net::{Protocol, Receive};
use str0m::{Candidate, Event, IceConnectionState, Input, Output, Rtc, RtcConfig};
use crate::{Port, audio::{self, Devices, Queue}};

const FRAME: usize = 480;
#[derive(Deserialize)]
struct SessionResponse {
    #[serde(rename = "sessionId")]
    session_id: String,
    answer: String,
}
pub struct Params<'a> {
    pub gateway: &'a str,
    pub node_id: &'a str,
    pub local_ip: IpAddr,
    pub devices: &'a Devices,
    pub ports: &'a [Port],
    pub updates: &'a Receiver<Result<Vec<Port>, String>>,
}
#[derive(Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
enum Reply {
    Device { ports: Vec<DevicePort> },
    #[serde(other)] Other,
}
#[derive(Deserialize, PartialEq, Debug)]
struct DevicePort {
    #[serde(rename = "portId")]
    port_id: String,
    direction: String,
    channel: usize,
    // Trims are applied by the routing graph; never apply them a second time here.
}
fn selection(ports: &[Port]) -> Vec<DevicePort> {
    ports.iter().map(|p| DevicePort { port_id: p.id.clone(), direction: p.kind.clone(), channel: p.hardware.channel }).collect()
}
fn same_selection(a: &[DevicePort], b: &[DevicePort]) -> bool {
    a.len() == b.len() && a.iter().all(|p| b.contains(p))
}
struct Track {
    mid: Mid,
    queue: Queue,
    encoder: Option<Encoder>,
    decoder: Option<Decoder>,
    sent: u64,
}

pub fn run(params: Params<'_>) -> Result<(), String> {
    let socket = UdpSocket::bind(SocketAddr::new(params.local_ip, 0)).map_err(|e| format!("bind: {e}"))?;
    socket.set_read_timeout(Some(Duration::from_millis(2))).map_err(|e| e.to_string())?;
    let local = socket.local_addr().map_err(|e| e.to_string())?;
    let mut rtc = RtcConfig::new().set_crypto_provider(Arc::new(str0m::crypto::from_feature_flags()))
        .clear_codecs().enable_opus(true).build(Instant::now());
    rtc.add_local_candidate(Candidate::host(local, "udp").map_err(|e| e.to_string())?);
    let mut change = rtc.sdp_api();
    let mut tracks = Vec::new();
    let mut capture = Vec::new();
    let mut playback = Vec::new();
    // Router matches audio sections to ports in show order, including interleaved directions.
    for port in params.ports {
        let kind = port.kind.as_str();
        let channel = port.hardware.channel.checked_sub(1).ok_or("hardware channels are one-based")?;
        let input = kind == "input";
        let count = if input { params.devices.input_channels } else { params.devices.output_channels };
        if channel >= count as usize { return Err(format!("{} channel {} is unavailable", kind, channel + 1)); }
        let mid = change.add_media(MediaKind::Audio, if input { Direction::SendOnly } else { Direction::RecvOnly }, None, None, None);
        let queue = audio::new_queue();
        let (encoder, decoder) = if input {
            let mut encoder = Encoder::new(48_000, Channels::Mono, Application::LowDelay).map_err(|e| e.to_string())?;
            encoder.set_bitrate(opus::Bitrate::Bits(64_000)).map_err(|e| e.to_string())?;
            capture.push((channel, queue.clone()));
            (Some(encoder), None)
        } else {
            playback.push((channel, queue.clone()));
            (None, Some(Decoder::new(48_000, Channels::Mono).map_err(|e| e.to_string())?))
        };
        tracks.push(Track { mid, queue, encoder, decoder, sent: 0 });
    }
    change.add_channel("control".into());
    let (offer, pending) = change.apply().ok_or("could not build offer")?;
    let response: SessionResponse = ureq::post(&format!("{}/api/v2/media/sessions", params.gateway))
        .timeout(Duration::from_secs(5))
        .send_json(serde_json::json!({ "nodeId": params.node_id, "offer": offer.to_sdp_string() }))
        .map_err(|e| format!("session request: {e}"))?.into_json().map_err(|e| e.to_string())?;
    let result = (|| {
        let answer = SdpAnswer::from_sdp_string(&response.answer).map_err(|e| e.to_string())?;
        rtc.sdp_api().accept_answer(pending, answer).map_err(|e| e.to_string())?;
        let mut streams = Vec::new();
        if !capture.is_empty() { streams.push(audio::start_capture(params.devices.input.as_ref().ok_or("no input device")?, capture)?); }
        if !playback.is_empty() { streams.push(audio::start_playback(params.devices.output.as_ref().ok_or("no output device")?, playback)?); }
        pump(&mut rtc, &socket, local, &mut tracks, &params)
    })();
    let _ = ureq::delete(&format!("{}/api/v2/media/sessions/{}", params.gateway, response.session_id))
        .timeout(Duration::from_secs(3)).call();
    result
}

fn pump(rtc: &mut Rtc, socket: &UdpSocket, local: SocketAddr, tracks: &mut [Track], p: &Params<'_>) -> Result<(), String> {
    let selected = selection(p.ports);
    let mut pcm = vec![0.0_f32; 5_760];
    let mut packet = [0_u8; 1_275];
    let mut buffer = [0_u8; 2_048];
    let mut frame = [0.0_f32; FRAME];
    let mut connected = false;
    let mut channel = None;
    let mut last_ping = Instant::now();
    let mut last_rx = Instant::now();
    let started = Instant::now();
    loop {
        for update in p.updates.try_iter() {
            // Registration is control-plane discovery. A gateway outage must not
            // tear down audio that is still flowing directly to the mixer.
            let ports = match update {
                Ok(ports) => ports,
                Err(error) => { eprintln!("registration failed: {error}; keeping current audio session"); continue; }
            };
            let next = selection(&ports);
            if !same_selection(&selected, &next) { return Ok(()); }
        }
        let now = Instant::now();
        if channel.is_none() && now.duration_since(started) > Duration::from_secs(15) { return Err("session connection timed out".into()); }
        if let Some(id) = channel {
            if now.duration_since(last_rx) > Duration::from_millis(3500) { return Err("the mixer stopped answering".into()); }
            if now.duration_since(last_ping) >= Duration::from_secs(1) {
                last_ping = now;
                if let Some(mut c) = rtc.channel(id) { let _ = c.write(false, br#"{"type":"ping"}"#); }
            }
        }
        while let Ok((count, source)) = socket.recv_from(&mut buffer) {
            if let Ok(receive) = Receive::new(Protocol::Udp, source, local, &buffer[..count]) {
                rtc.handle_input(Input::Receive(now, receive)).map_err(|e| e.to_string())?;
            }
            socket.set_read_timeout(Some(Duration::from_micros(1))).ok();
        }
        socket.set_read_timeout(Some(Duration::from_millis(2))).ok();
        rtc.handle_input(Input::Timeout(Instant::now())).map_err(|e| e.to_string())?;
        loop {
            match rtc.poll_output().map_err(|e| e.to_string())? {
                Output::Timeout(_) => break,
                Output::Transmit(t) => { let _ = socket.send_to(&t.contents, t.destination); }
                Output::Event(Event::Connected) => {
                    connected = true;
                    // Discard capture gathered during ICE/DTLS setup rather than burst stale audio.
                    for track in tracks.iter().filter(|t| t.encoder.is_some()) {
                        if let Ok(mut queue) = track.queue.lock() { queue.clear(); }
                    }
                },
                Output::Event(Event::ChannelOpen(id, _)) => { channel = Some(id); last_rx = Instant::now(); }
                Output::Event(Event::ChannelData(data)) if !data.binary => {
                    last_rx = Instant::now();
                    if let Ok(Reply::Device { ports }) = serde_json::from_slice::<Reply>(&data.data) {
                        if !same_selection(&selected, &ports) { return Ok(()); }
                    }
                }
                Output::Event(Event::IceConnectionStateChange(IceConnectionState::Disconnected)) => return Err("ice disconnected".into()),
                Output::Event(Event::MediaData(data)) => {
                    if let Some(track) = tracks.iter_mut().find(|t| t.mid == data.mid) {
                        if let Some(decoder) = &mut track.decoder {
                            if let Ok(count) = decoder.decode_float(&data.data, &mut pcm, false) { audio::push_playback(&track.queue, &pcm[..count]); }
                        }
                    }
                }
                Output::Event(_) => {}
            }
        }
        if !rtc.is_alive() { return Err("connection closed".into()); }
        if connected {
            for track in tracks.iter_mut() {
                let Some(encoder) = &mut track.encoder else { continue };
                let Some(pt) = rtc.writer(track.mid).and_then(|w| w.payload_params().find(|x| x.spec().codec == Codec::Opus).map(|x| x.pt())) else { continue };
                loop {
                    {
                        let Ok(mut queue) = track.queue.lock() else { break };
                        if queue.len() < FRAME { break; }
                        for sample in &mut frame { *sample = queue.pop_front().unwrap_or(0.0); }
                    }
                    let length = encoder.encode_float(&frame, &mut packet).map_err(|e| e.to_string())?;
                    let time = MediaTime::new(track.sent * FRAME as u64, Frequency::FORTY_EIGHT_KHZ);
                    track.sent += 1;
                    if let Some(writer) = rtc.writer(track.mid) { let _ = writer.write(pt, Instant::now(), time, packet[..length].to_vec()); }
                }
            }
        }
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    fn port(id: &str, direction: &str, channel: usize) -> DevicePort {
        DevicePort { port_id: id.into(), direction: direction.into(), channel }
    }
    #[test]
    fn selection_detects_remap_add_remove_but_not_metadata_or_order() {
        let a = vec![port("in3", "input", 3), port("out7", "output", 7)];
        assert!(same_selection(&a, &[port("out7", "output", 7), port("in3", "input", 3)]));
        assert!(!same_selection(&a, &[port("in3", "input", 4), port("out7", "output", 7)]));
        assert!(!same_selection(&a, &[port("in3", "input", 3)]));
        assert!(!same_selection(&a, &[]));
        let update: Reply = serde_json::from_str(r#"{"type":"device","ports":[{"portId":"in3","direction":"input","channel":3,"trim":6},{"portId":"out7","direction":"output","channel":7,"trim":-3}]}"#).unwrap();
        let Reply::Device { ports } = update else { panic!() };
        assert!(same_selection(&a, &ports));
    }

    #[test]
    fn registration_outage_keeps_session_until_a_successful_selection_change() {
        let socket = UdpSocket::bind("127.0.0.1:0").unwrap();
        let local = socket.local_addr().unwrap();
        let mut rtc = RtcConfig::new().set_crypto_provider(Arc::new(str0m::crypto::from_feature_flags())).build(Instant::now());
        let devices = Devices { input: None, output: None, name: "test".into(), input_channels: 1, output_channels: 0 };
        let ports = vec![Port { id: "in1".into(), kind: "input".into(), hardware: crate::Hardware { channel: 1 } }];
        let (tx, rx) = std::sync::mpsc::channel();
        tx.send(Err("connection refused".into())).unwrap();
        tx.send(Err("request timed out".into())).unwrap();
        tx.send(Ok(ports.clone())).unwrap();
        // After recovery, a deliberate channel removal should still end the session.
        tx.send(Ok(vec![])).unwrap();
        let params = Params { gateway: "http://127.0.0.1", node_id: "rack", local_ip: local.ip(), devices: &devices, ports: &ports, updates: &rx };
        assert!(pump(&mut rtc, &socket, local, &mut [], &params).is_ok());
        assert!(rx.try_recv().is_err(), "must process recovered inventory after transient errors");
    }
}
