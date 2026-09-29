//! A str0m client session to the gateway's mix-router: sends the capture queue as 10 ms Opus,
//! plays what comes back. Returns when the link dies or `stop` is raised.

use opus::{Application, Channels, Decoder, Encoder};
use serde::Deserialize;
use std::net::{IpAddr, SocketAddr, UdpSocket};
use std::sync::Arc;
use std::time::{Duration, Instant};
use str0m::change::SdpAnswer;
use str0m::format::Codec;
use str0m::media::{Direction, Frequency, MediaKind, MediaTime};
use str0m::net::{Protocol, Receive};
use str0m::{Candidate, Event, IceConnectionState, Input, Output, Rtc, RtcConfig};

use crate::audio::{Devices, Queue, channel_of, new_queue, push_playback, start_capture, start_playback};

const FRAME: usize = 480;

#[derive(Deserialize)]
struct SessionResponse {
    #[serde(rename = "sessionId")]
    session_id: String,
    answer: String,
}

pub struct Params<'a> {
    pub gateway: &'a str,
    pub pack_id: &'a str,
    pub local_ip: IpAddr,
    pub devices: &'a Devices,
}

/// The interface input/output the Manager chose, as pushed by the router.
#[derive(Deserialize, Clone, PartialEq, Debug, Default)]
struct Selection {
    input: Option<String>,
    output: Option<String>,
}

#[derive(Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
enum Reply {
    Device(Selection),
    Pong,
    #[serde(other)]
    Other,
}

/// Open device streams for one selection. Dropping this stops audio.
struct Audio {
    _streams: Vec<cpal::Stream>,
    capture: Option<Queue>,
    playback: Option<Queue>,
}

fn open_audio(devices: &Devices, selection: &Selection) -> Result<Audio, String> {
    let mut streams = Vec::new();
    let (mut capture, mut playback) = (None, None);
    if let (Some(device), Some(channel)) = (&devices.input, selection.input.as_deref().and_then(|l| channel_of(l, "In"))) {
        let queue = new_queue();
        streams.push(start_capture(device, channel, queue.clone())?);
        capture = Some(queue);
    }
    if let (Some(device), Some(channel)) = (&devices.output, selection.output.as_deref().and_then(|l| channel_of(l, "Out"))) {
        let queue = new_queue();
        streams.push(start_playback(device, channel, queue.clone())?);
        playback = Some(queue);
    }
    Ok(Audio { _streams: streams, capture, playback })
}

pub fn run(params: Params<'_>) -> Result<(), String> {
    let crypto = Arc::new(str0m::crypto::from_feature_flags());
    let socket = UdpSocket::bind(SocketAddr::new(params.local_ip, 0)).map_err(|e| format!("bind: {e}"))?;
    socket.set_read_timeout(Some(Duration::from_millis(2))).map_err(|e| e.to_string())?;
    let local = socket.local_addr().map_err(|e| e.to_string())?;

    let mut rtc = RtcConfig::new().set_crypto_provider(crypto).clear_codecs().enable_opus(true).build(Instant::now());
    rtc.add_local_candidate(Candidate::host(local, "udp").map_err(|e| e.to_string())?);
    let mut change = rtc.sdp_api();
    let mid = change.add_media(MediaKind::Audio, Direction::SendRecv, None, None, None);
    change.add_channel("control".into());
    let (offer, pending) = change.apply().ok_or("could not build offer")?;

    let response: SessionResponse = ureq::post(&format!("{}/api/v1/media/sessions", params.gateway))
        .send_json(serde_json::json!({ "packId": params.pack_id, "offer": offer.to_sdp_string() }))
        .map_err(|e| format!("session request: {e}"))?
        .into_json()
        .map_err(|e| e.to_string())?;
    let answer = SdpAnswer::from_sdp_string(&response.answer).map_err(|e| e.to_string())?;
    rtc.sdp_api().accept_answer(pending, answer).map_err(|e| e.to_string())?;

    let result = pump(&mut rtc, &socket, local, mid, &params);
    let _ = ureq::delete(&format!("{}/api/v1/media/sessions/{}", params.gateway, response.session_id)).call();
    result
}

