//! Real router and real str0m clients; each assertion checks decoded Opus over UDP.
use std::{io::{BufRead,BufReader,Write},net::{TcpListener,TcpStream,UdpSocket,Ipv4Addr,SocketAddr},process::{Command,Child},sync::{Arc,mpsc},time::{Instant,Duration}};
use opus::{Encoder,Decoder,Channels,Application};
use serde_json::{json,Value};
use str0m::{Rtc,RtcConfig,Candidate,Input,Output,Event};
use str0m::{media::{Mid,Direction,MediaKind,MediaTime,Frequency},channel::ChannelId,format::Codec,change::SdpAnswer,net::{Receive,Protocol}};
struct Track { mid:Mid,send:bool,encoder:Encoder,decoder:Decoder,amplitude:f32,phase:f32,samples:u64,heard:Vec<(Instant,f32)> }
struct Client { id:String,rtc:Rtc,socket:UdpSocket,address:SocketAddr,tracks:Vec<Track>,channel:Option<ChannelId>,connected:bool,messages:Vec<String>,last_ping:Instant }
impl Client {
    fn new(id:&str,directions:&[Direction],crypto:Arc<str0m::crypto::CryptoProvider>)->(Self,String,str0m::change::SdpPendingOffer) {
        let socket=UdpSocket::bind((Ipv4Addr::LOCALHOST,0)).unwrap();socket.set_nonblocking(true).unwrap();let address=socket.local_addr().unwrap();
        let mut rtc=RtcConfig::new().set_crypto_provider(crypto).clear_codecs().enable_opus(true).build(Instant::now());rtc.add_local_candidate(Candidate::host(address,"udp").unwrap());
        let mut change=rtc.sdp_api();let tracks=directions.iter().map(|d|Track {mid:change.add_media(MediaKind::Audio,*d,None,None,None),send:matches!(d,Direction::SendOnly|Direction::SendRecv),encoder:Encoder::new(48000,Channels::Mono,Application::LowDelay).unwrap(),decoder:Decoder::new(48000,Channels::Mono).unwrap(),amplitude:0.0,phase:0.0,samples:0,heard:Vec::new()}).collect();
        change.add_channel("control".into());let (offer,pending)=change.apply().unwrap();
        (Self{id:id.into(),rtc,socket,address,tracks,channel:None,connected:false,messages:Vec::new(),last_ping:Instant::now()},offer.to_sdp_string(),pending)
    }
    fn pump(&mut self,now:Instant) {
        let mut buf=[0;2048];while let Ok((len,source))=self.socket.recv_from(&mut buf) {let recv=Receive::new(Protocol::Udp,source,self.address,&buf[..len]).unwrap();let _=self.rtc.handle_input(Input::Receive(now,recv));}
        let _=self.rtc.handle_input(Input::Timeout(now));
        loop {match self.rtc.poll_output().unwrap() {
            Output::Timeout(_)=>break,Output::Transmit(t)=>{let _=self.socket.send_to(&t.contents,t.destination);},
            Output::Event(Event::Connected)=>self.connected=true,
            Output::Event(Event::ChannelOpen(id,_))=>self.channel=Some(id),
            Output::Event(Event::MediaData(d))=>{let t=self.tracks.iter_mut().find(|t|t.mid==d.mid).unwrap();let mut pcm=[0.0;5760];if let Ok(n)=t.decoder.decode_float(&d.data,&mut pcm,false) {let rms=(pcm[..n].iter().map(|s|s*s).sum::<f32>()/n as f32).sqrt();t.heard.push((now,rms));}},
            _=>{}
        }}
        if now.duration_since(self.last_ping)>Duration::from_secs(1) {self.last_ping=now;self.messages.push(json!({"type":"ping"}).to_string());}
        if let Some(id)=self.channel {for message in self.messages.drain(..) {self.rtc.channel(id).unwrap().write(false,message.as_bytes()).unwrap();}}
    }
    fn audio(&mut self,now:Instant) {
        if !self.connected {return;}
        for t in &mut self.tracks {if !t.send {continue;}
            let Some(writer)=self.rtc.writer(t.mid) else {continue};let Some(pt)=writer.payload_params().find(|p|p.spec().codec==Codec::Opus).map(|p|p.pt()) else {continue};
            let mut pcm=[0.0;480];for sample in &mut pcm {*sample=t.phase.sin()*t.amplitude;t.phase=(t.phase+2.0*std::f32::consts::PI*1000.0/48000.0)%(2.0*std::f32::consts::PI);}
            let mut packet=[0;1275];let n=t.encoder.encode_float(&pcm,&mut packet).unwrap();let time=MediaTime::new(t.samples,Frequency::FORTY_EIGHT_KHZ);t.samples+=480;writer.write(pt,now,time,packet[..n].to_vec()).unwrap();
        }
    }
    fn rms(&self,track:usize)->f32 {let h=&self.tracks[track].heard;let tail=&h[h.len().saturating_sub(20)..];assert!(!tail.is_empty(),"{} received no audio on track {track}",self.id);tail.iter().map(|(_,r)|r).sum::<f32>()/tail.len() as f32}
}
struct Harness {child:Child,control:TcpStream,events:mpsc::Receiver<Value>,clients:Vec<Client>,next_audio:Instant}
impl Drop for Harness {fn drop(&mut self){let _=self.child.kill();let _=self.child.wait();}}
impl Harness {
    fn new()->Self {
        let binary=std::env::current_exe().unwrap().parent().unwrap().join("mix-router");let port=TcpListener::bind("127.0.0.1:0").unwrap().local_addr().unwrap().port();let address=format!("127.0.0.1:{port}");let child=Command::new(binary).args(["--control",&address]).spawn().unwrap();
        let control=(0..50).find_map(|_|TcpStream::connect(&address).ok().or_else(||{std::thread::sleep(Duration::from_millis(20));None})).expect("router control");
        let reader=BufReader::new(control.try_clone().unwrap());let(tx,events)=mpsc::channel();std::thread::spawn(move||{for line in reader.lines().map_while(Result::ok){if let Ok(event)=serde_json::from_str(&line){if tx.send(event).is_err(){break;}}}});
        let mut h=Self{child,control,events,clients:Vec::new(),next_audio:Instant::now()};h.send(json!({"cmd":"hello"}));h
    }
    fn send(&mut self,value:Value){writeln!(self.control,"{value}").unwrap();self.control.flush().unwrap();}
    fn configure(&mut self,edges:Vec<Value>){self.send(json!({"cmd":"configPorts","ports":ports(),"crosspoints":edges}));}
    fn connect(&mut self,id:&str,directions:&[Direction]) {
        let(mut client,offer,pending)=Client::new(id,directions,Arc::new(str0m::crypto::from_feature_flags()));self.send(json!({"cmd":"open","sessionId":id,"packId":id,"offer":offer,"candidateIp":"127.0.0.1"}));
        let deadline=Instant::now()+Duration::from_secs(10);let answer=loop {assert!(Instant::now()<deadline,"answer timeout");let event=self.events.recv_timeout(Duration::from_secs(2)).unwrap();assert_ne!(event["event"],"rejected","{event}");if event["event"]=="answer" {break event["sdp"].as_str().unwrap().to_string();}};
        client.rtc.sdp_api().accept_answer(pending,SdpAnswer::from_sdp_string(&answer).unwrap()).unwrap();self.clients.push(client);
    }
    fn run(&mut self,ms:u64){let until=Instant::now()+Duration::from_millis(ms);while Instant::now()<until {let now=Instant::now();for c in &mut self.clients {c.pump(now);}if now>=self.next_audio {for c in &mut self.clients {c.audio(now);}self.next_audio+=Duration::from_millis(10);if now.duration_since(self.next_audio.min(now))>Duration::from_millis(50){self.next_audio=now+Duration::from_millis(10);}}std::thread::sleep(Duration::from_millis(1));}}
    fn key(&mut self,client:usize,key:u8,on:bool){self.clients[client].messages.push(json!({"type":"key","key":key,"on":on}).to_string());}
    fn reset(&mut self){for c in &mut self.clients {for t in &mut c.tracks {t.amplitude=0.0;}for key in 1..=6 {c.messages.push(json!({"type":"key","key":key,"on":false}).to_string());}}}
}
fn ports()->Vec<Value> {
    let mut p:Vec<_>=["a","b","c"].iter().map(|id|json!({"id":id,"type":"station","station":{"masterVolume":100,"volumes":{}},"triggers":(1..=6).map(|key|json!({"kind":"key","key":key})).collect::<Vec<_>>()})).collect();
    for (id,kind,channel) in [("in1","input",1),("in2","input",2),("out1","output",1),("out2","output",2)] {p.push(json!({"id":id,"type":kind,"hardware":{"nodeId":"node","channel":channel,"trim":0}}));}
    p.push(json!({"id":"show","type":"conference"}));p.push(json!({"id":"ifb","type":"ifb","ifb":{"program":"in1","destination":"b","dim":-20}}));p
}
fn edge(s:&str,d:&str,gate:Value,role:&str)->Value{json!({"source":s,"destination":d,"level":0,"gate":gate,"role":role})}
fn key(p:&str,n:u8)->Value{json!({"port":p,"trigger":{"kind":"key","key":n}})}
fn main(){
    let mut h=Harness::new();h.configure(vec![]);
    for id in ["a","b","c"] {h.connect(id,&[Direction::SendRecv]);}
    h.connect("node",&[Direction::SendOnly,Direction::SendOnly,Direction::RecvOnly,Direction::RecvOnly]);h.run(1500);
    assert!(h.clients.iter().all(|c|c.connected&&c.channel.is_some()),"all clients connect");
    h.configure(vec![edge("a","show",key("a",1),"audio"),edge("in1","show",json!("always"),"audio"),edge("show","a",json!("always"),"audio"),edge("show","b",json!("always"),"audio")]);
    h.clients[0].tracks[0].amplitude=0.4;h.key(0,1,true);h.run(600);
    assert!(h.clients[0].rms(0)<0.01,"party line N-1");assert!(h.clients[1].rms(0)>0.2,"keyed party line");assert!(h.clients[2].rms(0)<0.01,"unrouted station");
    h.key(0,1,false);h.clients[3].tracks[0].amplitude=0.2;h.run(600);assert!(h.clients[1].rms(0)>0.1,"Always input into conference");println!("ok: conference N-1, keyed mic, Always input");
    h.reset();h.configure(vec![edge("in2","b",json!({"port":"in2","trigger":{"kind":"vox"}}),"call")]);h.clients[3].tracks[1].amplitude=0.3;h.run(600);assert!(h.clients[1].rms(0)>0.15,"Vox input directly calls station");
    assert!(h.events.try_iter().any(|e|e["event"]=="portState"&&e["portId"]=="b"&&e["incoming"].as_array().is_some_and(|ids|ids.contains(&json!("in2")))&&e["lastCaller"].is_null()),"incoming input name without Reply");println!("ok: Vox hardware call and incoming state");
    h.reset();h.configure(vec![edge("a","b",key("a",2),"call"),edge("a","c",key("a",2),"call")]);h.clients[0].tracks[0].amplitude=0.3;h.key(0,2,true);h.run(600);assert!(h.clients[1].rms(0)>0.15&&h.clients[2].rms(0)>0.15,"group reaches both members");println!("ok: group call");
    h.reset();h.configure(vec![edge("in1","ifb",json!("always"),"program"),edge("a","ifb",key("a",3),"interrupt"),edge("ifb","b",json!("always"),"audio")]);h.clients[3].tracks[0].amplitude=0.4;h.run(600);let program=h.clients[1].rms(0);h.key(0,3,true);h.run(600);let dimmed=h.clients[1].rms(0);assert!(program>0.2&&dimmed<program*0.2&&dimmed>program*0.05,"IFB dim: {program} -> {dimmed}");println!("ok: IFB program dim");
    h.reset();h.configure(vec![edge("in1","b",key("b",4),"audio"),edge("in2","c",key("a",5),"audio")]);h.clients[3].tracks[0].amplitude=0.3;h.clients[3].tracks[1].amplitude=0.3;h.run(600);assert!(h.clients[1].rms(0)<0.01&&h.clients[2].rms(0)<0.01);h.key(1,4,true);h.key(0,5,true);h.run(600);assert!(h.clients[1].rms(0)>0.15&&h.clients[2].rms(0)>0.15);println!("ok: listen key and key owned by another port");
    h.reset();h.configure(vec![edge("in1","out1",json!("always"),"audio"),edge("in2","out2",json!("always"),"audio")]);h.clients[3].tracks[0].amplitude=0.4;h.run(600);assert!(h.clients[3].rms(2)>0.2&&h.clients[3].rms(3)<0.01,"independent first node circuit");h.clients[3].tracks[0].amplitude=0.0;h.clients[3].tracks[1].amplitude=0.2;h.run(600);assert!(h.clients[3].rms(2)<0.01&&h.clients[3].rms(3)>0.1,"independent second node circuit");println!("ok: one node, two independent inputs and outputs");
    h.reset();h.configure(vec![edge("a","b",json!("always"),"call")]);h.run(500);
    for _ in 0..8 {h.clients[0].audio(Instant::now());}
    h.run(900);let _=h.events.try_iter().count();h.send(json!({"cmd":"stats"}));
    let stats=loop {let e=h.events.recv_timeout(Duration::from_secs(2)).unwrap();if e["event"]=="stats" {break e;}};
    let q=stats["queues"].as_array().unwrap().iter().flat_map(|a|a.as_array().unwrap()).find(|q|q["portId"]=="a").unwrap();
    assert!(q["queueMs"].as_f64().unwrap()<=q["targetMs"].as_f64().unwrap()+15.0,"burst failed to drain in 900 ms: {q}");println!("ok: 80 ms packet burst drained in 900 ms ({q})");
    println!("v2 smoke passed");
}
