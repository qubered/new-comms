//! One phone or node: an ICE-lite str0m peer with a sendrecv Opus track and a data channel.
//!
//! Inbound audio is decoded into a small sample queue that the mixer drains every 10 ms;
//! the mixer hands back one personalised frame, which this peer encodes and sends.

use opus::{Application, Bitrate, Channels, Decoder, Encoder};
use std::collections::VecDeque;
use std::net::SocketAddr;
use std::sync::Arc;
use std::time::{Duration, Instant};
use str0m::change::SdpOffer;
use str0m::channel::ChannelId;
use str0m::crypto::CryptoProvider;
use str0m::format::Codec;
use str0m::media::{Direction, Frequency, MediaKind, MediaTime, Mid, Pt};
use str0m::net::{Protocol, Receive};
use str0m::{Candidate, Event, IceConnectionState, Input, Output, Rtc, RtcConfig};

use crate::control::PeerMessage;

pub const SAMPLE_RATE: u32 = 48_000;
pub const FRAME: usize = 480; // 10 ms
const MAX_DECODE: usize = 5_760; // 120 ms
const CONNECT_TIMEOUT: Duration = Duration::from_secs(15);
/// Start playing once this much is queued, and stop below one frame.
const PRIME_SAMPLES: usize = FRAME * 2;
/// Above this, the sender has bunched up; trim to `TRIM_TO` to bound latency.
const MAX_QUEUED: usize = FRAME * 8;
const TRIM_TO: usize = FRAME * 3;

pub enum PeerEvent {
    Connected,
    Closed(&'static str),
    Message(PeerMessage),
}

pub struct Transmit<'a> {
    pub source: SocketAddr,
    pub destination: SocketAddr,
    pub contents: &'a [u8],
}

pub struct Peer {
    pub pack_id: String,
    rtc: Rtc,
    mid: Mid,
    pt: Pt,
    decoder: Decoder,
    encoder: Encoder,
    rx: VecDeque<f32>,
    primed: bool,
    channel: Option<ChannelId>,
    outbound: VecDeque<String>,
    pub connected: bool,
    closed: Option<&'static str>,
    connect_deadline: Instant,
    next_timeout: Instant,
    sent_frames: u64,
    packet: Vec<u8>,
    scratch: Vec<f32>,
}

fn sending_audio_mid(answer: &str) -> Option<Mid> {
    let mut sections = answer.split("\r\nm=").skip(1);
    sections.find_map(|section| {
        if !section.starts_with("audio ") {
            return None;
        }
        let lines = || section.split("\r\n");
        let sending = lines().any(|line| line == "a=sendrecv");
        let mid = lines().find_map(|line| line.strip_prefix("a=mid:"))?;
        sending.then(|| Mid::from(mid))
    })
}

impl Peer {
    pub fn open(
        crypto: Arc<CryptoProvider>,
        pack_id: String,
        local: SocketAddr,
        offer_sdp: &str,
        now: Instant,
    ) -> Result<(Self, String), String> {
        let offer = SdpOffer::from_sdp_string(offer_sdp)
            .map_err(|_| "offer is not valid SDP".to_owned())?;
        let mut rtc = RtcConfig::new()
            .set_crypto_provider(crypto)
            .set_ice_lite(true)
            .clear_codecs()
            .enable_opus(true)
            .build(now);
        rtc.add_local_candidate(
            Candidate::host(local, "udp").map_err(|_| "local candidate is invalid".to_owned())?,
        );
        let answer = rtc
            .sdp_api()
            .accept_offer(offer)
            .map_err(|error| format!("offer could not be negotiated: {error}"))?
            .to_sdp_string();

        let mid = sending_audio_mid(&answer)
            .filter(|mid| {
                rtc.media(*mid).is_some_and(|media| {
                    media.kind() == MediaKind::Audio && media.direction() == Direction::SendRecv
                })
            })
            .ok_or_else(|| "offer needs a sendrecv audio section".to_owned())?;
        let pt = rtc
            .writer(mid)
            .and_then(|writer| {
                writer
                    .payload_params()
                    .find(|params| params.spec().codec == Codec::Opus)
                    .map(|params| params.pt())
            })
            .ok_or_else(|| "offer does not accept Opus".to_owned())?;

        let decoder = Decoder::new(SAMPLE_RATE, Channels::Mono)
            .map_err(|_| "Opus decoder could not be created".to_owned())?;
        let mut encoder = Encoder::new(SAMPLE_RATE, Channels::Mono, Application::LowDelay)
            .map_err(|_| "Opus encoder could not be created".to_owned())?;
        encoder
            .set_bitrate(Bitrate::Bits(64_000))
            .and_then(|()| encoder.set_vbr(false))
            .and_then(|()| encoder.set_inband_fec(false))
            .map_err(|_| "Opus encoder could not be configured".to_owned())?;

        Ok((
            Self {
                pack_id,
                rtc,
                mid,
                pt,
                decoder,
                encoder,
                rx: VecDeque::with_capacity(MAX_QUEUED * 2),
                primed: false,
                channel: None,
                outbound: VecDeque::new(),
                connected: false,
                closed: None,
                connect_deadline: now + CONNECT_TIMEOUT,
                next_timeout: now,
                sent_frames: 0,
                packet: vec![0; 1_275],
                scratch: vec![0.0; MAX_DECODE],
            },
            answer,
        ))
    }

