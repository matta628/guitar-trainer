// Standard tuning open string MIDI notes: low E → high E
export const OPEN_MIDI    = [40, 45, 50, 55, 59, 64];
export const STRING_NAMES = ["E", "A", "D", "G", "B", "E"]; // string 6→1
export const NOTE_NAMES   = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];

// Fret dots appear at these positions on a real guitar
export const MARKER_FRETS  = [3, 5, 7, 9, 12, 15, 17, 19, 21];
export const DOUBLE_MARKERS = [12, 24];

const PENTATONIC_INTERVALS = [0, 2, 4, 7, 9]; // major pentatonic: R, M2, M3, P5, M6

export function pentatonicPitchClasses(key) {
  const root = NOTE_NAMES.indexOf(key);
  return PENTATONIC_INTERVALS.map(i => (root + i) % 12);
}

/**
 * Returns every {stringIdx, fret, note, isRoot} position that falls within
 * the major pentatonic scale for `key`, across frets 0–maxFret.
 * stringIdx 0 = low E (string 6), 5 = high E (string 1).
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

// Layout constants (SVG coordinate space)
export const PAD_L       = 52;   // left padding (string labels)
export const PAD_R       = 24;
export const PAD_T       = 44;   // top padding (fret numbers)
export const PAD_B       = 24;
export const OPEN_W      = 52;   // width of the open-string column
export const FRET_W      = 68;   // width per fret cell
export const STRING_H    = 42;   // vertical space between strings
export const DOT_R       = 13;   // radius of note circles

export function svgWidth(maxFret)  { return PAD_L + OPEN_W + maxFret * FRET_W + PAD_R; }
export function svgHeight()        { return PAD_T + 5 * STRING_H + PAD_B; }

/** SVG x-coordinate for a given fret (0 = open string area) */
export function fretX(fret) {
  if (fret === 0) return PAD_L + OPEN_W / 2;
  return PAD_L + OPEN_W + (fret - 1) * FRET_W + FRET_W / 2;
}

/** SVG y-coordinate for a given string index */
export function stringY(stringIdx) {
  return PAD_T + stringIdx * STRING_H;
}
