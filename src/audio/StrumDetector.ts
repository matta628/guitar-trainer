const MIN_RMS     = 0.015;  // minimum absolute level — filters out silence/noise
const ONSET_RATIO = 3.0;   // current RMS must be 3× background to count as strum
const DEBOUNCE_MS = 150;   // minimum gap between detected strums

/**
 * Detects guitar strum onsets from time-domain audio data using RMS energy.
 * Background level decays slowly so quiet sections don't raise the threshold.
 */
export class StrumDetector {
  onStrum?: () => void;

  private _background  = 0;
  private _lastStrumMs = 0;

  process(timeDomainData: Float32Array): void {
    let sq = 0;
    for (let i = 0; i < timeDomainData.length; i++) sq += timeDomainData[i] ** 2;
    const rms = Math.sqrt(sq / timeDomainData.length);

    // Background: decays quickly when signal drops, rises very slowly (don't let
    // a loud strum permanently raise the detection floor).
    const alpha = rms < this._background ? 0.1 : 0.005;
    this._background = alpha * rms + (1 - alpha) * this._background;

    const now = performance.now();
    if (
      rms > this._background * ONSET_RATIO &&
      rms > MIN_RMS &&
      now - this._lastStrumMs > DEBOUNCE_MS
    ) {
      this._lastStrumMs = now;
      this.onStrum?.();
    }
  }

  reset(): void {
    this._background  = 0;
    this._lastStrumMs = 0;
  }
}
