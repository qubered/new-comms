import type {
  MediaSessionResponse,
  PortPeerMessage,
  PortLiveState,
} from "@comms/protocol";
import { continuousOpus } from "./opus.ts";
import { canChooseSpeaker, loadPrefs, savePrefs } from "./audioPrefs.ts";

export type StationPeerState = Omit<PortLiveState, "lastCaller"> & {
  type: "state";
  lastCaller?: string | null;
};

export type Status = "connecting" | "connected" | "reconnecting" | "error";

export interface IntercomHandlers {
  onStatus(status: Status, detail?: string): void;
  onState(state: StationPeerState): void;
  /** The microphone became available or unavailable. Listening carries on either way. */
  onMic?(available: boolean): void;
}

const NO_HANDLERS: IntercomHandlers = { onStatus() {}, onState() {} };
// A 0.1 s silent WAV: playing it inside the tap unlocks audio output on iOS Safari.
const SILENCE =
  "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAgLsAAIC7AAACABAAZGF0YQAAAAA=";

class FatalError extends Error {}

const BACKOFF = [400, 800, 1500, 2500, 4000];
const ICE_WAIT_MS = 1500;
const PING_MS = 1000;
/** No message from the router for this long means the link is dead, whatever ICE says. */
const SILENCE_MS = 3500;
/** A hidden tab (locked screen) is throttled by the browser, so it is given far longer. */
const HIDDEN_SILENCE_MS = 15_000;

// Timers on a hidden page are throttled, sometimes to once a minute. A worker's are not, so the
// heartbeat that keeps a locked phone connected runs there.
const TICKER = `setInterval(() => postMessage(0), ${PING_MS});`;

/**
 * One phone's connection to the mix-router: a mic track up, a mixed track down, and a
 * reliable data channel for keying. Reconnects on its own; every reconnect starts with
 * nothing keyed (the server drops keys when the session dies).
 *
 * Listening never depends on the microphone: with no mic (blocked, unplugged, or suspended by
 * the OS while the screen is locked) the session still joins and plays the mix.
 */
export class Intercom {
  private pc?: RTCPeerConnection;
  private channel?: RTCDataChannel;
  private sender?: RTCRtpSender;
  private sessionId?: string;
  private mic?: MediaStream;
  private micEnabled = true;
  private micRequest = 0;
  private pendingMic?: { deviceId?: string; result: Promise<boolean> };
  private silenceContext?: AudioContext;
  private silenceStream?: MediaStream;
  private stopped = false;
  private attempt = 0;
  private retry?: ReturnType<typeof setTimeout>;
  private readonly audio: HTMLAudioElement;
  private wake?: WakeLockSentinel;
  private ticker?: Worker;
  private tickerUrl?: string;
  private lastRx = performance.now();
  private label = "Talk";

  /** Subscribers; the latest values are also kept so a late subscriber can catch up. */
  handlers: IntercomHandlers = NO_HANDLERS;
  status: Status = "connecting";
  detail?: string;
  lastState?: StationPeerState;
  micAvailable = false;
  /** Test hooks (latency tool): a synthetic microphone, and a look at the mixed audio coming back. */
  micOverride?: MediaStream;
  onRemoteStream?: (stream: MediaStream) => void;

  constructor(
    private readonly packId: string,
    private pin: string | undefined,
  ) {
    this.audio = document.createElement("audio");
    this.audio.autoplay = true;
    this.audio.setAttribute("playsinline", "");
    // If the OS pauses us (a call, another app), take the audio back as soon as we are allowed.
    this.audio.addEventListener("pause", this.onAudioPaused);
    document.body.appendChild(this.audio);
    document.addEventListener("visibilitychange", this.onVisibility);
    window.addEventListener("online", this.onOnline);
    window.addEventListener("offline", this.onOffline);
    navigator.mediaDevices?.addEventListener?.(
      "devicechange",
      this.onDeviceChange,
    );
  }

  /** Shown on the lock screen next to the playback controls. */
  setLabel(label: string): void {
    this.label = label;
    this.publishMediaSession();
  }

  /** Call synchronously inside the tap that picked the pack. */
  unlockAudio(): void {
    this.ensureSilence();
    this.audio.src = SILENCE;
    void this.audio.play().catch(() => {});
  }

