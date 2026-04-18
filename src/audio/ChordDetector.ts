import { freqToNote } from "../utils/noteUtils";
import { notesToChord } from "../utils/chordUtils";
import type { NoteResult, ChordResult, AudioFrameContext } from "../types";

const SILENCE_THRESHOLD_DB   = -50;
const MIN_FREQ               = 70;
const MAX_FREQ               = 1400;
const MIN_PEAK_DISTANCE_BINS = 5;

interface Peak { bin: number; freq: number; magnitude: number; }

interface ChordDetectorOptions {
  onChord?: (result: ChordResult) => void;
  onNote?:  (note: NoteResult) => void;
}

export class ChordDetector {
  onChord: ((result: ChordResult) => void) | null;
  onNote:  ((note: NoteResult) => void) | null;
  private _lastChord:   string | null = null;
  private _stableCount  = 0;
  private _stableThreshold = 2;

  constructor({ onChord, onNote }: ChordDetectorOptions = {}) {
    this.onChord = onChord ?? null;
    this.onNote  = onNote  ?? null;
  }

  process(freqData: Float32Array, { sampleRate, fftSize }: AudioFrameContext): void {
    const binHz = sampleRate / fftSize;
    const peaks = this._findPeaks(freqData, binHz);

    if (peaks.length === 0) {
      this._stableCount = 0;
      this._lastChord   = null;
      return;
    }

    const notes     = peaks.map(({ freq }) => freqToNote(freq)).filter((n): n is NoteResult => n !== null);
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

  private _findPeaks(freqData: Float32Array, binHz: number): Peak[] {
    const peaks: Peak[] = [];
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
