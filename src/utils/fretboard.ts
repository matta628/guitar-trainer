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

// The 5 CAGED major-pentatonic patterns, as fret offsets from R (root fret on
// low-E). Indexed [stringIdx: 0=HighE … 5=LowE][note offsets].
export const PATTERN_SHAPES: number[][][] = [
  // Pattern 1 — root on low E
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
  "Pattern 1", "Pattern 2", "Pattern 3", "Pattern 4", "Pattern 5",
];

export const PATTERN_HINTS = [
  "Root on 6th string",
  "Root on 5th string",
  "Root on 4th string",
  "Root on 3rd string",
  "Root on 5th string (higher)",
];

// Compute the lowest valid shared root-fret (on low-E) for a set of patterns.
// "Valid" means every note of every selected pattern lands at fret >= 0.
// We start from the canonical position R in [0..11] for the key, then shift
// down by octaves as far as possible while satisfying that constraint.
export function computeSharedRootFret(key: string, patternIdxs: number[]): number {
  const rootPc = NOTE_NAMES.indexOf(key);
  let R = (rootPc - (OPEN_MIDI[5] % 12) + 12) % 12; // canonical 0..11

  // Tightest constraint: the most-negative offset across all selected patterns
  const minOff = Math.min(...patternIdxs.flatMap(idx => PATTERN_SHAPES[idx].flat()));

  // Shift up if the canonical R itself would cause a negative fret
  if (R + minOff < 0) R += 12;

  // Shift down by octaves as far as possible while keeping all notes >= fret 0
  while (R - 12 + minOff >= 0) R -= 12;

  return R;
}

// Build positions for one pattern given an explicit root fret R.
export function getPatternPositionsAtR(key: string, patternIdx: number, R: number): FretPosition[] {
  const rootPc = NOTE_NAMES.indexOf(key);
  const shape  = PATTERN_SHAPES[patternIdx];
  const out: FretPosition[] = [];
  for (let s = 5; s >= 0; s--) {
    for (const off of shape[s]) {
      const fret = R + off;
      if (fret < 0) continue; // safety: skip sub-nut positions
      const pc = (OPEN_MIDI[s] + fret) % 12;
      out.push({ stringIdx: s, fret, note: NOTE_NAMES[pc], isRoot: pc === rootPc });
    }
  }
  return out;
}

// Single-pattern convenience wrapper (computes its own lowest R).
export function getPatternPositions(key: string, patternIdx: number): FretPosition[] {
  const R = computeSharedRootFret(key, [patternIdx]);
  return getPatternPositionsAtR(key, patternIdx, R);
}

// Merge selected patterns, all anchored to the shared lowest-valid R so
// they ascend continuously up the neck from the lowest possible position.
export function mergePatternPositions(key: string, patternIdxs: number[]): FretPosition[] {
  const R    = computeSharedRootFret(key, patternIdxs);
  const seen = new Set<string>();
  const all: FretPosition[] = [];
  for (const idx of patternIdxs) {
    for (const pos of getPatternPositionsAtR(key, idx, R)) {
      const k = `${pos.stringIdx}-${pos.fret}`;
      if (!seen.has(k)) { seen.add(k); all.push(pos); }
    }
  }
  return all.sort((a, b) => (OPEN_MIDI[a.stringIdx] + a.fret) - (OPEN_MIDI[b.stringIdx] + b.fret));
}

// Fret range for the merged selection. Allows startFret=0 to show open strings.
export function mergedFretRange(key: string, patternIdxs: number[]): { start: number; end: number } {
  const positions = mergePatternPositions(key, patternIdxs);
  if (!positions.length) return { start: 0, end: 5 };
  const frets = positions.map(p => p.fret);
  const min   = Math.min(...frets);
  const max   = Math.max(...frets);
  // Show open-string column when pattern touches fret 0 or 1
  const start = min <= 1 ? 0 : min - 1;
  const end   = max + 1;
  return { start, end };
}

export const CHAIR_MAX_FRET = 20;
const ALL_PATTERNS = [0, 1, 2, 3, 4];

// All pentatonic notes across all 5 patterns up to maxFret (multiple octaves).
export function buildChairPositions(key: string, maxFret = CHAIR_MAX_FRET): FretPosition[] {
  const rootPc = NOTE_NAMES.indexOf(key);
  let R = (rootPc - (OPEN_MIDI[5] % 12) + 12) % 12;
  const minOff = Math.min(...ALL_PATTERNS.flatMap(pi => PATTERN_SHAPES[pi].flat()));
  if (R + minOff < 0) R += 12;
  while (R - 12 + minOff >= 0) R -= 12;

  const seen = new Set<string>();
  const all: FretPosition[] = [];
  for (let r = R; r <= maxFret + 12; r += 12) {
    for (const pi of ALL_PATTERNS) {
      for (const pos of getPatternPositionsAtR(key, pi, r)) {
        if (pos.fret < 0 || pos.fret > maxFret) continue;
        const k = `${pos.stringIdx}-${pos.fret}`;
        if (!seen.has(k)) { seen.add(k); all.push(pos); }
      }
    }
  }
  return all.sort((a, b) => (OPEN_MIDI[a.stringIdx] + a.fret) - (OPEN_MIDI[b.stringIdx] + b.fret));
}

// Chair traversal:
// 1. Group each string's notes into clusters separated by ≥3-fret gaps
//    (pentatonic intervals are 2-2-3-2-3 semitones, so clusters are always [R,2,3] or [5,6])
// 2. Round-robin across string pairs (lowE+A), (D+G), (B+highE) by cluster index
// 3. Within each pair-slot: play string A's cluster, then string B's cluster
export function buildChairCycle(key: string, positions: FretPosition[]): number[] {
  // Build ordered clusters per string (stringIdx 0=highE … 5=lowE)
  const stringClusters: number[][][] = Array.from({ length: 6 }, () => []);

  for (let s = 0; s < 6; s++) {
    const pts = positions
      .map((p, i) => ({ p, i }))
      .filter(({ p }) => p.stringIdx === s)
      .sort((a, b) => a.p.fret - b.p.fret);
    if (!pts.length) continue;
    let cluster = [pts[0].i];
    for (let j = 1; j < pts.length; j++) {
      if (pts[j].p.fret - pts[j - 1].p.fret <= 2) {
        cluster.push(pts[j].i);
      } else {
        stringClusters[s].push(cluster);
        cluster = [pts[j].i];
      }
    }
    stringClusters[s].push(cluster);
  }

  // String pairs: (lowE=5, A=4), (D=3, G=2), (B=1, highE=0)
  const PAIRS: [number, number][] = [[5, 4], [3, 2], [1, 0]];
  const maxG = Math.max(...Array.from({ length: 6 }, (_, s) => stringClusters[s].length), 0);

  const result: number[] = [];
  for (let g = 0; g < maxG; g++) {
    for (const [sa, sb] of PAIRS) {
      if (g < stringClusters[sa].length) result.push(...stringClusters[sa][g]);
      if (g < stringClusters[sb].length) result.push(...stringClusters[sb][g]);
    }
  }
  return result;
}

export function patternFretRange(key: string, patternIdx: number): { start: number; end: number } {
  const positions = getPatternPositions(key, patternIdx);
  const frets = positions.map(p => p.fret);
  const min = Math.min(...frets);
  const max = Math.max(...frets);
  const start = min <= 1 ? 0 : min - 1;
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
