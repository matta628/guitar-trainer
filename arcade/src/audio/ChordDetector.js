/**
 * ChordDetector.js
 * Takes raw FFT frequency data and returns detected notes + chord.
 *
 * Pipeline:
 *   Float32Array (dB per frequency bin)
 *     → peak detection (find prominent frequencies)
 *     → frequency → note name + octave (noteUtils)
 *     → note set → chord name (chordUtils)
 *     → onChord callback
 *
 * LATENCY NOTES:
 * - fftSize 4096 @ 44100 Hz → ~93ms audio buffer → ~93ms minimum latency
 * - fftSize 2048 → ~46ms but less frequency resolution (harder to distinguish notes)
 * - We start with 4096 and measure actual perceived latency in the game loop test.
 *   If it's too slow, we drop to 2048 and accept slightly worse note separation.
 *
 * THRESHOLD:
 * - Guitar signal typically peaks around -10 to -30 dB when played.
 * - Silence / noise floor is around -80 to -100 dB.
 * - SILENCE_THRESHOLD filters out noise. Adjust if Mustang Micro is louder/quieter.
 */

import { freqToNote } from "../utils/noteUtils.js";
import { notesToChord } from "../utils/chordUtils.js";

const SILENCE_THRESHOLD_DB = -50; // bins below this are ignored
const MIN_FREQ = 70;               // guitar low E ~ 82 Hz (a bit of headroom)
const MAX_FREQ = 1400;             // above this are harmonics, not fundamentals
const MIN_PEAK_DISTANCE_BINS = 5;  // peaks must be this many bins apart

export class ChordDetector {
  constructor({ onChord, onNote } = {}) {
    this.onChord = onChord; // callback({ chord, notes, dominantFreq })
    this.onNote = onNote;   // optional: callback for dominant freq only
    this._lastChord = null;
    this._stableCount = 0;
    this._stableThreshold = 2; // chord must be detected N frames in a row to fire
  }

  /**
   * Process one frame of FFT data from AudioEngine.
   */
  process(freqData, { sampleRate, fftSize }) {
    const binHz = sampleRate / fftSize;

    // 1. Find peaks in the frequency domain within guitar range
    const peaks = this._findPeaks(freqData, binHz);

    if (peaks.length === 0) {
      this._stableCount = 0;
      this._lastChord = null;
      return;
    }

    // 2. Convert peak frequencies to note names
    const notes = peaks
      .map(({ freq }) => freqToNote(freq))
      .filter(Boolean);

    const noteNames = notes.map(n => n.name);
    const dominantFreq = peaks[0].freq;

    // 3. Attempt chord recognition
    const chord = notesToChord(noteNames);

    // 4. Stability filter: only fire callback if same chord detected N frames in a row
    // This prevents rapid flickering between chords
    if (chord === this._lastChord) {
      this._stableCount++;
    } else {
      this._stableCount = 1;
      this._lastChord = chord;
    }

    if (this._stableCount >= this._stableThreshold) {
      if (this.onChord) {
        this.onChord({ chord, notes, noteNames, dominantFreq });
      }
    }

    if (this.onNote && notes.length > 0) {
      this.onNote(notes[0]); // dominant note
    }
  }

  /**
   * Finds local maxima in the FFT magnitude spectrum within guitar frequency range.
   * Returns array of { freq, magnitude } sorted by magnitude descending.
   */
  _findPeaks(freqData, binHz) {
    const peaks = [];

    const minBin = Math.floor(MIN_FREQ / binHz);
    const maxBin = Math.floor(MAX_FREQ / binHz);

    for (let i = minBin + 1; i < maxBin - 1 && i < freqData.length - 1; i++) {
      const mag = freqData[i];

      // Must be above silence threshold
      if (mag < SILENCE_THRESHOLD_DB) continue;

      // Must be a local maximum
      if (mag > freqData[i - 1] && mag > freqData[i + 1]) {
        // Check it's sufficiently far from the last peak
        const lastPeak = peaks[peaks.length - 1];
        if (!lastPeak || (i - lastPeak.bin) >= MIN_PEAK_DISTANCE_BINS) {
          peaks.push({ bin: i, freq: i * binHz, magnitude: mag });
        }
      }
    }

    // Sort by magnitude (loudest first = most likely fundamental frequencies)
    return peaks.sort((a, b) => b.magnitude - a.magnitude).slice(0, 6);
  }
}
