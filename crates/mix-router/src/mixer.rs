//! Who hears whom. Pure state + arithmetic; no networking, so it is unit-testable.
//!
//! Rules (spec section 6): listening is passive and continuous on every channel a pack has
//! a key for; keying only decides whether a human's mic is added for others. A pack never
//! hears itself. Hardware packs always contribute on their channel (permanently keyed on a
//! partyline or direct line, the feed on a pgm). Per-key volume gates that channel's
//! contribution to the listener's mix; master volume applies after summing.

use std::collections::HashMap;

use crate::control::{
    ChannelConfig, ChannelType, PackConfig, PackState, PackType, PeerMessage,
};
use crate::peer::FRAME;

pub struct Pack {
    pub config: PackConfig,
    pub keyed: HashMap<String, bool>,
    pub mic_off: bool,
    pub loopback: bool,
    pub volumes: HashMap<String, f32>,
    pub master_volume: f32,
}

impl Pack {
    fn new(config: PackConfig) -> Self {
        let mut pack = Self {
            keyed: HashMap::new(),
            mic_off: false,
            loopback: false,
            volumes: HashMap::new(),
            master_volume: config.master_volume,
            config,
        };
        pack.reset_volumes();
        pack
    }

    fn reset_volumes(&mut self) {
        self.master_volume = self.config.master_volume;
        self.volumes = self
            .config
            .keys
            .iter()
            .map(|key| (key.channel_id.clone(), key.volume))
            .collect();
    }

    /// Linear gain of a hardware node's output trim (what it is sent).
    fn output_gain(&self) -> f32 {
        self.config.device.as_ref().map_or(1.0, |d| db_to_gain(d.output_trim))
    }

    pub fn state(&self) -> PackState {
        PackState {
            pack_id: self.config.id.clone(),
            keyed: self.keyed.clone(),
            mic_off: self.mic_off,
            volumes: self.volumes.clone(),
            master_volume: self.master_volume,
        }
    }
}

#[derive(Default)]
pub struct Mixer {
    channels: HashMap<String, ChannelConfig>,
    packs: HashMap<String, Pack>,
}

impl Mixer {
    /// Replace the configuration, keeping live keyed / mic state where it still applies.
    pub fn configure(&mut self, channels: Vec<ChannelConfig>, packs: Vec<PackConfig>) {
        self.channels = channels
            .into_iter()
            .map(|channel| (channel.id.clone(), channel))
            .collect();
        let mut next = HashMap::new();
        for config in packs {
            let mut pack = match self.packs.remove(&config.id) {
                Some(mut existing) => {
                    existing.config = config;
                    existing.reset_volumes();
                    existing
                }
                None => Pack::new(config),
            };
            let has_key = |id: &str| pack.config.keys.iter().any(|key| key.channel_id == id);
            let keyed: HashMap<_, _> = pack
                .keyed
                .iter()
                .filter(|(id, on)| **on && has_key(id))
                .map(|(id, on)| (id.clone(), *on))
                .collect();
            pack.keyed = keyed;
            next.insert(pack.config.id.clone(), pack);
        }
        self.packs = next;
    }

    pub fn pack(&self, id: &str) -> Option<&Pack> {
        self.packs.get(id)
    }

    /// Linear gain of a hardware node's input trim (what it sends in).
    pub fn input_gain(&self, id: &str) -> f32 {
        self.packs
            .get(id)
            .and_then(|pack| pack.config.device.as_ref())
            .map_or(1.0, |device| db_to_gain(device.input_trim))
    }

    pub fn is_hardware(&self, id: &str) -> bool {
        self.packs
            .get(id)
            .is_some_and(|pack| pack.config.kind == PackType::Hardware)
    }

    /// A pack that disconnects releases everything it had keyed.
    pub fn release(&mut self, id: &str) -> Option<PackState> {
        let pack = self.packs.get_mut(id)?;
        pack.keyed.clear();
        pack.loopback = false;
        Some(pack.state())
    }

