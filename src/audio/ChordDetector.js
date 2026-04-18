import { freqToNote } from "../utils/noteUtils.js";
import { notesToChord } from "../utils/chordUtils.js";

const SILENCE_THRESHOLD_DB   = -50;
const MIN_FREQ               = 70;
const MAX_FREQ               = 1400;
const MIN_PEAK_DISTANCE_BINS = 5;

export class ChordDetector {
  constructor({ onChord, onNote } = {}) {
    this.onChord = onChord;
    this.onNote  = onNote;
    this._lastChord   = null;
    this._stableCount = 0;
    this._stableThreshold = 2;
  }

  process(freqData, { sampleRate, fftSize }) {
    const binHz = sampleRate / fftSize;
    const peaks = this._findPeaks(freqData, binHz);

    if (peaks.length === 0) {
      this._stableCount = 0;
      this._lastChord   = null;
      return;
    }

    const notes     = peaks.map(({ freq }) => freqToNote(freq)).filter(Boolean);
    const noteNames = notes.map(n => n.name);

    if (this.onNote && notes.length > 0) this.onNote(notes[0]);

    if (!this.onChord) return;

    const chord = notesToChord(noteNames);
    if (chord === this._lastChord) {
      this._stableCount++;
    } else {
      this._stableCount = 1;
      this._lastChord   = chord;
    }
    if (this._stableCount >= this._stableThreshold) {
      this.onChord({ chord, notes, noteNames, dominantFreq: peaks[0].freq });
    }
  }

  _findPeaks(freqData, binHz) {
    const peaks  = [];
    const minBin = Math.floor(MIN_FREQ / binHz);
    const maxBin = Math.floor(MAX_FREQ / binHz);

    for (let i = minBin + 1; i < maxBin - 1 && i < freqData.length - 1; i++) {
      const mag = freqData[i];
      if (mag < SILENCE_THRESHOLD_DB) continue;
      if (mag > freqData[i - 1] && mag > freqData[i + 1]) {
        const last = peaks[peaks.length - 1];
        if (!last || (i - last.bin) >= MIN_PEAK_DISTANCE_BINS) {
          peaks.push({ bin: i, freq: i * binHz, magnitude: mag });
        }
      }
    }
    return peaks.sort((a, b) => b.magnitude - a.magnitude).slice(0, 6);
  }
}
