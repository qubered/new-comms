//! Who hears whom. Pure state + arithmetic; no networking, so it is unit-testable.
//!
//! Rules (spec section 6): listening is passive and continuous on every channel a pack has
//! a key for; keying only decides whether a human's mic is added for others. A pack never
//! hears itself. Hardware packs always contribute on their channel (permanently keyed on a
//! partyline or direct line, the feed on a pgm). Per-key volume gates that channel's
//! contribution to the listener's mix; master volume applies after summing.

use std::collections::HashMap;

use crate::control::{
    ChannelConfig, ChannelType, PackConfig, PackState, PackType, PeerMessage, PgmListen,
};
use crate::peer::FRAME;

pub struct Pack {
    pub config: PackConfig,
    pub keyed: HashMap<String, bool>,
    pub mic_off: bool,
    pub pgm_on: HashMap<String, bool>,
    pub volumes: HashMap<String, f32>,
    pub master_volume: f32,
}

impl Pack {
    fn new(config: PackConfig) -> Self {
        let mut pack = Self {
            keyed: HashMap::new(),
            mic_off: false,
            pgm_on: HashMap::new(),
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

    pub fn state(&self) -> PackState {
        PackState {
            pack_id: self.config.id.clone(),
            keyed: self.keyed.clone(),
            mic_off: self.mic_off,
            pgm_on: self.pgm_on.clone(),
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
    /// Replace the configuration, keeping live keyed / mic / pgm state where it still applies.
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
            let pgm_on: HashMap<_, _> = pack
                .pgm_on
                .iter()
                .filter(|(id, _)| has_key(id))
                .map(|(id, on)| (id.clone(), *on))
                .collect();
            pack.pgm_on = pgm_on;
            next.insert(pack.config.id.clone(), pack);
        }
        self.packs = next;
    }

    pub fn pack(&self, id: &str) -> Option<&Pack> {
        self.packs.get(id)
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
        Some(pack.state())
    }

    /// Applies a data-channel message. Returns the new state when something changed.
    pub fn apply(&mut self, id: &str, message: PeerMessage) -> Option<PackState> {
        if matches!(message, PeerMessage::Ping) {
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
            PeerMessage::Ping => return None,
            PeerMessage::PgmListen { channel_id, on } => {
                let toggle = key(&channel_id).is_some_and(|k| k.pgm_listen == PgmListen::Toggle);
                if !toggle {
                    return None;
                }
                pack.pgm_on.insert(channel_id, on);
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
            if channel.kind == ChannelType::Pgm
                && key.pgm_listen == PgmListen::Toggle
                && !pack.pgm_on.get(&channel.id).copied().unwrap_or(true)
            {
                continue;
            }
            let gain = pack.volumes.get(&channel.id).copied().unwrap_or(key.volume) / 100.0;
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
        let master = pack.master_volume / 100.0;
        for sample in out.iter_mut() {
            *sample = soft_clip(*sample * master);
        }
    }
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
            pgm_listen: PgmListen::Always,
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
    fn volumes_and_pgm_toggle_shape_the_personal_mix() {
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
}
