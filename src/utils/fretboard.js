// Standard tuning, HIGH E at index 0 (top of diagram), LOW E at index 5 (bottom)
export const OPEN_MIDI    = [64, 59, 55, 50, 45, 40]; // E4 B3 G3 D3 A2 E2
export const STRING_NAMES = ["E", "B", "G", "D", "A", "E"]; // string 1 → 6
export const STRING_NUMS  = [1, 2, 3, 4, 5, 6];
export const NOTE_NAMES   = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];

export const MARKER_FRETS   = [3, 5, 7, 9, 12, 15, 17, 19, 21];
export const DOUBLE_MARKERS = [12, 24];

const PENTATONIC_INTERVALS = [0, 2, 4, 7, 9];

export function pentatonicPitchClasses(key) {
  const root = NOTE_NAMES.indexOf(key);
  return PENTATONIC_INTERVALS.map(i => (root + i) % 12);
}

/**
 * Returns {stringIdx, fret, note, isRoot} for every pentatonic position.
 * stringIdx 0 = high E (top of diagram), 5 = low E (bottom).
 */
export function getPentatonicPositions(key, maxFret) {
  const pcs    = pentatonicPitchClasses(key);
  const rootPc = NOTE_NAMES.indexOf(key);
  const out    = [];

  for (let s = 0; s < 6; s++) {
    for (let f = 0; f <= maxFret; f++) {
      const pc = (OPEN_MIDI[s] + f) % 12;
      if (pcs.includes(pc)) {
        out.push({ stringIdx: s, fret: f, note: NOTE_NAMES[pc], isRoot: pc === rootPc });
      }
    }
  }
  return out;
}

// ── SVG layout constants ──────────────────────────────────────────────────────
export const PAD_L    = 52;
export const PAD_R    = 24;
export const PAD_T    = 44;
export const PAD_B    = 24;
export const OPEN_W   = 52;
export const FRET_W   = 68;
export const STRING_H = 42;
export const DOT_R    = 13;

export const svgWidth  = (maxFret) => PAD_L + OPEN_W + maxFret * FRET_W + PAD_R;
export const svgHeight = ()        => PAD_T + 5 * STRING_H + PAD_B;

export function fretX(fret) {
  if (fret === 0) return PAD_L + OPEN_W / 2;
  return PAD_L + OPEN_W + (fret - 1) * FRET_W + FRET_W / 2;
}

export function stringY(stringIdx) {
  return PAD_T + stringIdx * STRING_H;
}
