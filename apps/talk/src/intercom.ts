import type { MediaSessionResponse, PeerMessage, PeerState } from "@comms/protocol";

export type Status = "connecting" | "connected" | "reconnecting" | "error";

export interface IntercomHandlers {
  onStatus(status: Status, detail?: string): void;
  onState(state: PeerState): void;
}

const NO_HANDLERS: IntercomHandlers = { onStatus() {}, onState() {} };
// A 0.1 s silent WAV: playing it inside the tap unlocks audio output on iOS Safari.
const SILENCE =
  "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAgLsAAIC7AAACABAAZGF0YQAAAAA=";

class FatalError extends Error {}

const BACKOFF = [400, 800, 1500, 2500, 4000];
const ICE_WAIT_MS = 1500;

/**
 * One phone's connection to the mix-router: a mic track up, a mixed track down, and a
 * reliable data channel for keying. Reconnects on its own; every reconnect starts with
 * nothing keyed (the server drops keys when the session dies).
 */
export class Intercom {
  private pc?: RTCPeerConnection;
  private channel?: RTCDataChannel;
  private sessionId?: string;
  private mic?: MediaStream;
  private stopped = false;
  private attempt = 0;
  private retry?: ReturnType<typeof setTimeout>;
  private readonly audio: HTMLAudioElement;
  private wake?: WakeLockSentinel;

  /** Subscribers; the latest values are also kept so a late subscriber can catch up. */
  handlers: IntercomHandlers = NO_HANDLERS;
  status: Status = "connecting";
  detail?: string;
  lastState?: PeerState;

  constructor(
    private readonly packId: string,
    private pin: string | undefined,
  ) {
    this.audio = document.createElement("audio");
    this.audio.autoplay = true;
    this.audio.setAttribute("playsinline", "");
    document.body.appendChild(this.audio);
    document.addEventListener("visibilitychange", this.onVisibility);
    window.addEventListener("online", this.onOnline);
  }

  /** Call synchronously inside the tap that picked the pack. */
  unlockAudio(): void {
    this.audio.src = SILENCE;
    void this.audio.play().catch(() => {});
  }

  /** Asks for the mic and connects. `pin` may be supplied here once it has been verified. */
  async start(pin?: string): Promise<void> {
    if (pin) this.pin = pin;
    try {
      this.mic = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch {
      this.setStatus("error", "The microphone is blocked. Allow it in your browser settings, then pick your pack again.");
      return;
    }
    void this.audio.play().catch(() => {});
    void this.holdScreenAwake();
    void this.connect();
  }

  stop(): void {
    this.stopped = true;
    clearTimeout(this.retry);
    document.removeEventListener("visibilitychange", this.onVisibility);
    window.removeEventListener("online", this.onOnline);
    this.teardown();
    this.mic?.getTracks().forEach((track) => track.stop());
    this.audio.remove();
    void this.wake?.release().catch(() => {});
  }

  private setStatus(status: Status, detail?: string) {
    this.status = status;
    this.detail = detail;
    this.handlers.onStatus(status, detail);
  }

  send(message: PeerMessage): boolean {
    if (this.channel?.readyState !== "open") return false;
    this.channel.send(JSON.stringify(message));
    return true;
  }

  setMicEnabled(enabled: boolean): void {
    this.mic?.getAudioTracks().forEach((track) => (track.enabled = enabled));
  }

  private onVisibility = () => {
    if (document.visibilityState !== "visible") return;
    void this.holdScreenAwake();
    if (!this.stopped && this.pc?.connectionState !== "connected") this.reconnectNow();
  };

  private onOnline = () => {
    if (!this.stopped && this.pc?.connectionState !== "connected") this.reconnectNow();
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
    this.sessionId = undefined;
    if (pc) {
      pc.onconnectionstatechange = null;
      pc.close();
    }
    if (id) void fetch(`/api/v1/media/sessions/${id}`, { method: "DELETE", keepalive: true }).catch(() => {});
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
    if (this.stopped || !this.mic) return;
    const pc = new RTCPeerConnection({ iceServers: [] });
    this.pc = pc;
    try {
      for (const track of this.mic.getAudioTracks()) pc.addTrack(track, this.mic);
      const channel = pc.createDataChannel("control", { ordered: true });
      this.channel = channel;

      pc.ontrack = (event) => {
        this.audio.srcObject = event.streams[0] ?? new MediaStream([event.track]);
        // Ask for the smallest playout buffer the browser will give us.
        const receiver = event.receiver as RTCRtpReceiver & { jitterBufferTarget?: number | null; playoutDelayHint?: number };
        try {
          receiver.jitterBufferTarget = 0;
          receiver.playoutDelayHint = 0;
        } catch {
          /* unsupported */
        }
        void this.audio.play().catch(() => {});
      };
      channel.onmessage = (event) => {
        try {
          const message = JSON.parse(String(event.data)) as PeerState;
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
        if (pc.connectionState === "failed" || pc.connectionState === "closed") this.drop();
        // "disconnected" often heals by itself; give it a moment before giving up.
        if (pc.connectionState === "disconnected") disconnectTimer = setTimeout(() => this.pc === pc && this.drop(), 2000);
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await iceGatheringComplete(pc);

      const response = await fetch("/api/v1/media/sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ packId: this.packId, pin: this.pin, offer: pc.localDescription!.sdp }),
      });
      if (!response.ok) {
        const detail = ((await response.json().catch(() => ({}))) as { error?: string }).error ?? `HTTP ${response.status}`;
        if (response.status === 403 || response.status === 404 || response.status === 409) throw new FatalError(detail);
        throw new Error(detail);
      }
      const { sessionId, answer } = (await response.json()) as MediaSessionResponse;
      if (this.pc !== pc) {
        void fetch(`/api/v1/media/sessions/${sessionId}`, { method: "DELETE" }).catch(() => {});
        return;
      }
      this.sessionId = sessionId;
      await pc.setRemoteDescription({ type: "answer", sdp: answer });

      await new Promise<void>((resolve, reject) => {
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
      this.attempt = 0;
      this.setStatus("connected");
    } catch (error) {
      if (this.stopped || this.pc !== pc) return;
      if (error instanceof FatalError) {
        this.teardown();
        this.setStatus("error", error.message === "wrong PIN" ? "Wrong PIN." : error.message);
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
