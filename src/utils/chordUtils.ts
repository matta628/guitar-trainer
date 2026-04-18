import { Chord } from "tonal";
import type { Difficulty, DifficultyConfig } from "../types";

// Normalize all note names to flat form so Bb/A#, Db/C# etc. are treated as identical
const SHARP_TO_FLAT: Record<string, string> = {
  "A#": "Bb", "C#": "Db", "D#": "Eb", "F#": "Gb", "G#": "Ab",
};
export function normalizeNote(n: string): string {
  return SHARP_TO_FLAT[n] ?? n;
}

export function notesToChord(noteNames: string[]): string | null {
  if (!noteNames || noteNames.length < 2) return null;
  // Normalize to flat form so Chord.detect returns flat-named chords (Bb not A#)
  const unique = [...new Set(noteNames.map(normalizeNote))];
  const detected = Chord.detect(unique, { assumePerfectFifth: false });
  if (detected?.length > 0) return detected.sort((a, b) => a.length - b.length)[0];
  return null;
}

export function chordToNotes(chordName: string): string[] {
  return Chord.get(chordName)?.notes ?? [];
}

export function chordMatches(detectedNoteNames: string[], targetChordName: string): boolean {
  const required = chordToNotes(targetChordName).map(normalizeNote);
  if (required.length === 0) return false;
  const detected = new Set(detectedNoteNames.map(normalizeNote));
  return required.every(n => detected.has(n));
}

export const DIFFICULTIES: Record<Difficulty, DifficultyConfig> = {
  easy: {
    label: "EASY", color: "#4ade80", timeMs: 7000,
    chords: ["E", "A", "D", "G", "C", "Em", "Am", "Dm"],
  },
  medium: {
    label: "MEDIUM", color: "#fbbf24", timeMs: 5500,
    chords: [
      "E","A","D","G","C","F","B","Bb","Eb","Ab","Db","Gb",
      "Em","Am","Dm","Gm","Cm","Fm","Bm","Bbm","Ebm","Abm","C#m","F#m",
    ],
  },
  hard: {
    label: "HARD", color: "#fb923c", timeMs: 4000,
    chords: ["E7","A7","D7","G7","C7","F7","B7","Bb7","Eb7","Ab7","Db7","Gb7"],
  },
  expert: {
    label: "EXPERT", color: "#f87171", timeMs: 3000,
    chords: [
      "Em7","Am7","Dm7","Gm7","Cm7","Fm7","Bm7","Bbm7","Ebm7",
      "Emaj7","Amaj7","Dmaj7","Gmaj7","Cmaj7","Fmaj7","Bmaj7",
    ],
  },
};

export const DIFFICULTY_ORDER: Difficulty[] = ["easy", "medium", "hard", "expert"];

let _lastChord: string | null = null;
export function randomChord(difficulty: Difficulty, available: string[]): string {
  const pool = DIFFICULTIES[difficulty].chords.filter(c => available.includes(c));
  if (pool.length === 0) return "";
  let chord: string;
  do { chord = pool[Math.floor(Math.random() * pool.length)]; }
  while (chord === _lastChord && pool.length > 1);
  _lastChord = chord;
  return chord;
}

// All chords across all difficulties, deduplicated
export function getAllChords(): string[] {
  const seen = new Set<string>();
  return DIFFICULTY_ORDER.flatMap(d => DIFFICULTIES[d as Difficulty].chords).filter(c => {
    if (seen.has(c)) return false;
    seen.add(c); return true;
  });
}

export type ChordType = "major" | "minor" | "dom7" | "maj7" | "min7";

export function getChordType(chord: string): ChordType {
  const m = chord.match(/^[A-G][b#]?(maj7|m7|m|7)?$/);
  const suffix = m?.[1] ?? "";
  if (suffix === "maj7") return "maj7";
  if (suffix === "m7")   return "min7";
  if (suffix === "7")    return "dom7";
  if (suffix === "m")    return "minor";
  return "major";
}

export const CHORD_TYPE_LABELS: Record<ChordType, string> = {
  major: "Major",
  minor: "Minor",
  dom7:  "Dom 7",
  maj7:  "Maj 7",
  min7:  "Min 7",
};
