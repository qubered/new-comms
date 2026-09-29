import { useEffect, useRef, useState } from "react";
import type { Port } from "@comms/protocol";
import { percentile } from "./latencyStats.ts";
import { Intercom } from "./intercom.ts";

const CLICKS = 20; // bursts

// Runs in the audio thread so detection time is sample-accurate on the same clock that
// scheduled the click.
const DETECTOR = `
class Detector extends AudioWorkletProcessor {
  constructor() { super(); this.quiet = 0; }
  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (channel) {
      for (let i = 0; i < channel.length; i++) {
        if (this.quiet > 0) { this.quiet--; continue; }
        if (Math.abs(channel[i]) > 0.45) {
          this.port.postMessage(currentTime + i / sampleRate);
          this.quiet = sampleRate * 0.4;
        }
      }
    }
    return true;
  }
}
registerProcessor("detector", Detector);
`;

/**
 * Round-trip latency of the software path: a synthetic click is sent up as this pack's
 * microphone, the mixer plays it straight back, and we time its return. It covers the browser's
 * Opus encoder, the network, mix-router, and the browser's jitter buffer and decoder. It does
 * not include a real microphone or speaker, which add their own tens of milliseconds; the
 * physical clap test in the README covers those.
 */
export function Latency({ ports, onBack }: { ports: Port[]; onBack(): void }) {
  const candidates = ports.filter(
    (pack) => pack.type === "station" && !pack.hasPin,
  );
  const [chosen, setPackId] = useState("");
  const packId = candidates.some((pack) => pack.id === chosen)
    ? chosen
    : (candidates[0]?.id ?? "");
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState("");
  const [samples, setSamples] = useState<number[]>([]);
  const active = useRef<() => void>(undefined);

  useEffect(() => () => active.current?.(), []);

  const run = async () => {
    setRunning(true);
    setSamples([]);
    setMessage("Connecting…");
    // Everything that needs the tap's user gesture happens before the first await.
    const intercom = new Intercom(packId, undefined);
    intercom.unlockAudio();
    const context = new AudioContext({ latencyHint: "interactive" });
    void context.resume();
    const emitted: number[] = [];
    const detected: number[] = [];
    const destination = context.createMediaStreamDestination();
    intercom.micOverride = destination.stream;
    let cleanedUp = false;
    const cleanup = () => {
      if (cleanedUp) return;
      cleanedUp = true;
      intercom.stop();
      void context.close();
      setRunning(false);
    };
    active.current = cleanup;

    try {
      const url = URL.createObjectURL(
        new Blob([DETECTOR], { type: "application/javascript" }),
      );
      await context.audioWorklet.addModule(url);
      URL.revokeObjectURL(url);
      if (cleanedUp) return;
      const detector = new AudioWorkletNode(context, "detector");
      detector.port.onmessage = (event) => detected.push(event.data as number);
      intercom.onRemoteStream = (stream) => {
        context.createMediaStreamSource(stream).connect(detector);
        // Nodes only run if they reach the destination, so route through a silent gain.
        const silent = context.createGain();
        silent.gain.value = 0;
        detector.connect(silent).connect(context.destination);
      };

      // A quiet continuous carrier keeps the stream from going silent (browsers stop sending
      // during silence, which would add a talk-spurt start-up to every sample). A loud 30 ms
      // marker on top is what we time.
      const carrier = context.createOscillator();
      carrier.frequency.value = 300;
      const carrierGain = context.createGain();
      carrierGain.gain.value = 0.1;
      carrier.connect(carrierGain).connect(destination);
      carrier.start();
      const click = context.createBuffer(
        1,
        Math.round(context.sampleRate * 0.03),
        context.sampleRate,
      );
      const data = click.getChannelData(0);
      for (let i = 0; i < data.length; i++)
        data[i] = Math.sin((2 * Math.PI * 1000 * i) / context.sampleRate) * 0.9;

      const connected = new Promise<void>((resolve, reject) => {
        const timer = setTimeout(
          () =>
            reject(new Error("Could not join. Is the station already in use?")),
          12_000,
        );
        intercom.handlers = {
          onStatus: (status, detail) => {
            if (status === "connected") {
              clearTimeout(timer);
              resolve();
            }
            if (status === "error") reject(new Error(detail));
          },
          onState: () => {},
        };
        if (intercom.status === "connected") resolve();
      });
      void intercom.start();
      await connected;
      if (cleanedUp) return;
      intercom.send({ type: "loopback", on: true });
      await new Promise((resolve) => setTimeout(resolve, 1200)); // let the return path settle

      for (let n = 0; n < CLICKS; n++) {
        if (cleanedUp) return;
        setMessage(`Measuring… ${n + 1} of ${CLICKS}`);
        const when = context.currentTime + 0.15;
        const source = context.createBufferSource();
        source.buffer = click;
        source.connect(destination);
        source.start(when);
        emitted.push(when);
        await new Promise((resolve) => setTimeout(resolve, 900));
        if (cleanedUp) return;
        const arrival = detected.find((time) => time >= when);
        if (arrival !== undefined)
          setSamples((current) => [...current, (arrival - when) * 1000]);
      }
      setMessage(
        detected.length === 0
          ? "No audio came back. Is the mixer running?"
          : "Done.",
      );
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      cleanup();
    }
  };

  const sorted = [...samples].sort((a, b) => a - b);
  const ms = (value: number) => `${Math.round(value)} ms`;

  return (
    <section className="screen on">
      <div className="top">
        <div className="st">
          <span className="dot" />
          <span>Latency test</span>
        </div>
        <span className="sp" />
        <button
          className="lvbtn"
          onClick={() => (active.current?.(), onBack())}
        >
          Done
        </button>
      </div>
      <div className="scroll">
        <div
          style={{
            padding: "8px 16px 32px",
            display: "flex",
            flexDirection: "column",
            gap: 16,
            color: "var(--fg-2)",
          }}
        >
          <p style={{ margin: 0 }}>
            Sends a quiet tone with a louder marker up as the microphone of a
            station, has the mixer play it back, and times the round trip. It
            measures the browser, network and mixer. A real microphone and
            speaker add more, so use the clap test for the full figure. One way
            below is half the round trip, a rough estimate that assumes
            symmetric paths.
          </p>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            Station to use (it is taken over while the test runs)
            <select
              className="in"
              style={{
                height: 44,
                background: "var(--key)",
                color: "var(--fg)",
                border: 0,
                borderRadius: 8,
                padding: "0 10px",
              }}
              value={packId}
              onChange={(e) => setPackId(e.target.value)}
              disabled={running}
            >
              {candidates.map((pack) => (
                <option key={pack.id} value={pack.id}>
                  {pack.name}
                </option>
              ))}
            </select>
          </label>
          {candidates.length === 0 && (
            <p style={{ margin: 0 }}>
              Add a station without a PIN to test with.
            </p>
          )}
          <button
            className="btn-solid"
            disabled={running || !packId}
            onClick={() => void run()}
          >
            {running ? "Running…" : "Run test"}
          </button>
          <div>{message}</div>
          {sorted.length > 0 && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "auto 1fr",
                gap: "6px 18px",
                color: "var(--fg)",
                fontSize: 18,
              }}
              className="num"
            >
              <span style={{ color: "var(--fg-3)" }}>Round trip, best</span>
              <span>{ms(sorted[0]!)}</span>
              <span style={{ color: "var(--fg-3)" }}>Median</span>
              <span>{ms(percentile(sorted, 0.5))}</span>
              <span style={{ color: "var(--fg-3)" }}>95th percentile</span>
              <span>{ms(percentile(sorted, 0.95))}</span>
              <span style={{ color: "var(--fg-3)" }}>Worst</span>
              <span>{ms(sorted[sorted.length - 1]!)}</span>
              <span style={{ color: "var(--fg-3)" }}>Clicks heard</span>
              <span>
                {sorted.length} of {CLICKS}
              </span>
              <span style={{ color: "var(--fg-3)" }}>One way, about</span>
              <span>{ms(percentile(sorted, 0.5) / 2)}</span>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