    /// Applies a data-channel message. Returns the new state when something changed.
    pub fn apply(&mut self, id: &str, message: PeerMessage) -> Option<PackState> {
        if matches!(message, PeerMessage::Ping { .. }) {
            return None;
        }
        let channels = &self.channels;
        let pack = self.packs.get_mut(id)?;
        if pack.config.kind == PackType::Hardware {
            return None;
        }
        let key = |channel_id: &str| pack.config.keys.iter().find(|k| k.channel_id == channel_id);
        match message {
            PeerMessage::Key { channel_id, on } => {
                let talkable = channels
                    .get(&channel_id)
                    .is_some_and(|channel| channel.kind != ChannelType::Pgm);
                if !talkable || key(&channel_id).is_none() {
                    return None;
                }
                let on = on && !pack.mic_off;
                if pack.keyed.get(&channel_id).copied().unwrap_or(false) == on {
                    return None;
                }
                pack.keyed.insert(channel_id, on);
            }
            PeerMessage::MicOff { on } => {
                if on {
                    pack.keyed.clear();
                }
                pack.mic_off = on;
            }
            PeerMessage::Volume { channel_id, volume } => {
                key(&channel_id)?;
                pack.volumes.insert(channel_id, volume.clamp(0.0, 100.0));
            }
            PeerMessage::MasterVolume { volume } => pack.master_volume = volume.clamp(0.0, 100.0),
            PeerMessage::Ping { .. } => return None,
            PeerMessage::Loopback { on } => {
                pack.loopback = on;
                return None;
            }
        }
        Some(pack.state())
    }

    /// Does `id` add its microphone to `channel` right now?
    fn contributes(&self, id: &str, channel: &ChannelConfig) -> bool {
        let Some(pack) = self.packs.get(id) else {
            return false;
        };
        match pack.config.kind {
            PackType::Hardware => true,
            PackType::Human => {
                channel.kind != ChannelType::Pgm
                    && !pack.mic_off
                    && pack.keyed.get(&channel.id).copied().unwrap_or(false)
            }
        }
    }

    /// Is this pack's microphone open on anything? Used for the talking indicator.
    pub fn is_talking(&self, id: &str) -> bool {
        let Some(pack) = self.packs.get(id) else {
            return false;
        };
        pack.config.kind == PackType::Human
            && !pack.mic_off
            && pack.keyed.values().any(|on| *on)
    }

    /// Builds what `listener` hears from this tick's microphone frames.
    pub fn mix_for(
        &self,
        listener: &str,
        frames: &HashMap<String, [f32; FRAME]>,
        out: &mut [f32; FRAME],
    ) {
        out.fill(0.0);
        let Some(pack) = self.packs.get(listener) else {
            return;
        };
        for key in &pack.config.keys {
            let Some(channel) = self.channels.get(&key.channel_id) else {
                continue;
            };
            // PGM and hardware packs have no level control: they hear everything at full level.
            let gain = if channel.kind == ChannelType::Pgm || pack.config.kind == PackType::Hardware {
                1.0
            } else {
                pack.volumes.get(&channel.id).copied().unwrap_or(key.volume) / 100.0
            };
            if gain <= 0.0 {
                continue;
            }
            for member in &channel.members {
                if member == listener || !self.contributes(member, channel) {
                    continue;
                }
                if let Some(frame) = frames.get(member) {
                    for (sum, sample) in out.iter_mut().zip(frame) {
                        *sum += sample * gain;
                    }
                }
            }
        }
        if pack.loopback {
            if let Some(own) = frames.get(listener) {
                for (sum, sample) in out.iter_mut().zip(own) {
                    *sum += sample;
                }
            }
        }
        let master = pack.master_volume / 100.0 * pack.output_gain();
        for sample in out.iter_mut() {
            *sample = soft_clip(*sample * master);
        }
    }
}

pub fn db_to_gain(db: f32) -> f32 {
    10.0_f32.powf(db.clamp(-24.0, 24.0) / 20.0)
}

