import type { NoteResult } from "../types";

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export function freqToNote(freq: number): NoteResult | null {
  if (!freq || freq <= 0) return null;
  const semitones = 12 * Math.log2(freq / 440);
  const roundedSemitones = Math.round(semitones);
  const midiNote = 69 + roundedSemitones;
  const octave = Math.floor(midiNote / 12) - 1;
  const noteIndex = ((midiNote % 12) + 12) % 12;
  const name = NOTE_NAMES[noteIndex];
  const cents = (semitones - roundedSemitones) * 100;
  return {
    name,
    octave,
    fullName: `${name}${octave}`,
    midi: midiNote,
    cents: Math.round(cents),
    freq: Math.round(freq),
  };
}

export function notesMatch(detected: NoteResult | null, targetName: string, threshold = 50): boolean {
  if (!detected) return false;
  return detected.name === targetName && Math.abs(detected.cents) <= threshold;
}
