//! Device I/O via cpal: one mono channel of capture in, one mono channel of playback out,
//! both at 48 kHz, joined to the network loop by small sample queues.

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{Device, FromSample, Sample, SampleFormat, SampleRate, SizedSample, Stream, StreamConfig};
use std::collections::VecDeque;
use std::sync::{Arc, Mutex};

pub const RATE: u32 = 48_000;
/// Capture backlog beyond this is stale; the network loop is behind, so drop the oldest.
const MAX_CAPTURE: usize = RATE as usize / 5;
const MAX_PLAYBACK: usize = RATE as usize / 5;

pub type Queue = Arc<Mutex<VecDeque<f32>>>;

pub fn new_queue() -> Queue {
    Arc::new(Mutex::new(VecDeque::with_capacity(RATE as usize / 4)))
}

pub struct Devices {
    pub input: Option<Device>,
    pub output: Option<Device>,
    pub name: String,
    pub input_channels: u16,
    pub output_channels: u16,
}

fn find<I: Iterator<Item = Device>>(mut devices: I, name: &str) -> Option<Device> {
    devices.find(|device| device.name().is_ok_and(|n| n == name))
}

fn config_for(device: &Device, input: bool) -> Result<StreamConfig, String> {
    let mut ranges: Vec<_> = if input {
        device.supported_input_configs().map_err(|e| e.to_string())?.collect()
    } else {
        device.supported_output_configs().map_err(|e| e.to_string())?.collect()
    };
    ranges.retain(|r| r.min_sample_rate().0 <= RATE && r.max_sample_rate().0 >= RATE);
    // Prefer the config with the most channels so every interface input/output is reachable.
    ranges.sort_by_key(|r| std::cmp::Reverse(r.channels()));
    let range = ranges.into_iter().next().ok_or("device has no 48 kHz configuration")?;
    Ok(range.with_sample_rate(SampleRate(RATE)).config())
}

/// Finds the named device (or the defaults) and reports its channel counts.
pub fn open_devices(name: Option<&str>) -> Devices {
    let host = cpal::default_host();
    let (input, output) = match name {
        Some(name) => (
            host.input_devices().ok().and_then(|d| find(d, name)),
            host.output_devices().ok().and_then(|d| find(d, name)),
        ),
        None => (host.default_input_device(), host.default_output_device()),
    };
    let input_channels = input.as_ref().and_then(|d| config_for(d, true).ok()).map_or(0, |c| c.channels);
    let output_channels = output.as_ref().and_then(|d| config_for(d, false).ok()).map_or(0, |c| c.channels);
    let name = input
        .as_ref()
        .or(output.as_ref())
        .and_then(|d| d.name().ok())
        .unwrap_or_else(|| "No audio device".to_owned());
    Devices { input, output, name, input_channels, output_channels }
}

pub fn list() {
    let host = cpal::default_host();
    println!("Input devices:");
    for device in host.input_devices().into_iter().flatten() {
        let channels = config_for(&device, true).map_or(0, |c| c.channels);
        println!("  {} ({} channels at 48 kHz)", device.name().unwrap_or_default(), channels);
    }
    println!("Output devices:");
    for device in host.output_devices().into_iter().flatten() {
        let channels = config_for(&device, false).map_or(0, |c| c.channels);
        println!("  {} ({} channels at 48 kHz)", device.name().unwrap_or_default(), channels);
    }
}

/// "In 3" -> 2 (zero-based); anything else -> None.
pub fn channel_of(label: &str, prefix: &str) -> Option<usize> {
    label.strip_prefix(prefix)?.trim().parse::<usize>().ok()?.checked_sub(1)
}

fn input_stream<T>(device: &Device, config: &StreamConfig, channel: usize, queue: Queue) -> Result<Stream, String>
where
    T: SizedSample + Send + 'static,
    f32: FromSample<T>,
{
    let channels = config.channels as usize;
    let channel = channel.min(channels - 1);
    device
        .build_input_stream(
            config,
            move |data: &[T], _| {
                // Never block the audio thread: on contention, drop this callback's audio.
                if let Ok(mut queue) = queue.try_lock() {
                    queue.extend(data.chunks_exact(channels).map(|frame| f32::from_sample(frame[channel])));
                    if queue.len() > MAX_CAPTURE {
                        let excess = queue.len() - MAX_CAPTURE;
                        queue.drain(..excess);
                    }
                }
            },
            |error| eprintln!("capture stream error: {error}"),
            None,
        )
        .map_err(|e| e.to_string())
}

fn output_stream<T>(device: &Device, config: &StreamConfig, channel: usize, queue: Queue) -> Result<Stream, String>
where
    T: SizedSample + FromSample<f32> + Send + 'static,
{
    let channels = config.channels as usize;
    let channel = channel.min(channels - 1);
    device
        .build_output_stream(
            config,
            move |data: &mut [T], _| {
                let mut guard = queue.try_lock().ok();
                for frame in data.chunks_exact_mut(channels) {
                    let sample = guard.as_mut().and_then(|q| q.pop_front()).unwrap_or(0.0);
                    for (index, out) in frame.iter_mut().enumerate() {
                        *out = T::from_sample(if index == channel { sample } else { 0.0 });
                    }
                }
            },
            |error| eprintln!("playback stream error: {error}"),
            None,
        )
        .map_err(|e| e.to_string())
}

pub fn start_capture(device: &Device, channel: usize, queue: Queue) -> Result<Stream, String> {
    let config = config_for(device, true)?;
    let format = device.default_input_config().map(|c| c.sample_format()).unwrap_or(SampleFormat::F32);
    let stream = match format {
        SampleFormat::I16 => input_stream::<i16>(device, &config, channel, queue),
        SampleFormat::I32 => input_stream::<i32>(device, &config, channel, queue),
        _ => input_stream::<f32>(device, &config, channel, queue),
    }?;
    stream.play().map_err(|e| e.to_string())?;
    Ok(stream)
}

pub fn start_playback(device: &Device, channel: usize, queue: Queue) -> Result<Stream, String> {
    let config = config_for(device, false)?;
    let format = device.default_output_config().map(|c| c.sample_format()).unwrap_or(SampleFormat::F32);
    let stream = match format {
        SampleFormat::I16 => output_stream::<i16>(device, &config, channel, queue),
        SampleFormat::I32 => output_stream::<i32>(device, &config, channel, queue),
        _ => output_stream::<f32>(device, &config, channel, queue),
    }?;
    stream.play().map_err(|e| e.to_string())?;
    Ok(stream)
}

/// Adds decoded network audio for playback, keeping the backlog (and so latency) bounded.
pub fn push_playback(queue: &Queue, samples: &[f32]) {
    if let Ok(mut queue) = queue.lock() {
        queue.extend(samples);
        if queue.len() > MAX_PLAYBACK {
            let excess = queue.len() - MAX_PLAYBACK / 3;
            queue.drain(..excess);
        }
    }
}
