//! Line-delimited JSON between the gateway (stdin/stdout) and mix-router, plus the
//! data-channel messages phones and nodes send.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{self, Write};
use std::net::IpAddr;

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

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum PgmListen {
    Always,
    Toggle,
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
    #[serde(default = "default_pgm_listen")]
    pub pgm_listen: PgmListen,
}

fn default_pgm_listen() -> PgmListen {
    PgmListen::Always
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PackConfig {
    pub id: String,
    #[serde(rename = "type")]
    pub kind: PackType,
    pub master_volume: f32,
    pub keys: Vec<KeyConfig>,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "cmd", rename_all = "camelCase")]
pub enum Command {
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
    #[serde(rename_all = "camelCase")]
    PgmListen { channel_id: String, on: bool },
}

#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PackState {
    pub pack_id: String,
    pub keyed: HashMap<String, bool>,
    pub mic_off: bool,
    pub pgm_on: HashMap<String, bool>,
    pub volumes: HashMap<String, f32>,
    pub master_volume: f32,
}

#[derive(Serialize)]
#[serde(tag = "event", rename_all = "camelCase")]
pub enum Event<'a> {
    Ready,
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
    Levels { levels: &'a HashMap<String, f32> },
}

pub fn emit(event: &Event<'_>) {
    let mut out = io::stdout().lock();
    if serde_json::to_writer(&mut out, event).is_ok() {
        let _ = out.write_all(b"\n");
        let _ = out.flush();
    }
}
