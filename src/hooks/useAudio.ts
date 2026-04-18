import { useEffect, useRef, useState } from "react";
import { AudioEngine } from "../audio/AudioEngine";
import { ChordDetector } from "../audio/ChordDetector";
import type { ChordResult, NoteResult } from "../types";

interface UseAudioOptions {
  onChord?: (result: ChordResult) => void;
  onNote?:  (note: NoteResult)   => void;
}

export function useAudio({ onChord, onNote }: UseAudioOptions = {}) {
  // Keep latest callbacks in refs so the detector always calls the current version
  const onChordRef = useRef(onChord);
  const onNoteRef  = useRef(onNote);
  onChordRef.current = onChord;
  onNoteRef.current  = onNote;

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let engine: AudioEngine | null = null;

    const detector = new ChordDetector({
      onChord: (r) => onChordRef.current?.(r),
      onNote:  (n) => onNoteRef.current?.(n),
    });

    const go = async () => {
      try {
        engine = new AudioEngine({ onFrame: (d, c) => detector.process(d, c) });
        await engine.start();
      } catch {
        setError("Microphone access denied. Please allow mic access and reload.");
      }
    };

    go();
    return () => { engine?.stop(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return { error };
}