fn pump(rtc: &mut Rtc, socket: &UdpSocket, local: SocketAddr, mid: str0m::media::Mid, p: &Params<'_>) -> Result<(), String> {
    let mut encoder = Encoder::new(48_000, Channels::Mono, Application::LowDelay).map_err(|e| e.to_string())?;
    encoder.set_bitrate(opus::Bitrate::Bits(64_000)).map_err(|e| e.to_string())?;
    let mut decoder = Decoder::new(48_000, Channels::Mono).map_err(|e| e.to_string())?;
    let mut pcm = vec![0.0_f32; 5_760];
    let mut packet = [0_u8; 1_275];
    let mut buffer = [0_u8; 2_048];
    let mut frame = [0.0_f32; FRAME];
    let mut connected = false;
    let mut sent: u64 = 0;
    let mut pt = None;
    let mut channel = None;
    let mut audio: Option<Audio> = None;
    let mut selection = Selection::default();
    let mut last_ping = Instant::now();
    let mut last_rx = Instant::now();

    loop {
        let now = Instant::now();
        if channel.is_some() {
            if now.duration_since(last_rx) > Duration::from_millis(3500) {
                return Err("the mixer stopped answering".into());
            }
            if now.duration_since(last_ping) >= Duration::from_secs(1) {
                last_ping = now;
                if let Some(mut c) = rtc.channel(channel.unwrap()) {
                    let _ = c.write(false, br#"{"type":"ping"}"#);
                }
            }
        }
        while let Ok((count, source)) = socket.recv_from(&mut buffer) {
            if let Ok(receive) = Receive::new(Protocol::Udp, source, local, &buffer[..count]) {
                rtc.handle_input(Input::Receive(now, receive)).map_err(|e| e.to_string())?;
            }
            // Keep draining what is already queued, but stop waiting.
            socket.set_read_timeout(Some(Duration::from_micros(1))).ok();
        }
        socket.set_read_timeout(Some(Duration::from_millis(2))).ok();
        rtc.handle_input(Input::Timeout(Instant::now())).map_err(|e| e.to_string())?;

        loop {
            match rtc.poll_output().map_err(|e| e.to_string())? {
                Output::Timeout(_) => break,
                Output::Transmit(t) => {
                    let _ = socket.send_to(&t.contents, t.destination);
                }
                Output::Event(Event::Connected) => connected = true,
                Output::Event(Event::ChannelOpen(id, _)) => {
                    channel = Some(id);
                    last_rx = Instant::now();
                }
                Output::Event(Event::ChannelData(data)) if !data.binary => {
                    last_rx = Instant::now();
                    if let Ok(Reply::Device(next)) = serde_json::from_slice::<Reply>(&data.data) {
                        if next != selection || audio.is_none() {
                            eprintln!("device selection: input {:?}, output {:?}", next.input, next.output);
                            drop(audio.take()); // stop the old streams before opening the new ones
                            audio = Some(open_audio(p.devices, &next)?);
                            selection = next;
                        }
                    }
                }
                Output::Event(Event::IceConnectionStateChange(IceConnectionState::Disconnected)) => {
                    return Err("ice disconnected".into());
                }
                Output::Event(Event::MediaData(data)) => {
                    let playback = audio.as_ref().and_then(|a| a.playback.as_ref());
                    if let (Some(queue), Ok(count)) = (playback, decoder.decode_float(&data.data, &mut pcm, false)) {
                        push_playback(queue, &pcm[..count]);
                    }
                }
                Output::Event(_) => {}
            }
        }
        if !rtc.is_alive() {
            return Err("connection closed".into());
        }

        if connected {
            if pt.is_none() {
                pt = rtc.writer(mid).and_then(|w| w.payload_params().find(|x| x.spec().codec == Codec::Opus).map(|x| x.pt()));
            }
            let (Some(pt), Some(capture)) = (pt, audio.as_ref().and_then(|a| a.capture.as_ref())) else { continue };
            loop {
                {
                    let Ok(mut queue) = capture.lock() else { break };
                    if queue.len() < FRAME {
                        break;
                    }
                    for sample in frame.iter_mut() {
                        *sample = queue.pop_front().unwrap_or(0.0);
                    }
                }
                let length = encoder.encode_float(&frame, &mut packet).map_err(|e| e.to_string())?;
                let time = MediaTime::new(sent * FRAME as u64, Frequency::FORTY_EIGHT_KHZ);
                sent += 1;
                if let Some(writer) = rtc.writer(mid) {
                    let _ = writer.write(pt, Instant::now(), time, packet[..length].to_vec());
                }
            }
        }
    }
}
