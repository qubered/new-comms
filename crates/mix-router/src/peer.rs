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
use str0m::media::{Direction, Frequency, MediaTime, Mid, Pt};
use str0m::net::{Protocol, Receive};
use str0m::{Candidate, Event, IceConnectionState, Input, Output, Rtc, RtcConfig};

use crate::control::PeerMessage;

pub const SAMPLE_RATE: u32 = 48_000;
pub const FRAME: usize = 240; // 5 ms mixer; Opus downlink remains 10 ms until phone measurements justify 5 ms
const MAX_DECODE: usize = 5_760; // 120 ms
const CONNECT_TIMEOUT: Duration = Duration::from_secs(15);
/// A phone that has opened its data channel pings every second; this much silence means it is gone.
const DEAD_AFTER: Duration = Duration::from_secs(4);
/// A hidden tab (locked screen) is throttled by the browser, so it gets much longer.
const DEAD_AFTER_HIDDEN: Duration = Duration::from_secs(20);
const OPUS_FRAME: usize = 480;
const MAX_QUEUED: usize = 48_000 / 5; // hard ceiling: 200 ms

struct Track {
    port_id: String,
    mid: Mid,
    pt: Option<Pt>,
    receive: bool,
    send: bool,
    decoder: Decoder,
    encoder: Encoder,
    rx: VecDeque<f32>,
    primed: bool,
    last_arrival: Option<Instant>,
    last_samples: usize,
    jitter: VecDeque<usize>,
    target: usize,
    toc: Option<u8>,
    sent_samples: u64,
    packet: Vec<u8>,
    scratch: Vec<f32>,
    downlink: Vec<f32>,
}
impl Track {
    fn new(port_id: String, mid: Mid, pt: Option<Pt>, receive: bool, send: bool) -> Result<Self,String> {
        let decoder=Decoder::new(SAMPLE_RATE,Channels::Mono).map_err(|e| e.to_string())?;
        let mut encoder=Encoder::new(SAMPLE_RATE,Channels::Mono,Application::LowDelay).map_err(|e| e.to_string())?;
        encoder.set_bitrate(Bitrate::Bits(64_000)).and_then(|()|encoder.set_vbr(false)).and_then(|()|encoder.set_inband_fec(false)).and_then(|()|encoder.set_dtx(false)).map_err(|e|e.to_string())?;
        Ok(Self { port_id,mid,pt,receive,send,decoder,encoder,rx:VecDeque::with_capacity(MAX_QUEUED+MAX_DECODE),primed:false,last_arrival:None,last_samples:OPUS_FRAME,jitter:VecDeque::with_capacity(100),target:OPUS_FRAME,toc:None,sent_samples:0,packet:vec![0;1275],scratch:vec![0.0;MAX_DECODE],downlink:Vec::with_capacity(OPUS_FRAME) })
    }
    fn decode(&mut self,data:&[u8],now:Instant) {
        if !self.receive { return; }
        if let Some(toc)=data.first().copied() { if self.toc!=Some(toc) { eprintln!("mix-router: {} Opus TOC 0x{toc:02x}",self.port_id);self.toc=Some(toc); } }
        let Ok(count)=self.decoder.decode_float(data,&mut self.scratch,false) else {return};
        if let Some(last)=self.last_arrival {
            let elapsed=(now.saturating_duration_since(last).as_secs_f64()*SAMPLE_RATE as f64) as usize;
            if self.jitter.len()==100 {self.jitter.pop_front();}
            self.jitter.push_back(elapsed.abs_diff(self.last_samples));
            // Fixed scratch avoids allocation on packet arrival.
            let mut sorted=[0usize;100];
            for (slot,jitter) in sorted.iter_mut().zip(&self.jitter) {*slot=*jitter;}
            sorted[..self.jitter.len()].sort_unstable();
            let p95=sorted[(self.jitter.len()-1)*95/100];
            self.target=(OPUS_FRAME+p95).clamp(OPUS_FRAME,OPUS_FRAME*6);
        }
        self.last_arrival=Some(now);self.last_samples=count;
        self.rx.extend(&self.scratch[..count]);
        if self.rx.len()>MAX_QUEUED { self.rx.drain(..self.rx.len()-MAX_QUEUED); }
    }
    fn take(&mut self,out:&mut [f32;FRAME]) -> bool {
        if !self.receive { return false; }
        if !self.primed { if self.rx.len()<self.target {return false;} self.primed=true; }
        // Drain at most 1 ms each tick; a burst settles without a frame-sized discontinuity.
        if self.rx.len()>self.target+OPUS_FRAME { let drop=(self.rx.len()-self.target-OPUS_FRAME).min(48);self.rx.drain(..drop); }
        if self.rx.len()<FRAME {
            let needed=FRAME-self.rx.len();
            let count=self.decoder.decode_float(&[],&mut self.scratch[..FRAME],false).unwrap_or(0);
            for sample in out.iter_mut() {*sample=self.rx.pop_front().unwrap_or(0.0);}
            if count>=needed {out[FRAME-needed..].copy_from_slice(&self.scratch[..needed]);}
            return true;
        }
        for sample in out {*sample=self.rx.pop_front().unwrap_or(0.0);} true
    }
}

