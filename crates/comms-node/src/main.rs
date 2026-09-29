//! comms-node: bridges independent channels of a physical audio interface into the intercom.
//!
//!   comms-node --gateway http://10.0.0.12:8080 --name "Stage rack" [--device "Scarlett 18i20"]
//!   comms-node --list
//!
//! Select channels in Manager → I/O nodes. Each channel in use gets its own mono track.

mod audio;
mod session;

use serde::Deserialize;
use std::sync::mpsc;
use std::net::{IpAddr, ToSocketAddrs, UdpSocket};
use std::thread;
use std::time::Duration;

#[derive(Clone)]
struct Args {
    node_id: String,
    gateway: String,
    name: String,
    device: Option<String>,
}

fn parse_args() -> Option<Args> {
    let mut args = std::env::args().skip(1);
    let mut gateway = "http://localhost:8080".to_owned();
    let mut name = std::env::var("HOSTNAME").unwrap_or_else(|_| "Comms node".to_owned());
    let mut device = None;
    let mut node_id = None;
    while let Some(flag) = args.next() {
        match flag.as_str() {
            "--list" => {
                audio::list();
                return None;
            }
            "--gateway" => gateway = args.next()?,
            "--name" => name = args.next()?,
            "--device" => device = Some(args.next()?),
            "--node-id" => node_id = Some(args.next()?),
            _ => {
                eprintln!("usage: comms-node [--gateway URL] [--name NAME] [--device NAME] [--node-id ID] | --list");
                return None;
            }
        }
    }
    let hostname = std::process::Command::new("hostname").output().ok()
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_owned()).unwrap_or_default();
    let node_id = node_id.unwrap_or_else(|| stable_id(&format!("{hostname}/{name}/{}", device.as_deref().unwrap_or("default"))));
    Some(Args { node_id, gateway: gateway.trim_end_matches('/').to_owned(), name, device })
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

/// Deterministic identity across process and gateway restarts. --node-id overrides it.
fn stable_id(identity: &str) -> String {
    let hash = identity.bytes().fold(0xcbf29ce484222325u64, |h, b| (h ^ b as u64).wrapping_mul(0x100000001b3));
    format!("node-{hash:016x}")
}

#[derive(Deserialize, Clone, Debug)]
pub struct Port {
    id: String,
    #[serde(rename = "type")]
    kind: String,
    hardware: Hardware,
}
#[derive(Deserialize, Clone, Debug)]
struct Hardware { channel: usize }

fn register(args: &Args, inputs: u16, outputs: u16) -> Result<Vec<Port>, String> {
    #[derive(Deserialize)]
    struct Registered { ports: Vec<Port> }
    let ip = local_ip(&args.gateway)?;
    let response: Registered = ureq::post(&format!("{}/api/v2/nodes/register", args.gateway))
        .timeout(Duration::from_secs(3))
        .send_json(serde_json::json!({
            "nodeId": args.node_id, "name": args.name,
            "inputs": labels("In", inputs), "outputs": labels("Out", outputs),
            "address": ip.to_string(),
        })).map_err(|e| e.to_string())?.into_json().map_err(|e| e.to_string())?;
    Ok(response.ports)
}

fn main() {
    let Some(args) = parse_args() else { return };
    let devices = audio::open_devices(args.device.as_deref());
    eprintln!("comms-node \"{}\": device {:?}, {} in, {} out, id {}",
        args.name, devices.name, devices.input_channels, devices.output_channels, args.node_id);
    // HTTP runs outside the media thread: a slow/restarting gateway must not stall audio.
    let (tx, rx) = mpsc::channel();
    let worker_args = args.clone();
    let (inputs, outputs) = (devices.input_channels, devices.output_channels);
    thread::spawn(move || loop {
        if tx.send(register(&worker_args, inputs, outputs)).is_err() { break; }
        thread::sleep(Duration::from_secs(3));
    });
    loop {
        let Ok(update) = rx.recv() else { break };
        match update.and_then(|ports| {
            if ports.is_empty() { return Ok(()); }
            let ip = local_ip(&args.gateway)?;
            session::run(session::Params { gateway: &args.gateway, node_id: &args.node_id,
                local_ip: ip, devices: &devices, ports: &ports, updates: &rx })
        }) {
            Ok(()) => {},
            Err(error) => eprintln!("{error}; waiting for registration before reconnecting"),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn identity_survives_restarts_and_distinguishes_devices() {
        assert_eq!(stable_id("host/rack/interface"), stable_id("host/rack/interface"));
        assert_ne!(stable_id("host/rack/one"), stable_id("host/rack/two"));
    }
    #[test]
    fn registration_retries_keep_identity_and_read_current_in_use_ports() {
        use std::io::{Read, Write};
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let server = thread::spawn(move || {
            for attempt in 0..2 {
                let (mut socket, _) = listener.accept().unwrap();
                socket.set_read_timeout(Some(Duration::from_secs(2))).unwrap();
                let mut bytes = Vec::new();
                let mut chunk = [0u8; 4096];
                let body = loop {
                    let n = socket.read(&mut chunk).unwrap();
                    assert!(n > 0);
                    bytes.extend_from_slice(&chunk[..n]);
                    let text = String::from_utf8_lossy(&bytes);
                    if let Some((headers, body)) = text.split_once("\r\n\r\n") {
                        let length: usize = headers.lines().find_map(|line| line.to_lowercase().strip_prefix("content-length:").map(|n| n.trim().parse().unwrap())).unwrap();
                        if body.len() >= length {
                            assert!(headers.starts_with("POST /api/v2/nodes/register "));
                            break serde_json::from_str::<serde_json::Value>(&body[..length]).unwrap();
                        }
                    }
                };
                assert_eq!(body["nodeId"], "stable-rack");
                assert_eq!(body["inputs"], serde_json::json!(["In 1", "In 2", "In 3"]));
                assert_eq!(body["outputs"].as_array().unwrap().len(), 7);
                let response = if attempt == 0 { r#"{"nodeId":"stable-rack","ports":[]}"# }
                    else { r#"{"nodeId":"stable-rack","ports":[{"id":"in3","type":"input","hardware":{"channel":3,"trim":0}}]}"# };
                write!(socket, "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}", response.len(), response).unwrap();
            }
        });
        let args = Args { gateway: format!("http://{address}"), name: "Rack".into(), device: None, node_id: "stable-rack".into() };
        assert!(register(&args, 3, 7).unwrap().is_empty());
        let ports = register(&args, 3, 7).unwrap();
        assert_eq!(ports[0].hardware.channel, 3);
        server.join().unwrap();
    }

}