  /** Asks for the mic and connects. `pin` may be supplied here once it has been verified. */
  async start(pin?: string): Promise<void> {
    if (this.stopped) return;
    // Keep this before every await: Safari requires audio creation/resume in the tap.
    this.ensureSilence();
    if (pin) this.pin = pin;
    this.startTicker();
    this.enterAudioSession();
    void this.applySpeaker();
    if (this.micOverride) {
      this.mic = this.micOverride;
      this.setMic(true);
    } else {
      // Permission prompts may remain unanswered forever. Listening must start now.
      void this.acquireMic(loadPrefs().inputId);
    }
    if (this.stopped) return;
    void this.audio.play().catch(() => {});
    void this.holdScreenAwake();
    this.publishMediaSession();
    void this.connect();
  }

  stop(): void {
    this.stopped = true;
    this.micRequest += 1;
    clearTimeout(this.retry);
    document.removeEventListener("visibilitychange", this.onVisibility);
    window.removeEventListener("online", this.onOnline);
    window.removeEventListener("offline", this.onOffline);
    navigator.mediaDevices?.removeEventListener?.(
      "devicechange",
      this.onDeviceChange,
    );
    this.audio.removeEventListener("pause", this.onAudioPaused);
    this.teardown();
    if (!this.micOverride)
      this.mic?.getTracks().forEach((track) => track.stop());
    this.silenceStream?.getTracks().forEach((track) => track.stop());
    void this.silenceContext?.close();
    this.audio.remove();
    this.ticker?.terminate();
    if (this.tickerUrl) URL.revokeObjectURL(this.tickerUrl);
    void this.wake?.release().catch(() => {});
    try {
      navigator.mediaSession.playbackState = "none";
      navigator.mediaSession.metadata = null;
      for (const action of ["play", "pause"] as const)
        navigator.mediaSession.setActionHandler(action, null);
      const session = (
        navigator as Navigator & { audioSession?: { type: string } }
      ).audioSession;
      if (session) session.type = "auto";
    } catch {
      /* not supported */
    }
  }

  private setStatus(status: Status, detail?: string) {
    this.status = status;
    this.detail = detail;
    this.handlers.onStatus(status, detail);
  }

  private setMic(available: boolean) {
    if (this.micAvailable === available) return;
    this.micAvailable = available;
    this.handlers.onMic?.(available);
  }

  send(message: PortPeerMessage): boolean {
    if (this.channel?.readyState !== "open") return false;
    this.channel.send(JSON.stringify(message));
    return true;
  }

  setMicEnabled(enabled: boolean): void {
    if (enabled === this.micEnabled) return;
    this.micEnabled = enabled;
    this.mic?.getAudioTracks().forEach((track) => (track.enabled = enabled));
    void this.sender
      ?.replaceTrack(
        enabled && this.micAvailable
          ? this.mic!.getAudioTracks()[0]!
          : this.ensureSilence().getAudioTracks()[0]!,
      )
      .catch(() => {});
  }

  /** A real audio sender remains active even without capture, keeping WiFi downlink awake. */
  private ensureSilence(): MediaStream {
    if (!this.silenceStream) {
      const context = new AudioContext({
        latencyHint: "interactive",
        sampleRate: 48000,
      });
      const source = context.createConstantSource();
      source.offset.value = 0;
      const destination = context.createMediaStreamDestination();
      source.connect(destination);
      source.start();
      this.silenceContext = context;
      this.silenceStream = destination.stream;
    }
    void this.silenceContext?.resume().catch(() => {});
    return this.silenceStream;
  }

  // ---- devices ----

