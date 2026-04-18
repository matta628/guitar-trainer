import type { FretPosition } from "../types";

export const OPEN_MIDI    = [64, 59, 55, 50, 45, 40]; // E4 B3 G3 D3 A2 E2 (high E first)
export const STRING_NAMES = ["E", "B", "G", "D", "A", "E"];
export const STRING_NUMS  = [1, 2, 3, 4, 5, 6];
export const NOTE_NAMES   = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];

export const MARKER_FRETS   = [3, 5, 7, 9, 12, 15, 17, 19, 21];
export const DOUBLE_MARKERS = [12, 24];

const PENTATONIC_INTERVALS = [0, 2, 4, 7, 9];

// Major-pentatonic scale-degree map (semitone offset from root -> degree number)
const DEGREE_MAP: Record<number, number> = { 0: 1, 2: 2, 4: 3, 7: 5, 9: 6 };

export function getScaleDegree(notePc: number, rootPc: number): number | null {
  const off = (notePc - rootPc + 12) % 12;
  return DEGREE_MAP[off] ?? null;
}

export function pentatonicPitchClasses(key: string): number[] {
  const root = NOTE_NAMES.indexOf(key);
  return PENTATONIC_INTERVALS.map(i => (root + i) % 12);
}

// The 5 CAGED major-pentatonic patterns, as fret offsets from the root
// fret on the low-E string (R). Indexed [stringIdx 0=HighE..5=LowE][note].
// Verified for G major (R=3): pattern 1 puts the root on fret 3 low-E.
export const PATTERN_SHAPES: number[][][] = [
  // Pattern 1 — starts with root on low E
  [[0, 2], [0, 2], [-1, 1], [-1, 2], [-1, 2], [0, 2]],
  // Pattern 2
  [[2, 4], [2, 5], [1, 4], [2, 4], [2, 4], [2, 4]],
  // Pattern 3
  [[4, 7], [5, 7], [4, 6], [4, 6], [4, 7], [4, 7]],
  // Pattern 4
  [[7, 9], [7, 9], [6, 9], [6, 9], [7, 9], [7, 9]],
  // Pattern 5 — connects back up to root one octave higher on low E
  [[9, 12], [9, 12], [9, 11], [9, 11], [9, 11], [9, 12]],
];

export const PATTERN_LABELS = [
  "Pattern 1",
  "Pattern 2",
  "Pattern 3",
  "Pattern 4",
  "Pattern 5",
];

// Where the root sits in each pattern — shown as a hint to the user.
export const PATTERN_HINTS = [
  "Root on 6th string",
  "Root on 5th string",
  "Root on 4th string",
  "Root on 3rd string",
  "Root on 5th string (higher)",
];

// Compute root fret on low-E for a given key. Shift up an octave if the
// pattern would otherwise reach into negative frets.
function rootFret(key: string, patternIdx: number): number {
  const rootPc = NOTE_NAMES.indexOf(key);
  let R = (rootPc - (OPEN_MIDI[5] % 12) + 12) % 12;
  const shape = PATTERN_SHAPES[patternIdx];
  const minOff = Math.min(...shape.flat());
  if (R + minOff < 0) R += 12;
  return R;
}

// Return the positions for a CAGED pattern in natural playing order:
// low-E string first, low fret to high fret within each string, up to high E.
export function getPatternPositions(key: string, patternIdx: number): FretPosition[] {
  const rootPc = NOTE_NAMES.indexOf(key);
  const R = rootFret(key, patternIdx);
  const shape = PATTERN_SHAPES[patternIdx];
  const out: FretPosition[] = [];
  for (let s = 5; s >= 0; s--) {
    for (const off of shape[s]) {
      const fret = R + off;
      const pc = (OPEN_MIDI[s] + fret) % 12;
      out.push({ stringIdx: s, fret, note: NOTE_NAMES[pc], isRoot: pc === rootPc });
    }
  }
  return out;
}

export function mergePatternPositions(key: string, patternIdxs: number[]): FretPosition[] {
  const seen = new Set<string>();
  const all: FretPosition[] = [];
  for (const idx of patternIdxs) {
    for (const pos of getPatternPositions(key, idx)) {
      const k = `${pos.stringIdx}-${pos.fret}`;
      if (!seen.has(k)) { seen.add(k); all.push(pos); }
    }
  }
  return all.sort((a, b) => (OPEN_MIDI[a.stringIdx] + a.fret) - (OPEN_MIDI[b.stringIdx] + b.fret));
}

export function mergedFretRange(key: string, patternIdxs: number[]): { start: number; end: number } {
  const ranges = patternIdxs.map(i => patternFretRange(key, i));
  return { start: Math.min(...ranges.map(r => r.start)), end: Math.max(...ranges.map(r => r.end)) };
}

export function patternFretRange(key: string, patternIdx: number): { start: number; end: number } {
  const positions = getPatternPositions(key, patternIdx);
  const frets = positions.map(p => p.fret);
  const min = Math.min(...frets);
  const max = Math.max(...frets);
  // Pad by one fret on each side for visual breathing room, clamp to >=1 so
  // the open column isn't forced in when the pattern sits higher up.
  const start = Math.max(1, min - 1);
  const end   = max + 1;
  return { start, end };
}

export const PAD_L    = 52;
export const PAD_R    = 24;
export const PAD_T    = 44;
export const PAD_B    = 24;
export const OPEN_W   = 52;
export const FRET_W   = 68;
export const STRING_H = 42;
export const DOT_R    = 13;

// Width/x helpers accept a startFret. startFret===0 renders the open column
// and nut (original behavior). startFret>=1 renders a zoomed range with the
// leftmost fret line at PAD_L.
export function svgWidth(startFret: number, endFret: number): number {
  if (startFret === 0) return PAD_L + OPEN_W + endFret * FRET_W + PAD_R;
  return PAD_L + (endFret - startFret + 1) * FRET_W + PAD_R;
}

export const svgHeight = () => PAD_T + 5 * STRING_H + PAD_B;

export function fretX(fret: number, startFret: number): number {
  if (startFret === 0) {
    if (fret === 0) return PAD_L + OPEN_W / 2;
    return PAD_L + OPEN_W + (fret - 1) * FRET_W + FRET_W / 2;
  }
  return PAD_L + (fret - startFret) * FRET_W + FRET_W / 2;
}

export function stringY(stringIdx: number): number {
  return PAD_T + stringIdx * STRING_H;
}
