/**
 * chordUtils.js
 * Maps a set of detected note names to a chord name.
 * Uses @tonaljs/tonal for chord recognition.
 *
 * Note: tonal identifies chords by note SET (not octave).
 * Voicing detection (open vs barred) is a separate concern — see README.
 */

import { Chord, Note } from "tonal";

/**
 * Given an array of note names (e.g. ["E", "G", "B"]),
 * returns the most likely chord name, or null if unrecognized.
 */
export function notesToChord(noteNames) {
  if (!noteNames || noteNames.length < 2) return null;

  // Deduplicate note names (guitar often has repeated notes across strings)
  const unique = [...new Set(noteNames)];

  // Try each note as the potential root and pick the best match
  for (const root of unique) {
    const detected = Chord.detect(unique, { assumePerfectFifth: false });
    if (detected && detected.length > 0) {
      // Return the simplest (shortest name) chord detected
      return detected.sort((a, b) => a.length - b.length)[0];
    }
  }

  return null;
}

/**
 * Returns the notes that make up a named chord (for validation).
 * e.g. "Em" → ["E", "G", "B"]
 */
export function chordToNotes(chordName) {
  const chord = Chord.get(chordName);
  return chord ? chord.notes : [];
}

/**
 * Checks if a set of detected notes matches a target chord.
 * Tolerant: requires that the chord's essential notes are present,
 * but doesn't penalize for extra notes (common on guitar with octave doubles).
 */
export function chordMatches(detectedNoteNames, targetChordName) {
  const required = chordToNotes(targetChordName);
  if (required.length === 0) return false;

  const detected = new Set(detectedNoteNames);

  // All required chord tones must be present
  return required.every(note => detected.has(note));
}

/**
 * A pool of beginner-friendly open chords for the game loop test.
 */
export const BEGINNER_CHORDS = [
  "Em", "Am", "E", "A", "Dm", "G", "C", "D"
];

export function randomChord(pool = BEGINNER_CHORDS) {
  return pool[Math.floor(Math.random() * pool.length)];
}
