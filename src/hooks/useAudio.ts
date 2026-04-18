import { useEffect, useRef, useState } from "react";
import { AudioEngine } from "../audio/AudioEngine";
import { ChordDetector } from "../audio/ChordDetector";
import { StrumDetector } from "../audio/StrumDetector";
import type { ChordResult, NoteResult } from "../types";

interface UseAudioOptions {
  onChord?: (result: ChordResult) => void;
  onNote?:  (note: NoteResult)   => void;
  onStrum?: () => void;
}

export function useAudio({ onChord, onNote, onStrum }: UseAudioOptions = {}) {
  const onChordRef = useRef(onChord);
  const onNoteRef  = useRef(onNote);
  const onStrumRef = useRef(onStrum);
  onChordRef.current = onChord;
  onNoteRef.current  = onNote;
  onStrumRef.current = onStrum;

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let engine: AudioEngine | null = null;

    const chordDetector = new ChordDetector({
      onChord: (r) => onChordRef.current?.(r),
      onNote:  (n) => onNoteRef.current?.(n),
    });

    const strumDetector = new StrumDetector();
    strumDetector.onStrum = () => onStrumRef.current?.();

    const go = async () => {
      try {
        engine = new AudioEngine({
          onFrame: (d, c) => {
            chordDetector.process(d, c);
            strumDetector.process(c.timeDomainData);
          },
        });
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
