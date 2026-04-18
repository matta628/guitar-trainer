import { Chord } from "tonal";
import type { Difficulty, DifficultyConfig } from "../types";

export function notesToChord(noteNames: string[]): string | null {
  if (!noteNames || noteNames.length < 2) return null;
  const unique = [...new Set(noteNames)];
  const detected = Chord.detect(unique, { assumePerfectFifth: false });
  if (detected?.length > 0) return detected.sort((a, b) => a.length - b.length)[0];
  return null;
}

export function chordToNotes(chordName: string): string[] {
  return Chord.get(chordName)?.notes ?? [];
}

export function chordMatches(detectedNoteNames: string[], targetChordName: string): boolean {
  const required = chordToNotes(targetChordName);
  if (required.length === 0) return false;
  const detected = new Set(detectedNoteNames);
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
export function randomChord(difficulty: Difficulty): string {
  const pool = DIFFICULTIES[difficulty].chords;
  let chord: string;
  do { chord = pool[Math.floor(Math.random() * pool.length)]; }
  while (chord === _lastChord && pool.length > 1);
  _lastChord = chord;
  return chord;
}
