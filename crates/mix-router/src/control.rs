//! Line-delimited JSON between the gateway (stdin/stdout) and mix-router, plus the
//! data-channel messages phones and nodes send.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::Write;
use std::net::{IpAddr, TcpStream};
use std::sync::Mutex;

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ChannelType {
    Partyline,
    Direct,
    Pgm,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum PackType {
    Human,
    Hardware,
}

#[derive(Clone, Debug, Deserialize)]
pub struct ChannelConfig {
    pub id: String,
    #[serde(rename = "type")]
    pub kind: ChannelType,
    pub members: Vec<String>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KeyConfig {
    pub channel_id: String,
    pub volume: f32,
}

#[derive(Clone, Debug, Default, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceConfig {
    pub input: Option<String>,
    pub output: Option<String>,
    /// dB, -24 to +24, applied to what the node sends in.
    #[serde(default)]
    pub input_trim: f32,
    /// dB, -24 to +24, applied to what the node is sent.
    #[serde(default)]
    pub output_trim: f32,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PackConfig {
    pub id: String,
    #[serde(rename = "type")]
    pub kind: PackType,
    pub master_volume: f32,
    pub keys: Vec<KeyConfig>,
    /// Hardware packs only: which interface input/output the node should use.
    #[serde(default)]
    pub device: Option<DeviceConfig>,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "cmd", rename_all = "camelCase")]
pub enum Command {
    /// The first line a gateway sends: it claims the control link.
    Hello,
    #[serde(rename_all = "camelCase")]
    Config {
        channels: Vec<ChannelConfig>,
        packs: Vec<PackConfig>,
    },
    #[serde(rename_all = "camelCase")]
    Open {
        session_id: String,
        pack_id: String,
        offer: String,
        candidate_ip: IpAddr,
    },
    #[serde(rename_all = "camelCase")]
    Close { session_id: String },
}

/// Messages on a peer's reliable data channel.
#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum PeerMessage {
    #[serde(rename_all = "camelCase")]
    Key { channel_id: String, on: bool },
    MicOff { on: bool },
    #[serde(rename_all = "camelCase")]
    Volume { channel_id: String, volume: f32 },
    MasterVolume { volume: f32 },
    /// Test tool: hear your own mic through the mixer (round-trip latency measurement).
    Loopback { on: bool },
    /// Heartbeat: answered with `pong`; silence from a phone for a few seconds ends its session
    /// (longer while `hidden`, when the browser throttles a locked or backgrounded tab).
    Ping {
        #[serde(default)]
        hidden: bool,
    },
}

#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PackState {
    pub pack_id: String,
    pub keyed: HashMap<String, bool>,
    pub mic_off: bool,
    pub volumes: HashMap<String, f32>,
    pub master_volume: f32,
}

#[derive(Serialize)]
#[serde(tag = "event", rename_all = "camelCase")]
pub enum Event<'a> {
    Ready,
    /// Sent on every gateway (re)connect: the sessions that are live right now.
    Sync { sessions: &'a [SyncSession<'a>] },
    #[serde(rename_all = "camelCase")]
    Answer { session_id: &'a str, sdp: &'a str },
    #[serde(rename_all = "camelCase")]
    Rejected { session_id: &'a str, detail: &'a str },
    #[serde(rename_all = "camelCase")]
    Connected { session_id: &'a str, pack_id: &'a str },
    #[serde(rename_all = "camelCase")]
    Closed {
        session_id: &'a str,
        pack_id: &'a str,
        reason: &'a str,
    },
    PackState(&'a PackState),
    /// Mixer health, every two seconds: time spent per 10 ms cycle and peers connected.
    #[serde(rename_all = "camelCase")]
    Stats { tick_avg_us: u32, tick_max_us: u32, peers: usize },
    Levels { levels: &'a HashMap<String, f32> },
}

/// The gateway's control connection. Events are dropped while none is attached; the router
/// keeps mixing, and a reconnecting gateway is brought up to date with a `sync`.
static SINK: Mutex<Option<TcpStream>> = Mutex::new(None);

pub fn set_sink(stream: Option<TcpStream>) {
    if let Ok(mut sink) = SINK.lock() {
        if let Some(old) = sink.take() {
            let _ = old.shutdown(std::net::Shutdown::Both);
        }
        *sink = stream;
    }
}

pub fn emit(event: &Event<'_>) {
    let Ok(mut sink) = SINK.lock() else { return };
    let Some(stream) = sink.as_mut() else { return };
    let mut line = match serde_json::to_vec(event) {
        Ok(line) => line,
        Err(_) => return,
    };
    line.push(b'\n');
    if stream.write_all(&line).is_err() {
        *sink = None;
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncSession<'a> {
    pub session_id: &'a str,
    pub pack_id: &'a str,
}
