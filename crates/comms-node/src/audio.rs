//! Device I/O via cpal: independent mono queues for selected hardware channels,
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

fn config_for(device: &Device, input: bool) -> Result<(StreamConfig, SampleFormat), String> {
    let mut ranges: Vec<_> = if input {
        device.supported_input_configs().map_err(|e| e.to_string())?.collect()
    } else {
        device.supported_output_configs().map_err(|e| e.to_string())?.collect()
    };
    ranges.retain(|r| r.min_sample_rate().0 <= RATE && r.max_sample_rate().0 >= RATE);
    // Prefer the config with the most channels so every interface input/output is reachable.
    ranges.sort_by_key(|r| std::cmp::Reverse(r.channels()));
    let range = ranges.into_iter().next().ok_or("device has no 48 kHz configuration")?;
    Ok((range.with_sample_rate(SampleRate(RATE)).config(), range.sample_format()))
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
    let input_channels = input.as_ref().and_then(|d| config_for(d, true).ok()).map_or(0, |(c, _)| c.channels);
    let output_channels = output.as_ref().and_then(|d| config_for(d, false).ok()).map_or(0, |(c, _)| c.channels);
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
        let channels = config_for(&device, true).map_or(0, |(c, _)| c.channels);
        println!("  {} ({} channels at 48 kHz)", device.name().unwrap_or_default(), channels);
    }
    println!("Output devices:");
    for device in host.output_devices().into_iter().flatten() {
        let channels = config_for(&device, false).map_or(0, |(c, _)| c.channels);
        println!("  {} ({} channels at 48 kHz)", device.name().unwrap_or_default(), channels);
    }
}

/// One queue per active, zero-based hardware channel. A single stream owns the interface.
pub type ChannelQueues = Vec<(usize, Queue)>;

fn input_stream<T>(device: &Device, config: &StreamConfig, queues: ChannelQueues) -> Result<Stream, String>
where T: SizedSample + Send + 'static, f32: FromSample<T>, {
    let channels = config.channels as usize;
    device.build_input_stream(config, move |data: &[T], _| {
        capture_samples(data, channels, &queues);
    }, |error| eprintln!("capture stream error: {error}"), None).map_err(|e| e.to_string())
}

fn capture_samples<T: Copy>(data: &[T], channels: usize, queues: &ChannelQueues)
where f32: FromSample<T> {
        for (channel, queue) in queues {
            if let Ok(mut queue) = queue.try_lock() {
                queue.extend(data.chunks_exact(channels).map(|frame| f32::from_sample(frame[*channel])));
                if queue.len() > MAX_CAPTURE { let excess = queue.len() - MAX_CAPTURE; queue.drain(..excess); }
            }
        }
}

fn output_stream<T>(device: &Device, config: &StreamConfig, queues: ChannelQueues) -> Result<Stream, String>
where T: SizedSample + FromSample<f32> + Send + 'static, {
    let channels = config.channels as usize;
    device.build_output_stream(config, move |data: &mut [T], _| {
        playback_samples(data, channels, &queues);
    }, |error| eprintln!("playback stream error: {error}"), None).map_err(|e| e.to_string())
}

fn playback_samples<T: Sample + FromSample<f32>>(data: &mut [T], channels: usize, queues: &ChannelQueues) {
        data.fill(T::from_sample(0.0));
        for (channel, queue) in queues {
            if let Ok(mut queue) = queue.try_lock() {
                for frame in data.chunks_exact_mut(channels) {
                    frame[*channel] = T::from_sample(queue.pop_front().unwrap_or(0.0));
                }
            }
        }
}

fn validate_channels(queues: &ChannelQueues, channels: u16) -> Result<(), String> {
    let mut selected = std::collections::HashSet::new();
    if queues.iter().any(|(c, _)| *c >= channels as usize || !selected.insert(*c)) {
        return Err("selected channel is unavailable or duplicated".into());
    }
    Ok(())
}

pub fn start_capture(device: &Device, queues: ChannelQueues) -> Result<Stream, String> {
    let (config, format) = config_for(device, true)?;
    validate_channels(&queues, config.channels)?;
    let stream = match format {
        SampleFormat::I8 => input_stream::<i8>(device, &config, queues),
        SampleFormat::I16 => input_stream::<i16>(device, &config, queues),
        SampleFormat::I32 => input_stream::<i32>(device, &config, queues),
        SampleFormat::I64 => input_stream::<i64>(device, &config, queues),
        SampleFormat::U8 => input_stream::<u8>(device, &config, queues),
        SampleFormat::U16 => input_stream::<u16>(device, &config, queues),
        SampleFormat::U32 => input_stream::<u32>(device, &config, queues),
        SampleFormat::U64 => input_stream::<u64>(device, &config, queues),
        SampleFormat::F32 => input_stream::<f32>(device, &config, queues),
        SampleFormat::F64 => input_stream::<f64>(device, &config, queues),
        _ => return Err("unsupported capture sample format".into()),
    }?;
    stream.play().map_err(|e| e.to_string())?;
    Ok(stream)
}

pub fn start_playback(device: &Device, queues: ChannelQueues) -> Result<Stream, String> {
    let (config, format) = config_for(device, false)?;
    validate_channels(&queues, config.channels)?;
    let stream = match format {
        SampleFormat::I8 => output_stream::<i8>(device, &config, queues),
        SampleFormat::I16 => output_stream::<i16>(device, &config, queues),
        SampleFormat::I32 => output_stream::<i32>(device, &config, queues),
        SampleFormat::I64 => output_stream::<i64>(device, &config, queues),
        SampleFormat::U8 => output_stream::<u8>(device, &config, queues),
        SampleFormat::U16 => output_stream::<u16>(device, &config, queues),
        SampleFormat::U32 => output_stream::<u32>(device, &config, queues),
        SampleFormat::U64 => output_stream::<u64>(device, &config, queues),
        SampleFormat::F32 => output_stream::<f32>(device, &config, queues),
        SampleFormat::F64 => output_stream::<f64>(device, &config, queues),
        _ => return Err("unsupported playback sample format".into()),
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

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn routes_sparse_channels_independently_and_silences_unused_outputs() {
        let in3 = new_queue(); let in1 = new_queue();
        capture_samples(&[1.0f32, 2.0, 3.0, 4.0, 5.0, 6.0], 3, &vec![(2, in3.clone()), (0, in1.clone())]);
        assert_eq!(*in3.lock().unwrap(), VecDeque::from([3.0, 6.0]));
        assert_eq!(*in1.lock().unwrap(), VecDeque::from([1.0, 4.0]));
        let mut output = [99.0f32; 21];
        playback_samples(&mut output, 7, &vec![(6, in3), (1, in1)]);
        assert_eq!(output, [0.0,1.0,0.0,0.0,0.0,0.0,3.0, 0.0,4.0,0.0,0.0,0.0,0.0,6.0, 0.0,0.0,0.0,0.0,0.0,0.0,0.0]);
    }
    #[test]
    fn rejects_missing_channels_instead_of_aliasing_to_last_channel() {
        assert!(validate_channels(&vec![(2, new_queue())], 2).is_err());
        assert!(validate_channels(&vec![(0, new_queue()), (0, new_queue())], 2).is_err());
    }
}