    pub fn next_deadline(&self) -> Instant {
        if self.connected {
            self.next_timeout
        } else {
            self.next_timeout.min(self.connect_deadline)
        }
    }

    pub fn close(&mut self, reason: &'static str) {
        if self.closed.is_none() {
            self.closed = Some(reason);
            self.rtc.disconnect();
        }
    }

    pub fn receive(
        &mut self,
        now: Instant,
        source: SocketAddr,
        destination: SocketAddr,
        contents: &[u8],
    ) -> bool {
        let Ok(receive) = Receive::new(Protocol::Udp, source, destination, contents) else {
            return false;
        };
        let input = Input::Receive(now, receive);
        if !self.rtc.accepts(&input) {
            return false;
        }
        if self.rtc.handle_input(input).is_err() {
            self.close("rtc-error");
        }
        true
    }

    pub fn handle_timeout(&mut self, now: Instant) {
        if !self.connected && now >= self.connect_deadline {
            self.close("connect-timeout");
            return;
        }
        if now >= self.next_timeout && self.rtc.handle_input(Input::Timeout(now)).is_err() {
            self.close("rtc-error");
        }
    }

    /// Queue a JSON text message for this peer's data channel.
    pub fn send_json(&mut self, text: String) {
        self.outbound.push_back(text);
        self.flush_outbound();
    }

    fn flush_outbound(&mut self) {
        let Some(id) = self.channel else { return };
        while let Some(text) = self.outbound.front() {
            let sent = self
                .rtc
                .channel(id)
                .map(|mut channel| channel.write(false, text.as_bytes()));
            match sent {
                Some(Ok(_)) => {
                    self.outbound.pop_front();
                }
                _ => break,
            }
        }
    }

    /// Takes one 10 ms frame of this peer's microphone, or `None` on underrun.
    pub fn take_frame(&mut self, out: &mut [f32; FRAME]) -> bool {
        if !self.primed {
            if self.rx.len() >= PRIME_SAMPLES {
                self.primed = true;
            } else {
                return false;
            }
        }
        if self.rx.len() < FRAME {
            self.primed = false;
            return false;
        }
        for sample in out.iter_mut() {
            *sample = self.rx.pop_front().unwrap_or(0.0);
        }
        true
    }

    /// Encodes and sends this peer's mixed frame.
    pub fn send_frame(&mut self, mix: &[f32; FRAME], now: Instant) {
        if !self.connected || self.closed.is_some() {
            return;
        }
        let Ok(length) = self.encoder.encode_float(mix, &mut self.packet) else {
            self.close("encoder-error");
            return;
        };
        let time = MediaTime::new(self.sent_frames * FRAME as u64, Frequency::FORTY_EIGHT_KHZ);
        self.sent_frames += 1;
        let pt = self.pt;
        let written = self
            .rtc
            .writer(self.mid)
            .map(|writer| writer.write(pt, now, time, self.packet[..length].to_vec()));
        if !matches!(written, Some(Ok(()))) {
            self.close("rtc-error");
        }
    }

    pub fn poll(
        &mut self,
        transmit: &mut dyn FnMut(Transmit<'_>),
        events: &mut Vec<PeerEvent>,
    ) {
        loop {
            match self.rtc.poll_output() {
                Ok(Output::Timeout(timeout)) => {
                    self.next_timeout = timeout;
                    break;
                }
                Ok(Output::Transmit(packet)) => transmit(Transmit {
                    source: packet.source,
                    destination: packet.destination,
                    contents: &packet.contents,
                }),
                Ok(Output::Event(event)) => match event {
                    Event::Connected if self.closed.is_none() => {
                        self.connected = true;
                        events.push(PeerEvent::Connected);
                    }
                    Event::IceConnectionStateChange(IceConnectionState::Disconnected) => {
                        self.close("disconnected");
                    }
                    Event::MediaData(media) => self.decode(&media.data),
                    Event::ChannelOpen(id, _) => {
                        self.channel = Some(id);
                        self.flush_outbound();
                    }
                    Event::ChannelClose(_) => self.channel = None,
                    Event::ChannelData(data) if !data.binary => {
                        if let Ok(message) = serde_json::from_slice::<PeerMessage>(&data.data) {
                            events.push(PeerEvent::Message(message));
                        }
                    }
                    _ => {}
                },
                Err(_) => {
                    self.close("rtc-error");
                    break;
                }
            }
            if !self.rtc.is_alive() {
                break;
            }
        }
        if let Some(reason) = self.closed {
            events.push(PeerEvent::Closed(reason));
        }
    }

    fn decode(&mut self, data: &[u8]) {
        let Ok(count) = self.decoder.decode_float(data, &mut self.scratch, false) else {
            return;
        };
        self.rx.extend(&self.scratch[..count]);
        if self.rx.len() > MAX_QUEUED {
            let drop = self.rx.len() - TRIM_TO;
            self.rx.drain(..drop);
        }
    }
}
