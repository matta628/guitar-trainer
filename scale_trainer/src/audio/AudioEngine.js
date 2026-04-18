/**
 * AudioEngine.js
 * Handles Web Audio API setup and microphone capture.
 *
 * Architecture:
 *   getUserMedia (mic input)
 *     → MediaStreamSource
 *     → AnalyserNode (FFT)
 *     → polling loop → onFrame(frequencyData)
 *
 * NOTE: This module is intentionally thin — it only captures audio and
 * exposes raw FFT data. All pitch + chord detection logic lives in ChordDetector.js.
 */

export class AudioEngine {
  constructor({ fftSize = 4096, onFrame } = {}) {
    this.fftSize = fftSize;
    this.onFrame = onFrame; // called each animation frame with Float32Array of freq data
    this.audioContext = null;
    this.analyser = null;
    this.source = null;
    this.running = false;
    this._rafId = null;
  }

  /**
   * Requests mic access and starts the audio pipeline.
   * Resolves when the pipeline is running, rejects on permission denial.
   */
  async start() {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        // Disable browser processing — we want the raw guitar signal
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
      video: false,
    });

    this.audioContext = new AudioContext();
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = this.fftSize;
    this.analyser.smoothingTimeConstant = 0.3; // some smoothing to reduce jitter

    this.source = this.audioContext.createMediaStreamSource(stream);
    this.source.connect(this.analyser);

    this.running = true;
    this._poll();

    return this;
  }

  stop() {
    this.running = false;
    if (this._rafId) cancelAnimationFrame(this._rafId);
    if (this.audioContext) this.audioContext.close();
  }

  _poll() {
    if (!this.running) return;

    const bufferLength = this.analyser.frequencyBinCount; // fftSize / 2
    const freqData = new Float32Array(bufferLength);
    this.analyser.getFloatFrequencyData(freqData); // values in dB

    if (this.onFrame) {
      this.onFrame(freqData, {
        sampleRate: this.audioContext.sampleRate,
        bufferLength,
        fftSize: this.fftSize,
      });
    }

    this._rafId = requestAnimationFrame(() => this._poll());
  }

  get sampleRate() {
    return this.audioContext?.sampleRate ?? 44100;
  }

  get binFrequency() {
    // Hz per FFT bin
    return this.sampleRate / this.fftSize;
  }
}