  /**
   * Opens a microphone (the named one if it is still there, otherwise the default) and, if we
   * are already connected, swaps it in without renegotiating. Returns whether one was opened.
   */
  async acquireMic(deviceId?: string): Promise<boolean> {
    if (this.stopped) return false;
    if (this.micOverride) return true;
    if (this.pendingMic?.deviceId === deviceId && this.pendingMic)
      return this.pendingMic.result;
    const request = ++this.micRequest;
    const capture = this.acquireMicNow(deviceId, request);
    // Let device controls recover even when a permission prompt is left open. The capture
    // may still complete later; acquireMicNow adopts it only while this request is current.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const result = Promise.race([
      capture,
      new Promise<boolean>((resolve) => {
        timer = setTimeout(() => resolve(false), 8000);
      }),
    ]).finally(() => clearTimeout(timer));
    this.pendingMic = { deviceId, result };
    void capture.finally(() => {
      if (request === this.micRequest) this.pendingMic = undefined;
    });
    return result;
  }

  private async acquireMicNow(
    deviceId: string | undefined,
    request: number,
  ): Promise<boolean> {
    const base = {
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    };
    let stream: MediaStream | undefined;
    for (const audio of deviceId
      ? [{ ...base, deviceId: { ideal: deviceId } }, base]
      : [base]) {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio });
        break;
      } catch {
        if (this.stopped || request !== this.micRequest) return false;
        /* try the default, then give up */
      }
    }
    if (!stream) {
      if (this.stopped || request !== this.micRequest) return false;
      this.setMic(false);
      if (!this.stopped)
        void this.sender
          ?.replaceTrack(this.ensureSilence().getAudioTracks()[0]!)
          .catch(() => {});
      return false;
    }
    if (this.stopped || request !== this.micRequest) {
      stream.getTracks().forEach((track) => track.stop());
      return false;
    }
    const track = stream
      .getAudioTracks()
      .find((candidate) => candidate.readyState === "live");
    if (!track) {
      stream.getTracks().forEach((candidate) => candidate.stop());
      return false;
    }
    const previous = this.mic;
    this.mic = stream;
    track.enabled = this.micEnabled;
    // If the device disappears, or the OS ends capture, listening carries on without it.
    track.addEventListener("ended", () => {
      if (this.mic === stream && !this.stopped) {
        this.setMic(false);
        void this.sender
          ?.replaceTrack(this.ensureSilence().getAudioTracks()[0]!)
          .catch(() => {});
      }
    });
    track.addEventListener("mute", () => {
      if (this.mic !== stream || this.stopped) return;
      this.setMic(false);
      void this.sender
        ?.replaceTrack(this.ensureSilence().getAudioTracks()[0]!)
        .catch(() => {});
    });
    track.addEventListener("unmute", () => {
      if (this.mic !== stream || this.stopped) return;
      this.setMic(true);
      if (this.micEnabled)
        void this.sender?.replaceTrack(track).catch(() => {});
    });
    if (this.sender)
      await this.sender
        .replaceTrack(
          this.micEnabled && !track.muted
            ? track
            : this.ensureSilence().getAudioTracks()[0]!,
        )
        .catch(() => {});
    previous?.getTracks().forEach((old) => old.stop());
    if (this.stopped || request !== this.micRequest) {
      stream.getTracks().forEach((candidate) => candidate.stop());
      return false;
    }
    const available = track.readyState === "live" && !track.muted;
    this.setMic(available);
    return available;
  }

  /** Switch microphone. The choice is remembered for next time. */
  async setInputDevice(deviceId: string): Promise<boolean> {
    savePrefs({ inputId: deviceId || undefined });
    return this.acquireMic(deviceId || undefined);
  }

  /** Switch speaker, where the browser allows it. */
  async setOutputDevice(deviceId: string): Promise<void> {
    savePrefs({ outputId: deviceId || undefined });
    await this.applySpeaker();
  }

  private async applySpeaker(): Promise<void> {
    const sink = this.audio as HTMLAudioElement & {
      setSinkId?: (id: string) => Promise<void>;
    };
    if (!canChooseSpeaker() || !sink.setSinkId) return;
    try {
      await sink.setSinkId(loadPrefs().outputId ?? "");
    } catch {
      /* the saved speaker is gone: stay on the default */
    }
  }

  private onDeviceChange = () => {
    // A microphone that was unplugged ends its track; take whatever is available now.
    if (
      !this.stopped &&
      !this.micOverride &&
      (!this.micAvailable ||
        this.mic?.getAudioTracks()[0]?.readyState === "ended")
    ) {
      void this.acquireMic(loadPrefs().inputId);
    }
    void this.applySpeaker();
  };

  // ---- staying alive with the screen locked ----

  private startTicker() {
    if (this.ticker) return;
    try {
      this.tickerUrl = URL.createObjectURL(
        new Blob([TICKER], { type: "application/javascript" }),
      );
      this.ticker = new Worker(this.tickerUrl);
      this.ticker.onmessage = () => this.tick();
    } catch {
      // No workers (unusual): fall back to a page timer, which is throttled when hidden.
      const timer = setInterval(
        () => (this.stopped ? clearInterval(timer) : this.tick()),
        PING_MS,
      );
    }
  }

  private tick() {
    const channel = this.channel;
    if (this.stopped || !channel || channel.readyState !== "open") return;
    const hidden = document.visibilityState === "hidden";
    if (
      performance.now() - this.lastRx >
      (hidden ? HIDDEN_SILENCE_MS : SILENCE_MS)
    )
      return this.drop();
    channel.send(JSON.stringify({ type: "ping", hidden }));
  }

  /** Tell the OS this page is a call, so audio keeps playing and recording is allowed. */
  private enterAudioSession() {
    try {
      const session = (
        navigator as Navigator & { audioSession?: { type: string } }
      ).audioSession;
      if (session) session.type = "play-and-record";
    } catch {
      /* not supported */
    }
  }

  /** Lock-screen and notification controls. Pause is refused: listening should not stop by accident. */
  private publishMediaSession() {
    try {
      const session = navigator.mediaSession;
      if (!session) return;
      session.metadata = new MediaMetadata({
        title: this.label,
        artist: "Intercom",
        artwork: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
        ],
      });
      session.playbackState = "playing";
      session.setActionHandler(
        "play",
        () => void this.audio.play().catch(() => {}),
      );
      session.setActionHandler(
        "pause",
        () => void this.audio.play().catch(() => {}),
      );
    } catch {
      /* not supported */
    }
  }

  private onAudioPaused = () => {
    if (this.stopped || !this.audio.srcObject) return;
    setTimeout(() => void this.audio.play().catch(() => {}), 250);
  };

  /** WiFi went away: do not wait for ICE to notice. Keys drop now; we retry when it is back. */
  private onOffline = () => {
    if (this.stopped) return;
    clearTimeout(this.retry);
    this.teardown();
    this.setStatus("reconnecting");
  };

  private onVisibility = () => {
    if (this.stopped || document.visibilityState !== "visible") return;
    void this.silenceContext?.resume().catch(() => {});
    void this.holdScreenAwake();
    // iOS suspends playback while the tab is hidden and does not always resume it.
    if (this.audio.srcObject) void this.audio.play().catch(() => {});
    // Capture is often suspended while locked; bring the microphone back if it went away.
    if (
      !this.micOverride &&
      (!this.micAvailable ||
        this.mic?.getAudioTracks()[0]?.readyState === "ended")
    ) {
      void this.acquireMic(loadPrefs().inputId);
    }
    if (!this.stopped && this.pc?.connectionState !== "connected")
      this.reconnectNow();
    else if (performance.now() - this.lastRx > SILENCE_MS) this.reconnectNow();
  };

  private onOnline = () => {
    if (!this.stopped && this.pc?.connectionState !== "connected")
      this.reconnectNow();
  };

  private async holdScreenAwake() {
    try {
      if (this.wake && !this.wake.released) return;
      this.wake = await navigator.wakeLock?.request("screen");
    } catch {
      /* not supported, or the tab is hidden: harmless */
    }
  }

  private teardown() {
    const pc = this.pc;
    const id = this.sessionId;
    this.pc = undefined;
    this.channel = undefined;
    this.sender = undefined;
    this.sessionId = undefined;
    this.lastState = undefined;
    if (pc) {
      pc.onconnectionstatechange = null;
      pc.close();
    }
    if (id)
      void fetch(`/api/v2/media/sessions/${id}`, {
        method: "DELETE",
        keepalive: true,
      }).catch(() => {});
  }

  private reconnectNow() {
    clearTimeout(this.retry);
    this.attempt = 0;
    this.drop();
  }

  /** Called whenever the link is lost or judged dead. Keys are already off server-side. */
  private drop() {
    if (this.stopped) return;
    this.teardown();
    this.setStatus("reconnecting");
    const delay = BACKOFF[Math.min(this.attempt, BACKOFF.length - 1)]!;
    this.attempt += 1;
    clearTimeout(this.retry);
    this.retry = setTimeout(() => void this.connect(), delay);
  }

  private async connect() {
    if (this.stopped) return;
    const pc = new RTCPeerConnection({ iceServers: [] });
    this.pc = pc;
    try {
      // Always a send-and-receive audio line, even with no microphone yet: listening needs it,
      // and a microphone found later can be swapped in without renegotiating.
      const stream =
        this.micEnabled &&
        this.micAvailable &&
        this.mic?.getAudioTracks().some((t) => t.readyState === "live")
          ? this.mic
          : this.ensureSilence();
      this.sender = pc.addTransceiver(stream.getAudioTracks()[0]!, {
        direction: "sendrecv",
        streams: [stream],
      }).sender;
      const channel = pc.createDataChannel("control", { ordered: true });
      this.channel = channel;
      this.lastRx = performance.now();

      pc.ontrack = (event) => {
        const stream = event.streams[0] ?? new MediaStream([event.track]);
        this.audio.srcObject = stream;
        this.onRemoteStream?.(stream);
        // Ask for the smallest playout buffer the browser will give us.
        const receiver = event.receiver as RTCRtpReceiver & {
          jitterBufferTarget?: number | null;
          playoutDelayHint?: number;
        };
        try {
          receiver.jitterBufferTarget = 0;
          receiver.playoutDelayHint = 0;
        } catch {
          /* unsupported */
        }
        void this.audio.play().catch(() => {});
        void this.applySpeaker();
      };
      channel.onmessage = (event) => {
        this.lastRx = performance.now();
        try {
          const message = JSON.parse(String(event.data)) as StationPeerState;
          if (message.type === "state") {
            this.lastState = message;
            this.handlers.onState(message);
          }
        } catch {
          /* ignore */
        }
      };
      channel.onclose = () => {
        if (this.pc === pc) this.drop();
      };
      let disconnectTimer: ReturnType<typeof setTimeout> | undefined;
      pc.onconnectionstatechange = () => {
        if (this.pc !== pc) return;
        clearTimeout(disconnectTimer);
        if (pc.connectionState === "failed" || pc.connectionState === "closed")
          this.drop();
        // "disconnected" often heals by itself; give it a moment before giving up.
        if (pc.connectionState === "disconnected")
          disconnectTimer = setTimeout(
            () => this.pc === pc && this.drop(),
            2000,
          );
      };

      const offer = await pc.createOffer();
      offer.sdp = continuousOpus(offer.sdp!);
      await pc.setLocalDescription(offer);
      await iceGatheringComplete(pc);

      const response = await fetch("/api/v2/media/sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          portId: this.packId,
          pin: this.pin,
          offer: pc.localDescription!.sdp,
        }),
      });
      if (!response.ok) {
        const detail =
          ((await response.json().catch(() => ({}))) as { error?: string })
            .error ?? `HTTP ${response.status}`;
        if (
          response.status === 403 ||
          response.status === 404 ||
          response.status === 409
        )
          throw new FatalError(detail);
        throw new Error(detail);
      }
      const { sessionId, answer } =
        (await response.json()) as MediaSessionResponse;
      if (this.pc !== pc) {
        void fetch(`/api/v2/media/sessions/${sessionId}`, {
          method: "DELETE",
        }).catch(() => {});
        return;
      }
      this.sessionId = sessionId;
      await pc.setRemoteDescription({ type: "answer", sdp: answer });

      await new Promise<void>((resolve, reject) => {
        if (channel.readyState === "open") return resolve();
        const timer = setTimeout(() => reject(new Error("timed out")), 8000);
        channel.addEventListener("open", () => {
          clearTimeout(timer);
          resolve();
        });
        pc.addEventListener("connectionstatechange", () => {
          if (pc.connectionState === "failed") {
            clearTimeout(timer);
            reject(new Error("connection failed"));
          }
        });
      });
      if (this.stopped || this.pc !== pc) return;
      this.attempt = 0;
      this.lastRx = performance.now();
      this.setStatus("connected");
    } catch (error) {
      if (this.stopped || this.pc !== pc) return;
      if (error instanceof FatalError) {
        this.teardown();
        this.setStatus(
          "error",
          error.message === "wrong PIN" ? "Wrong PIN." : error.message,
        );
        return;
      }
      this.drop();
    }
  }
}

function iceGatheringComplete(pc: RTCPeerConnection): Promise<void> {
  if (pc.iceGatheringState === "complete") return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      pc.removeEventListener("icegatheringstatechange", check);
      clearTimeout(timer);
      resolve();
    };
    const check = () => pc.iceGatheringState === "complete" && done();
    const timer = setTimeout(done, ICE_WAIT_MS);
    pc.addEventListener("icegatheringstatechange", check);
  });
}
