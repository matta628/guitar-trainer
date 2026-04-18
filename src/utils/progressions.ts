const NOTES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

// [semitone offset, base suffix, substitution suffix?]
// V → dom7, I/IV → maj7, ii/iii/vi → m7
const DEGREE: Record<string, [number, string, string?]> = {
  "I":   [0,  "",  "maj7"],
  "ii":  [2,  "m", "m7"],
  "iii": [4,  "m", "m7"],
  "IV":  [5,  "",  "maj7"],
  "V":   [7,  "",  "7"],
  "vi":  [9,  "m", "m7"],
};

const PROGRESSIONS = [
  ["I", "IV", "V", "I"],
  ["I", "V", "vi", "IV"],
  ["I", "vi", "IV", "V"],
  ["I", "IV", "I", "V"],
  ["ii", "V", "I"],
  ["I", "IV", "ii", "V"],
  ["I", "iii", "IV", "V"],
];

const SUB_RATE = 0.3;

function resolveChord(keyIdx: number, degree: string, available: Set<string>): string | null {
  const def = DEGREE[degree];
  if (!def) return null;
  const [st, base, sub] = def;
  const root = NOTES[(keyIdx + st) % 12];
  const baseChord = `${root}${base}`;
  if (!available.has(baseChord)) return null;
  if (sub && Math.random() < SUB_RATE && available.has(`${root}${sub}`)) {
    return `${root}${sub}`;
  }
  return baseChord;
}

/** Returns a shuffled copy of an array */
function shuffle<T>(arr: T[]): T[] {
  return [...arr].sort(() => Math.random() - 0.5);
}

/**
 * Picks a random playable chord progression given the set of unlocked chords.
 * Returns null if no progression fits (caller should fall back to random).
 */
export function pickProgression(available: string[]): string[] | null {
  if (available.length === 0) return null;
  const availSet = new Set(available);

  for (const keyIdx of shuffle([...Array(12).keys()])) {
    for (const prog of shuffle(PROGRESSIONS)) {
      const chords = prog.map(deg => resolveChord(keyIdx, deg, availSet));
      if (chords.every(c => c !== null)) return chords as string[];
    }
  }
  return null;
}
