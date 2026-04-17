/**
 * noteUtils.js
 * Converts raw frequencies to note names with octave.
 * e.g. 440 Hz → { name: "A", octave: 4, fullName: "A4" }
 */

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

/**
 * Converts a frequency (Hz) to a note name + octave.
 * Uses equal temperament tuning (A4 = 440 Hz).
 */
export function freqToNote(freq) {
  if (!freq || freq <= 0) return null;

  // Number of semitones from A4
  const semitones = 12 * Math.log2(freq / 440);
  const roundedSemitones = Math.round(semitones);

  // A4 = MIDI note 69
  const midiNote = 69 + roundedSemitones;
  const octave = Math.floor(midiNote / 12) - 1;
  const noteIndex = midiNote % 12;

  const name = NOTE_NAMES[noteIndex];

  // How far off from perfect pitch (cents)
  const cents = (semitones - roundedSemitones) * 100;

  return {
    name,           // e.g. "A"
    octave,         // e.g. 4
    fullName: `${name}${octave}`,  // e.g. "A4"
    midi: midiNote,
    cents: Math.round(cents),      // tuning deviation in cents
    freq: Math.round(freq),
  };
}

/**
 * Checks if a detected note is "close enough" to a target note.
 * threshold: max cents deviation to consider a match (default 50 cents = half semitone)
 */
export function notesMatch(detectedNote, targetNoteName, threshold = 50) {
  if (!detectedNote) return false;
  return detectedNote.name === targetNoteName && Math.abs(detectedNote.cents) <= threshold;
}