/// Transparent below about 0.7, then a smooth knee toward +/-1 so a crowd never wraps.
fn soft_clip(x: f32) -> f32 {
    const KNEE: f32 = 0.7;
    let a = x.abs();
    if a <= KNEE {
        x
    } else {
        let over = (a - KNEE) / (1.0 - KNEE);
        x.signum() * (KNEE + (1.0 - KNEE) * over.tanh())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::control::KeyConfig;

    fn key(channel: &str) -> KeyConfig {
        KeyConfig {
            channel_id: channel.into(),
            volume: 100.0,
        }
    }

    fn pack(id: &str, kind: PackType, keys: &[&str]) -> PackConfig {
        PackConfig {
            id: id.into(),
            kind,
            master_volume: 100.0,
            keys: keys.iter().map(|c| key(c)).collect(),
            device: None,
        }
    }

    fn setup() -> Mixer {
        let mut mixer = Mixer::default();
        mixer.configure(
            vec![
                ChannelConfig {
                    id: "prod".into(),
                    kind: ChannelType::Partyline,
                    members: vec!["a".into(), "b".into(), "c".into()],
                },
                ChannelConfig {
                    id: "pgm".into(),
                    kind: ChannelType::Pgm,
                    members: vec!["a".into(), "feed".into()],
                },
            ],
            vec![
                pack("a", PackType::Human, &["prod", "pgm"]),
                pack("b", PackType::Human, &["prod"]),
                pack("c", PackType::Human, &["prod"]),
                pack("feed", PackType::Hardware, &["pgm"]),
            ],
        );
        mixer
    }

    fn frames(values: &[(&str, f32)]) -> HashMap<String, [f32; FRAME]> {
        values
            .iter()
            .map(|(id, v)| ((*id).to_owned(), [*v; FRAME]))
            .collect()
    }

    fn press(mixer: &mut Mixer, id: &str, channel: &str, on: bool) {
        mixer.apply(
            id,
            PeerMessage::Key {
                channel_id: channel.into(),
                on,
            },
        );
    }

    #[test]
    fn unkeyed_packs_are_not_heard_and_nobody_hears_themselves() {
        let mut mixer = setup();
        let f = frames(&[("a", 0.1), ("b", 0.2), ("c", 0.0)]);
        let mut out = [0.0; FRAME];
        mixer.mix_for("c", &f, &mut out);
        assert_eq!(out[0], 0.0);

        press(&mut mixer, "a", "prod", true);
        press(&mut mixer, "b", "prod", true);
        mixer.mix_for("c", &f, &mut out);
        assert!((out[0] - 0.3).abs() < 1e-6);
        mixer.mix_for("a", &f, &mut out); // n-1: only b
        assert!((out[0] - 0.2).abs() < 1e-6);
        mixer.mix_for("b", &f, &mut out); // n-1: only a
        assert!((out[0] - 0.1).abs() < 1e-6);
    }

    #[test]
    fn listening_is_passive_and_mic_kill_drops_keys() {
        let mut mixer = setup();
        press(&mut mixer, "b", "prod", true);
        let f = frames(&[("b", 0.2)]);
        let mut out = [0.0; FRAME];
        mixer.mix_for("c", &f, &mut out); // c never keyed but hears b
        assert!((out[0] - 0.2).abs() < 1e-6);

        mixer.apply("b", PeerMessage::MicOff { on: true });
        mixer.mix_for("c", &f, &mut out);
        assert_eq!(out[0], 0.0);
        press(&mut mixer, "b", "prod", true); // blocked while mic is off
        assert!(!mixer.pack("b").unwrap().keyed.get("prod").copied().unwrap_or(false));
    }

    #[test]
    fn hardware_feed_always_plays_on_pgm_and_listeners_cannot_talk_into_it() {
        let mut mixer = setup();
        let f = frames(&[("feed", 0.25), ("a", 0.5)]);
        let mut out = [0.0; FRAME];
        mixer.mix_for("a", &f, &mut out);
        assert!((out[0] - 0.25).abs() < 1e-6);
        assert!(mixer
            .apply(
                "a",
                PeerMessage::Key {
                    channel_id: "pgm".into(),
                    on: true
                }
            )
            .is_none());
    }

    #[test]
    fn master_volume_scales_the_personal_mix() {
        let mut mixer = setup();
        press(&mut mixer, "b", "prod", true);
        mixer.apply(
            "c",
            PeerMessage::MasterVolume { volume: 50.0 },
        );
        let f = frames(&[("b", 0.2)]);
        let mut out = [0.0; FRAME];
        mixer.mix_for("c", &f, &mut out);
        assert!((out[0] - 0.1).abs() < 1e-6);
    }

    #[test]
    fn release_clears_keyed_state() {
        let mut mixer = setup();
        press(&mut mixer, "b", "prod", true);
        let state = mixer.release("b").unwrap();
        assert!(state.keyed.is_empty());
    }

    #[test]
    fn pgm_and_hardware_ignore_key_levels_and_trims_apply_at_the_node() {
        use crate::control::DeviceConfig;
        let mut mixer = Mixer::default();
        let mut node = pack("rack", PackType::Hardware, &["prod", "pgm"]);
        node.device = Some(DeviceConfig { input: None, output: None, input_trim: 6.0, output_trim: -6.0 });
        let mut person = pack("p", PackType::Human, &["prod", "pgm"]);
        person.keys[0].volume = 50.0;
        person.keys[1].volume = 0.0; // a pgm mapping has no level: this must be ignored
        mixer.configure(
            vec![
                ChannelConfig { id: "prod".into(), kind: ChannelType::Partyline, members: vec!["p".into(), "rack".into()] },
                ChannelConfig { id: "pgm".into(), kind: ChannelType::Pgm, members: vec!["rack".into(), "p".into()] },
            ],
            vec![person, node],
        );
        let f = frames(&[("rack", 0.1)]);
        let mut out = [0.0; FRAME];
        // The person hears the node on prod at 50% and on pgm at full: 0.05 + 0.1.
        mixer.mix_for("p", &f, &mut out);
        assert!((out[0] - 0.15).abs() < 1e-6, "{}", out[0]);
        // The node hears the person's keyed mic at full level (no key level), then output trim -6 dB.
        press(&mut mixer, "p", "prod", true);
        let f = frames(&[("p", 0.2)]);
        mixer.mix_for("rack", &f, &mut out);
        assert!((out[0] - 0.2 * db_to_gain(-6.0)).abs() < 1e-5, "{}", out[0]);
        assert!((mixer.input_gain("rack") - db_to_gain(6.0)).abs() < 1e-6);
        assert_eq!(mixer.input_gain("p"), 1.0);
        assert!((db_to_gain(24.0) - 15.848).abs() < 0.01 && (db_to_gain(-24.0) - 0.0631).abs() < 0.001);
        assert_eq!(db_to_gain(60.0), db_to_gain(24.0), "trim is clamped to +/-24 dB");
    }

    #[test]
    fn a_node_can_sit_on_many_channels_and_hears_each_of_them() {
        let mut mixer = Mixer::default();
        let members = |ids: &[&str]| ids.iter().map(|s| s.to_string()).collect::<Vec<_>>();
        let channels = ["a", "b", "c", "d"];
        mixer.configure(
            channels
                .iter()
                .map(|id| ChannelConfig { id: (*id).into(), kind: ChannelType::Partyline, members: members(&["node", &format!("p_{id}")]) })
                .collect(),
            std::iter::once(pack("node", PackType::Hardware, &channels))
                .chain(channels.iter().map(|id| pack(&format!("p_{id}"), PackType::Human, &[id])))
                .collect(),
        );
        for id in channels {
            press(&mut mixer, &format!("p_{id}"), id, true);
        }
        let f = frames(&[("p_a", 0.1), ("p_b", 0.1), ("p_c", 0.1), ("p_d", 0.1)]);
        let mut out = [0.0; FRAME];
        mixer.mix_for("node", &f, &mut out);
        assert!((out[0] - 0.4).abs() < 1e-6);
        // and a person on one channel hears the node's circuit once
        let f = frames(&[("node", 0.1)]);
        mixer.mix_for("p_a", &f, &mut out);
        assert!((out[0] - 0.1).abs() < 1e-6);
    }
}
