//! A str0m client session to the gateway's mix-router: sends the capture queue as 10 ms Opus,
//! plays what comes back. Returns when the link dies or `stop` is raised.

use opus::{Application, Channels, Decoder, Encoder};
use serde::Deserialize;
use std::net::{IpAddr, SocketAddr, UdpSocket};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};
use str0m::change::SdpAnswer;
use str0m::format::Codec;
use str0m::media::{Direction, Frequency, MediaKind, MediaTime};
use str0m::net::{Protocol, Receive};
use str0m::{Candidate, Event, IceConnectionState, Input, Output, Rtc, RtcConfig};

use crate::audio::{Queue, push_playback};

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
    /// Where microphone frames come from; `None` sends nothing (input set to None).
    pub capture: Option<Queue>,
    /// Where incoming audio goes; `None` discards it.
    pub playback: Option<Queue>,
    pub stop: Arc<AtomicBool>,
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

    loop {
        if p.stop.load(Ordering::Relaxed) {
            return Ok(());
        }
        let now = Instant::now();
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
                Output::Event(Event::IceConnectionStateChange(IceConnectionState::Disconnected)) => {
                    return Err("ice disconnected".into());
                }
                Output::Event(Event::MediaData(data)) => {
                    if let (Some(queue), Ok(count)) = (&p.playback, decoder.decode_float(&data.data, &mut pcm, false)) {
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
            let (Some(pt), Some(capture)) = (pt, &p.capture) else { continue };
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
