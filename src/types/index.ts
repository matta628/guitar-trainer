export interface NoteResult {
  name: string;
  octave: number;
  fullName: string;
  midi: number;
  cents: number;
  freq: number;
}

export interface ChordResult {
  chord: string | null;
  notes: NoteResult[];
  noteNames: string[];
  dominantFreq: number;
}

export interface FretPosition {
  stringIdx: number;
  fret: number;
  note: string;
  isRoot: boolean;
}

export interface AudioFrameContext {
  sampleRate: number;
  bufferLength: number;
  fftSize: number;
  timeDomainData: Float32Array;
}

export interface DifficultyConfig {
  label: string;
  color: string;
  timeMs: number;
  chords: string[];
}

export type Screen = "home" | "arcade" | "scale" | "library";
export type Difficulty = "easy" | "medium" | "hard" | "expert";