pub enum PeerEvent {
    Connected,
    Closed(&'static str),
    Message(PeerMessage),
    PortMessage(crate::graph::Message),
}

pub struct Transmit<'a> {
    pub source: SocketAddr,
    pub destination: SocketAddr,
    pub contents: &'a [u8],
}

pub struct Peer {
    pub pack_id: String,
    rtc: Rtc,
    tracks: Vec<Track>,
    channel: Option<ChannelId>,
    last_message: Instant,
    background: bool,
    outbound: VecDeque<String>,
    pub connected: bool,
    closed: Option<&'static str>,
    connect_deadline: Instant,
    next_timeout: Instant,

}


impl Peer {
    pub fn open(
        crypto: Arc<CryptoProvider>,
        pack_id: String,
        local: SocketAddr,
        offer_sdp: &str,
        now: Instant,
    ) -> Result<(Self, String), String> {
        Self::open_ports(crypto,pack_id.clone(),local,offer_sdp,now,&[(pack_id,true,true)])
    }

    pub fn open_ports(crypto: Arc<CryptoProvider>, pack_id: String, local: SocketAddr, offer_sdp: &str, now: Instant, ports: &[(String,bool,bool)]) -> Result<(Self,String),String> {
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

        let sections: Vec<_>=answer.split("\r\nm=").skip(1).filter(|s|s.starts_with("audio ")).collect();
        if sections.len()!=ports.len() {return Err(format!("offer needs {} audio sections, one per port",ports.len()));}
        let mut tracks=Vec::with_capacity(ports.len());
        for (section,(port_id,receive,send)) in sections.into_iter().zip(ports) {
            let mid=section.split("\r\n").find_map(|l|l.strip_prefix("a=mid:")).map(Mid::from).ok_or("audio section has no MID")?;
            let direction=rtc.media(mid).ok_or("audio section missing")?.direction();
            let expected=match (*receive,*send) {(true,true)=>Direction::SendRecv,(true,false)=>Direction::RecvOnly,(false,true)=>Direction::SendOnly,_=>return Err("port has no direction".into())};
            if direction!=expected {return Err(format!("wrong audio direction for {port_id}"));}
            let pt=rtc.writer(mid).and_then(|w|w.payload_params().find(|p|p.spec().codec==Codec::Opus).map(|p|p.pt()));
            if *send && pt.is_none() {return Err("offer does not accept Opus".into());}
            tracks.push(Track::new(port_id.clone(),mid,pt,*receive,*send)?);
        }

        Ok((
            Self {
                pack_id,
                rtc,
                tracks,
                channel: None,
                last_message: now,
                background: false,
                outbound: VecDeque::new(),
                connected: false,
                closed: None,
                connect_deadline: now + CONNECT_TIMEOUT,
                next_timeout: now,

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
        if self.connected
            && self.channel.is_some()
            && now.saturating_duration_since(self.last_message) > if self.background { DEAD_AFTER_HIDDEN } else { DEAD_AFTER }
        {
            self.close("timeout");
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

    pub fn ports(&self) -> Vec<(String,bool,bool)> { self.tracks.iter().map(|t|(t.port_id.clone(),t.receive,t.send)).collect() }
    pub fn queue_stats(&self) -> serde_json::Value { serde_json::Value::Array(self.tracks.iter().filter(|t|t.receive).map(|t|serde_json::json!({"portId":t.port_id,"queueMs":t.rx.len() as f32/48.0,"targetMs":t.target as f32/48.0,"toc":t.toc})).collect()) }
    pub fn take_port_frame(&mut self,id:&str,out:&mut [f32;FRAME]) -> bool { self.tracks.iter_mut().find(|t|t.port_id==id).is_some_and(|t|t.take(out)) }
    pub fn take_frame(&mut self,out:&mut [f32;FRAME]) -> bool { self.tracks.first_mut().is_some_and(|t|t.take(out)) }
    pub fn send_frame(&mut self,mix:&[f32;FRAME],now:Instant) {let id=self.pack_id.clone();self.send_port_frame(&id,mix,now);}
    pub fn send_port_frame(&mut self,id:&str,mix:&[f32;FRAME],now:Instant) {
        if !self.connected || self.closed.is_some() {return;}
        let Some(track)=self.tracks.iter_mut().find(|t|t.port_id==id && t.send) else {return};
        track.downlink.extend_from_slice(mix);
        if track.downlink.len()<OPUS_FRAME {return;}
        let length=track.encoder.encode_float(&track.downlink,&mut track.packet);track.downlink.clear();
        let Ok(length)=length else {self.close("encoder-error");return};
        let time=MediaTime::new(track.sent_samples,Frequency::FORTY_EIGHT_KHZ);track.sent_samples+=OPUS_FRAME as u64;
        let Some(pt)=track.pt else {return};
        let written=self.rtc.writer(track.mid).map(|w|w.write(pt,now,time,track.packet[..length].to_vec()));
        if !matches!(written,Some(Ok(()))) {self.close("rtc-error");}
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
                    Event::MediaData(media) => { if let Some(t)=self.tracks.iter_mut().find(|t|t.mid==media.mid) { t.decode(&media.data,Instant::now()); } },
                    Event::ChannelOpen(id, _) => {
                        self.channel = Some(id);
                        self.last_message = Instant::now();
                        self.flush_outbound();
                    }
                    Event::ChannelClose(_) => self.channel = None,
                    Event::ChannelData(data) if !data.binary => {
                        self.last_message = Instant::now();
                        match serde_json::from_slice::<PeerMessage>(&data.data) {
                            Ok(PeerMessage::Ping { hidden }) => {
                                self.background = hidden;
                                self.send_json(r#"{"type":"pong"}"#.to_owned());
                            }
                            Ok(message) => events.push(PeerEvent::Message(message)),
                            Err(_) => { if let Ok(message)=serde_json::from_slice::<crate::graph::Message>(&data.data) {events.push(PeerEvent::PortMessage(message));} }
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

}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn underrun_uses_plc_without_repriming_and_burst_drains() {
        let mut track=Track::new("test".into(),Mid::from("0"),None,true,false).unwrap();
        track.rx.extend([0.1;OPUS_FRAME]);let mut out=[0.0;FRAME];
        assert!(track.take(&mut out));assert!(track.take(&mut out));assert!(track.take(&mut out));assert!(track.primed);
        track.rx.extend([0.1;OPUS_FRAME*8]);
        for tick in 0..180 {if tick%2==0 {track.rx.extend([0.1;OPUS_FRAME]);}assert!(track.take(&mut out));}
        assert!(track.rx.len()<=track.target+OPUS_FRAME,"900 ms must drain burst");
    }
}
