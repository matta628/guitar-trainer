import { useState, useRef } from "react";
import { useAudio } from "../../hooks/useAudio";
import { getPentatonicPositions, NOTE_NAMES, STRING_NUMS } from "../../utils/fretboard";
import Fretboard from "./Fretboard";
import type { FretPosition, NoteResult } from "../../types";

const KEYS     = NOTE_NAMES;
const MIN_FRET = 3;
const MAX_FRET = 13;
const STABLE_THRESHOLD = 3;

interface Props {
  onExit: () => void;
}

interface Stats {
  correct: number;
  streak: number;
  bestStreak: number;
}

interface FeedbackState {
  text: string;
  cls: "correct" | "wrong" | "";
}

export default function ScaleTrainer({ onExit }: Props) {
  const [key, setKey]         = useState("C");
  const [maxFret, setMaxFret] = useState(5);
  const [target, setTarget]   = useState<FretPosition | null>(null);
  const [feedback, setFeedback] = useState<FeedbackState>({ text: "", cls: "" });
  const [stats, setStats]     = useState<Stats>({ correct: 0, streak: 0, bestStreak: 0 });
  const [detectedNote, setDetectedNote] = useState<string | null>(null);

  const stableRef   = useRef({ note: "", count: 0 });
  const targetRef   = useRef<FretPosition | null>(null);
  const positionsRef = useRef<FretPosition[]>([]);
  const statsRef    = useRef<Stats>({ correct: 0, streak: 0, bestStreak: 0 });

  // Keep positions in sync with key/maxFret
  const positions = getPentatonicPositions(key, maxFret);
  positionsRef.current = positions;

  function pickTarget(currentTarget: FretPosition | null): void {
    if (positionsRef.current.length === 0) return;
    let next: FretPosition;
    do { next = positionsRef.current[Math.floor(Math.random() * positionsRef.current.length)]; }
    while (positionsRef.current.length > 1 && next === currentTarget);
    targetRef.current = next;
    setTarget(next);
    stableRef.current = { note: "", count: 0 };
    setFeedback({ text: "", cls: "" });
  }

  // Start with a target on first audio frame
  const initializedRef = useRef(false);

  function handleNote(note: NoteResult): void {
    setDetectedNote(note.name);

    // Pick initial target
    if (!initializedRef.current && positionsRef.current.length > 0) {
      initializedRef.current = true;
      pickTarget(null);
    }

    if (!targetRef.current) return;

    // Stability filter
    if (note.name === stableRef.current.note) {
      stableRef.current.count++;
    } else {
      stableRef.current = { note: note.name, count: 1 };
    }
    if (stableRef.current.count < STABLE_THRESHOLD) return;

    if (note.name === targetRef.current.note) {
      const s = statsRef.current;
      const next: Stats = {
        correct: s.correct + 1,
        streak: s.streak + 1,
        bestStreak: Math.max(s.bestStreak, s.streak + 1),
      };
      statsRef.current = next;
      setStats(next);
      setFeedback({ text: `✓ ${targetRef.current.note}!`, cls: "correct" });
      const prev = targetRef.current;
      stableRef.current = { note: "", count: 0 };
      setTimeout(() => pickTarget(prev), 600);
    } else {
      setFeedback({ text: `Hearing: ${note.name}`, cls: "wrong" });
    }
  }

  useAudio({ onNote: handleNote });

  function changeKey(k: string): void {
    setKey(k);
    initializedRef.current = false;
    targetRef.current = null;
    setTarget(null);
    setFeedback({ text: "", cls: "" });
  }

  function changeFret(delta: number): void {
    setMaxFret(prev => {
      const next = Math.max(MIN_FRET, Math.min(MAX_FRET, prev + delta));
      initializedRef.current = false;
      targetRef.current = null;
      setTarget(null);
      return next;
    });
  }

  return (
    <div className="scale-trainer">
      {/* Top bar */}
      <div className="sc-topbar">
        <button className="btn-back btn" onClick={onExit}>← Home</button>
        <span className="sc-topbar-title">Major Pentatonic</span>

        <select
          className="sc-key-select"
          value={key}
          onChange={e => changeKey(e.target.value)}
        >
          {KEYS.map(k => <option key={k} value={k}>{k}</option>)}
        </select>

        <div className="sc-fret-row">
          <button className="btn btn-sm" onClick={() => changeFret(-1)} disabled={maxFret <= MIN_FRET}>◄</button>
          <span className="sc-fret-val">{maxFret} frets</span>
          <button className="btn btn-sm" onClick={() => changeFret(1)} disabled={maxFret >= MAX_FRET}>►</button>
        </div>
      </div>

      {/* Fretboard */}
      <div className="sc-fretboard-wrap">
        <Fretboard
          positions={positions}
          target={target}
          maxFret={maxFret}
          detectedNote={detectedNote}
        />
      </div>

      {/* Bottom bar */}
      <div className="sc-bottom">
        <div className="sc-target">
          <div className="sc-target-note">{target?.note ?? "—"}</div>
          <div className="sc-target-hint">
            {target
              ? `String ${STRING_NUMS[target.stringIdx]}  ·  Fret ${target.fret === 0 ? "open" : target.fret}`
              : "Starting audio…"}
          </div>
        </div>

        <div className={`sc-feedback sc-feedback-${feedback.cls || "neutral"}`}>
          {feedback.text}
        </div>

        <div className="sc-stats">
          <div className="sc-stat">
            <span className="sc-stat-val">{stats.correct}</span>
            <span className="sc-stat-lbl">Correct</span>
          </div>
          <div className="sc-stat">
            <span className="sc-stat-val">{stats.streak}</span>
            <span className="sc-stat-lbl">Streak</span>
          </div>
          <div className="sc-stat">
            <span className="sc-stat-val">{stats.bestStreak}</span>
            <span className="sc-stat-lbl">Best</span>
          </div>
        </div>
      </div>
    </div>
  );
}
