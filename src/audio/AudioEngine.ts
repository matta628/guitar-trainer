import type { AudioFrameContext } from "../types";

interface AudioEngineOptions {
  fftSize?: number;
  onFrame?: (freqData: Float32Array, ctx: AudioFrameContext) => void;
}

export class AudioEngine {
  private fftSize: number;
  private onFrame: AudioEngineOptions["onFrame"];
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private running = false;
  private _rafId: number | null = null;

  constructor({ fftSize = 4096, onFrame }: AudioEngineOptions = {}) {
    this.fftSize = fftSize;
    this.onFrame = onFrame;
  }

  async start(): Promise<this> {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      video: false,
    });

    this.audioContext = new AudioContext();
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = this.fftSize;
    this.analyser.smoothingTimeConstant = 0.3;

    this.source = this.audioContext.createMediaStreamSource(stream);
    this.source.connect(this.analyser);

    this.running = true;
    this._poll();
    return this;
  }

  stop(): void {
    this.running = false;
    if (this._rafId) cancelAnimationFrame(this._rafId);
    if (this.audioContext) this.audioContext.close();
  }

  private _poll(): void {
    if (!this.running || !this.analyser || !this.audioContext) return;

    const bufferLength = this.analyser.frequencyBinCount;
    const freqData = new Float32Array(bufferLength);
    this.analyser.getFloatFrequencyData(freqData);

    this.onFrame?.(freqData, {
      sampleRate: this.audioContext.sampleRate,
      bufferLength,
      fftSize: this.fftSize,
    });

    this._rafId = requestAnimationFrame(() => this._poll());
  }

  get sampleRate(): number {
    return this.audioContext?.sampleRate ?? 44100;
  }

  get binFrequency(): number {
    return this.sampleRate / this.fftSize;
  }
}
