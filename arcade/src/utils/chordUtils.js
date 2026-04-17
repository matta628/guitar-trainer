import { Chord } from "tonal";

export function notesToChord(noteNames) {
  if (!noteNames || noteNames.length < 2) return null;
  const unique = [...new Set(noteNames)];
  const detected = Chord.detect(unique, { assumePerfectFifth: false });
  if (detected && detected.length > 0) {
    return detected.sort((a, b) => a.length - b.length)[0];
  }
  return null;
}

export function chordToNotes(chordName) {
  const chord = Chord.get(chordName);
  return chord ? chord.notes : [];
}

export function chordMatches(detectedNoteNames, targetChordName) {
  const required = chordToNotes(targetChordName);
  if (required.length === 0) return false;
  const detected = new Set(detectedNoteNames);
  return required.every(note => detected.has(note));
}

// ── Difficulty tiers ──────────────────────────────────────────────────────────
// Tailored to someone who knows all major, minor, dom7, min7, maj7 chords.

export const DIFFICULTIES = {
  easy: {
    label: "EASY",
    color: "#1db954",
    timeMs: 7000,
    chords: ["E", "A", "D", "G", "C", "Em", "Am", "Dm"],
  },
  medium: {
    label: "MEDIUM",
    color: "#f0a500",
    timeMs: 5500,
    // All 12 majors + all 12 minors (includes barre chord territory)
    chords: [
      "E", "A", "D", "G", "C", "F", "B", "Bb", "Eb", "Ab", "Db", "Gb",
      "Em", "Am", "Dm", "Gm", "Cm", "Fm", "Bm", "Bbm", "Ebm", "Abm", "C#m", "F#m",
    ],
  },
  hard: {
    label: "HARD",
    color: "#e07020",
    timeMs: 4000,
    // All 12 dominant 7ths
    chords: [
      "E7", "A7", "D7", "G7", "C7", "F7", "B7", "Bb7", "Eb7", "Ab7", "Db7", "Gb7",
    ],
  },
  expert: {
    label: "EXPERT",
    color: "#e04040",
    timeMs: 3000,
    // Min7 + maj7 across keys
    chords: [
      "Em7", "Am7", "Dm7", "Gm7", "Cm7", "Fm7", "Bm7", "Bbm7", "Ebm7",
      "Emaj7", "Amaj7", "Dmaj7", "Gmaj7", "Cmaj7", "Fmaj7", "Bmaj7",
    ],
  },
};

export const DIFFICULTY_ORDER = ["easy", "medium", "hard", "expert"];

let _lastChord = null;
export function randomChord(difficulty) {
  const pool = DIFFICULTIES[difficulty].chords;
  let chord;
  do { chord = pool[Math.floor(Math.random() * pool.length)]; } while (chord === _lastChord);
  _lastChord = chord;
  return chord;
}
