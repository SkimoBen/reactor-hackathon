import {
  GoogleGenAI,
  type LiveConnectConfig,
  type LiveServerMessage,
  type Session,
} from "@google/genai";

// Mic → Gemini 3.5 Transcribe Live → text, in the browser.
//
// The mic runs through an AudioWorklet (public/pcm-recorder-worklet.js) that
// emits 100 ms chunks of 16 kHz PCM16, streamed to Gemini over the Live API's
// WebSocket with a single-use ephemeral token from /api/gemini/token, so the
// Gemini API key never reaches the browser. Gemini answers with:
//   - interimInputTranscription: a speculative hypothesis for the utterance in
//     progress (a live caption, never final);
//   - inputTranscription: committed text, emitted at a pause.
//
// A voice note ends with finish(): the mic stops, Gemini is told the audio is
// over, and the transcriber waits briefly for it to commit the last utterance
// before closing. Audio captured before the session is ready is held and sent
// once it is, so the first words aren't lost to the connect handshake.

export type TranscriberStatus =
  | "idle"
  | "starting"
  | "listening"
  | "reconnecting"
  | "finishing"
  | "error";

export interface TranscriberOptions {
  mode: "SMART" | "VERBATIM";
  languages: string[]; // BCP-47; empty = automatic detection
}

export interface TranscriberCallbacks {
  onStatus(status: TranscriberStatus, detail?: string): void;
  onInterim(text: string): void;
  onFinal(text: string): void;
  onLevel(level: number): void;
}

interface TokenResponse {
  token?: string;
  model?: string;
  apiVersion?: string;
  config?: LiveConnectConfig;
  error?: string;
}

const TARGET_RATE = 16000;
const MIME_TYPE = `audio/pcm;rate=${TARGET_RATE}`;
const MAX_HELD_CHUNKS = 100; // 10 s of audio while a session connects
const MAX_FAILURES = 3; // consecutive failed (re)connects before giving up
const TRAILING_SILENCE_CHUNKS = 5; // 500 ms, so the last word reads as ended
const FINISH_GRACE_MS = 4000; // longest finish() waits for the last words
const FINAL_SETTLE_MS = 500; // quiet after a final before finish() resolves

export class LiveTranscriber {
  private readonly callbacks: TranscriberCallbacks;
  private options: TranscriberOptions = { mode: "SMART", languages: [] };
  private active = false;
  private stream: MediaStream | null = null;
  private context: AudioContext | null = null;
  private worklet: AudioWorkletNode | null = null;
  private session: Session | null = null;
  private ready = false; // the current session sent setupComplete
  private held: string[] = [];
  private failures = 0;
  // Bumped on every new session and on stop(); callbacks from a session that
  // is no longer current are ignored.
  private generation = 0;
  // Set while finish() waits for the last words.
  private finishing: (() => void) | null = null;
  private streamEnded = false;
  private finishTimers: ReturnType<typeof setTimeout>[] = [];
  private settleTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(callbacks: TranscriberCallbacks) {
    this.callbacks = callbacks;
  }

  /** Resolves true once the mic is live and the first session is opening. */
  async start(options: TranscriberOptions): Promise<boolean> {
    if (this.active) return false;
    this.active = true;
    this.options = options;
    this.failures = 0;
    this.streamEnded = false;
    this.callbacks.onStatus("starting");
    // stop() bumps the generation; a start cancelled mid-way (say, while the
    // mic permission prompt is open) must not leave the mic running.
    const generation = this.generation;
    try {
      await this.startAudio(generation);
    } catch (err) {
      if (generation === this.generation) {
        this.fail(`Microphone unavailable: ${errorMessage(err)}`);
      }
      return false;
    }
    if (generation !== this.generation) return false;
    void this.openSession();
    return true;
  }

  /**
   * End the note: stop the mic, tell Gemini the audio is over, and wait (up
   * to FINISH_GRACE_MS) for it to commit what was said, then close.
   */
  async finish(): Promise<void> {
    if (!this.active || this.finishing) return;
    this.callbacks.onStatus("finishing");
    this.stopCapture();
    const silence = toBase64(
      new Int16Array((TARGET_RATE / 10) * TRAILING_SILENCE_CHUNKS).buffer,
    );
    this.held.push(silence);
    await new Promise<void>((resolve) => {
      this.finishing = resolve;
      this.finishTimers.push(setTimeout(resolve, FINISH_GRACE_MS));
      this.sendHeld();
    });
    this.stop();
  }

  stop(): void {
    if (!this.active) return;
    this.teardown();
    this.callbacks.onStatus("idle");
  }

  private teardown(): void {
    this.active = false;
    this.generation++;
    this.session?.close();
    this.session = null;
    this.ready = false;
    this.held = [];
    this.stopCapture();
    this.finishTimers.forEach(clearTimeout);
    this.finishTimers = [];
    if (this.settleTimer) clearTimeout(this.settleTimer);
    this.settleTimer = null;
    this.finishing?.();
    this.finishing = null;
  }

