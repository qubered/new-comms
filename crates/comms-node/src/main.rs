//! comms-node: bridges one channel of a physical audio interface into the intercom.
//!
//!   comms-node --gateway http://10.0.0.12:8080 --name "Stage rack" [--device "Scarlett 18i20"]
//!   comms-node --list
//!
//! The node registers itself and appears in Manager -> Hardware. Its input and output are
//! chosen there and pushed to the node over its WebRTC data channel.

mod audio;
mod session;

use serde::Deserialize;
use std::net::{IpAddr, ToSocketAddrs, UdpSocket};
use std::thread;
use std::time::Duration;

struct Args {
    gateway: String,
    name: String,
    device: Option<String>,
}

fn parse_args() -> Option<Args> {
    let mut args = std::env::args().skip(1);
    let mut gateway = "http://localhost:8080".to_owned();
    let mut name = std::env::var("HOSTNAME").unwrap_or_else(|_| "Comms node".to_owned());
    let mut device = None;
    while let Some(flag) = args.next() {
        match flag.as_str() {
            "--list" => {
                audio::list();
                return None;
            }
            "--gateway" => gateway = args.next()?,
            "--name" => name = args.next()?,
            "--device" => device = Some(args.next()?),
            _ => {
                eprintln!("usage: comms-node [--gateway URL] [--name NAME] [--device NAME] | --list");
                return None;
            }
        }
    }
    Some(Args { gateway: gateway.trim_end_matches('/').to_owned(), name, device })
}

/// The local address that routes to the gateway: what we advertise as our ICE candidate.
fn local_ip(gateway: &str) -> Result<IpAddr, String> {
    let host = gateway.trim_start_matches("http://").trim_start_matches("https://");
    let target = if host.contains(':') { host.to_owned() } else { format!("{host}:80") };
    let addresses: Vec<_> = target.to_socket_addrs().map_err(|e| e.to_string())?.collect();
    let address = addresses.iter().find(|a| a.is_ipv4()).or(addresses.first()).ok_or("gateway address did not resolve")?;
    let probe = UdpSocket::bind("0.0.0.0:0").map_err(|e| e.to_string())?;
    probe.connect(*address).map_err(|e| e.to_string())?;
    Ok(probe.local_addr().map_err(|e| e.to_string())?.ip())
}

fn labels(prefix: &str, count: u16) -> Vec<String> {
    (1..=count).map(|n| format!("{prefix} {n}")).collect()
}

fn register(args: &Args, devices: &audio::Devices, ip: IpAddr) -> Result<String, String> {
    #[derive(Deserialize)]
    struct Registered {
        #[serde(rename = "packId")]
        pack_id: String,
    }
    let response: Registered = ureq::post(&format!("{}/api/v1/nodes/register", args.gateway))
        .send_json(serde_json::json!({
            "deviceName": args.name,
            "availableInputs": labels("In", devices.input_channels),
            "availableOutputs": labels("Out", devices.output_channels),
            "address": ip.to_string(),
        }))
        .map_err(|e| e.to_string())?
        .into_json()
        .map_err(|e| e.to_string())?;
    Ok(response.pack_id)
}

fn main() {
    let Some(args) = parse_args() else { return };
    let devices = audio::open_devices(args.device.as_deref());
    eprintln!(
        "comms-node \"{}\": device {:?}, {} in, {} out",
        args.name, devices.name, devices.input_channels, devices.output_channels
    );

    let mut backoff = 1;
    loop {
        match run_once(&args, &devices) {
            Ok(()) => backoff = 1,
            Err(error) => eprintln!("{error}; retrying in {backoff}s"),
        }
        thread::sleep(Duration::from_secs(backoff));
        backoff = (backoff * 2).min(10);
    }
}

/// Register, then run one media session until the link drops. The Manager's input/output
/// choice arrives over the session's data channel and is applied without reconnecting.
fn run_once(args: &Args, devices: &audio::Devices) -> Result<(), String> {
    let ip = local_ip(&args.gateway)?;
    let pack_id = register(args, devices, ip)?;
    eprintln!("registered as pack {pack_id}");
    session::run(session::Params { gateway: &args.gateway, pack_id: &pack_id, local_ip: ip, devices })
}