  private stopCapture(): void {
    this.worklet?.port.close();
    this.worklet?.disconnect();
    this.worklet = null;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    void this.context?.close();
    this.context = null;
    this.callbacks.onLevel(0);
  }

  private fail(detail: string): void {
    this.teardown();
    this.callbacks.onStatus("error", detail);
  }

  private async startAudio(generation: number): Promise<void> {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    if (generation !== this.generation) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }
    this.stream = stream;
    const context = new AudioContext();
    this.context = context;
    await context.audioWorklet.addModule("/pcm-recorder-worklet.js");
    if (generation !== this.generation) return; // teardown closed it
    await context.resume();
    const source = context.createMediaStreamSource(stream);
    const worklet = new AudioWorkletNode(context, "pcm-recorder", {
      processorOptions: { targetRate: TARGET_RATE },
    });
    worklet.port.onmessage = (
      event: MessageEvent<{ pcm: ArrayBuffer; level: number }>,
    ) => this.onChunk(event.data.pcm, event.data.level);
    // A muted path to the destination keeps the graph pulling the worklet.
    const mute = context.createGain();
    mute.gain.value = 0;
    source.connect(worklet).connect(mute).connect(context.destination);
    this.worklet = worklet;
  }

  private onChunk(pcm: ArrayBuffer, level: number): void {
    if (!this.active || this.finishing) return;
    this.callbacks.onLevel(level);
    this.held.push(toBase64(pcm));
    if (this.held.length > MAX_HELD_CHUNKS) this.held.shift();
    this.sendHeld();
  }

  private sendHeld(): void {
    if (!this.session || !this.ready) return;
    try {
      for (const data of this.held) {
        this.session.sendRealtimeInput({
          audio: { data, mimeType: MIME_TYPE },
        });
      }
      this.held = [];
      if (this.finishing && !this.streamEnded) {
        this.session.sendRealtimeInput({ audioStreamEnd: true });
        this.streamEnded = true;
      }
    } catch {
      // The socket is closing; onclose reconnects and the audio stays held.
    }
  }

  private async openSession(): Promise<void> {
    const generation = ++this.generation;
    this.session = null;
    this.ready = false;
    try {
      const response = await fetch("/api/gemini/token", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(this.options),
      });
      const body = (await response.json()) as TokenResponse;
      if (!response.ok || !body.token || !body.model) {
        throw new Error(
          body.error ?? `Token route returned ${response.status}`,
        );
      }
      if (generation !== this.generation) return;

      const ai = new GoogleGenAI({
        apiKey: body.token,
        httpOptions: { apiVersion: body.apiVersion },
      });
      const session = await ai.live.connect({
        model: body.model,
        config: body.config,
        callbacks: {
          onmessage: (message: LiveServerMessage) => {
            if (generation === this.generation) this.onMessage(message);
          },
          onerror: () => {
            // onclose follows with the code and reason; handled there.
          },
          onclose: (event: CloseEvent) => {
            if (generation === this.generation) this.onClose(event);
          },
        },
      });
      if (generation !== this.generation) {
        session.close();
        return;
      }
      this.session = session;
      this.sendHeld();
    } catch (err) {
      if (generation === this.generation) this.retry(errorMessage(err));
    }
  }

  private onMessage(message: LiveServerMessage): void {
    if (message.setupComplete) {
      this.ready = true;
      this.failures = 0;
      if (!this.finishing) this.callbacks.onStatus("listening");
      this.sendHeld();
    }
    const content = message.serverContent;
    const interim = content?.interimInputTranscription?.text;
    if (interim) this.callbacks.onInterim(interim);
    const final = content?.inputTranscription?.text;
    if (final) {
      this.callbacks.onInterim("");
      this.callbacks.onFinal(final);
      if (this.finishing) {
        // More finals may trail the first; resolve once they go quiet.
        if (this.settleTimer) clearTimeout(this.settleTimer);
        this.settleTimer = setTimeout(() => this.finishing?.(), FINAL_SETTLE_MS);
      }
    }
  }

  private onClose(event: CloseEvent): void {
    this.session = null;
    this.ready = false;
    if (!this.active) return;
    if (this.finishing) {
      this.finishing(); // nothing more is coming
      return;
    }
    const reason = event.reason ? `: ${event.reason}` : "";
    this.retry(`Gemini closed the session (${event.code}${reason})`);
  }

  private retry(detail: string): void {
    this.failures++;
    if (this.failures > MAX_FAILURES) {
      this.fail(detail);
      return;
    }
    this.callbacks.onStatus("reconnecting", detail);
    const generation = this.generation;
    setTimeout(() => {
      if (this.active && generation === this.generation) {
        void this.openSession();
      }
    }, 500 * this.failures);
  }
}

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
