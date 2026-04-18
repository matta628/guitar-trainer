import { useCallback, useEffect, useRef, useState } from "react";
import { useAudio } from "../../hooks/useAudio";
import {
  mergePatternPositions, mergedFretRange, NOTE_NAMES, STRING_NUMS,
  PATTERN_LABELS,
} from "../../utils/fretboard";
import Fretboard from "./Fretboard";
import type { FretPosition, NoteResult } from "../../types";

const STABLE_THRESHOLD = 3;

type TraversalMode = "sequential" | "seq3" | "seq4";
type DisplayMode   = "notes" | "degrees";

interface Props { onExit: () => void; }
interface Stats { correct: number; streak: number; bestStreak: number; }

// Ping-pong index sequence: 0,1,2,...,n-1,n-2,...,1
function buildCycle(n: number): number[] {
  if (n === 0) return [];
  const up = Array.from({ length: n }, (_, i) => i);
  if (n === 1) return up;
  return [...up, ...up.slice(1, -1).reverse()];
}

function buildSeqN(n: number, g: number): number[] {
  if (n < g) return [];
  const seq: number[] = [];
  for (let i = 0; i <= n - g; i++) { for (let j = 0; j < g; j++) seq.push(i + j); }
  for (let i = n - 1; i >= g - 1; i--) { for (let j = 0; j < g; j++) seq.push(i - j); }
  return seq;
}

export default function ScaleTrainer({ onExit }: Props) {
  const [key, setKey]               = useState("G");
  const [patternIdxs, setPatternIdxs] = useState<number[]>([0]);
  const [mode, setMode]           = useState<TraversalMode>("sequential");
  const [display, setDisplay]     = useState<DisplayMode>("notes");
  const [cyclePos, setCyclePos]   = useState(0);
  const [feedback, setFeedback]   = useState({ text: "", cls: "" });
  const [stats, setStats]         = useState<Stats>({ correct: 0, streak: 0, bestStreak: 0 });

  const positionsRef = useRef<FretPosition[]>([]);
  const cycleRef     = useRef<number[]>([]);
  const posRef       = useRef(0);
  const stableRef    = useRef({ note: "", count: 0 });
  const statsRef     = useRef<Stats>({ correct: 0, streak: 0, bestStreak: 0 });
  const advancingRef = useRef(false);

  function togglePattern(i: number) {
    setPatternIdxs(prev =>
      prev.includes(i)
        ? prev.length > 1 ? prev.filter(x => x !== i) : prev
        : [...prev, i].sort((a, b) => a - b)
    );
  }

  useEffect(() => {
    const positions = mergePatternPositions(key, patternIdxs);
    const c = mode === "seq4" ? buildSeqN(positions.length, 4)
            : mode === "seq3" ? buildSeqN(positions.length, 3)
            : buildCycle(positions.length);
    positionsRef.current = positions;
    cycleRef.current     = c;
    posRef.current       = 0;
    setCyclePos(0);
    setFeedback({ text: "", cls: "" });
    stableRef.current = { note: "", count: 0 };
    advancingRef.current = false;
  }, [key, patternIdxs, mode]);

  function getTarget(): FretPosition | null {
    const c = cycleRef.current;
    const p = positionsRef.current;
    if (!c.length || !p.length) return null;
    return p[c[posRef.current % c.length]] ?? null;
  }

  function advanceCycle() {
    const c = cycleRef.current;
    const next = (posRef.current + 1) % c.length;
    posRef.current = next;
    setCyclePos(next);
    stableRef.current = { note: "", count: 0 };
    advancingRef.current = false;
    setFeedback({ text: "", cls: "" });
  }

  const handleNote = useCallback((note: NoteResult) => {
    const target = getTarget();
    if (!target || advancingRef.current) return;

    if (note.name === stableRef.current.note) {
      stableRef.current.count++;
    } else {
      stableRef.current = { note: note.name, count: 1 };
    }
    if (stableRef.current.count < STABLE_THRESHOLD) return;

    if (note.name === target.note) {
      advancingRef.current = true;
      const s = statsRef.current;
      const next: Stats = {
        correct: s.correct + 1,
        streak: s.streak + 1,
        bestStreak: Math.max(s.bestStreak, s.streak + 1),
      };
      statsRef.current = next;
      setStats(next);
      setFeedback({ text: `✓ ${target.note}`, cls: "correct" });
      setTimeout(advanceCycle, 500);
    }
  }, []);

  useAudio({ onNote: handleNote });

  const target     = getTarget();
  const positions  = positionsRef.current;
  const { start, end } = mergedFretRange(key, patternIdxs);

  const c = cycleRef.current;
  const halfLen = c.length > 0 ? Math.ceil(c.length / 2) : 0;
  const goingUp = cyclePos < halfLen;

  return (
    <div className="scale-trainer">
      {/* Top bar */}
      <div className="sc-topbar">
        <button className="btn-back btn" onClick={onExit}>← Home</button>
        <span className="sc-topbar-title">Major Pentatonic</span>

        <select className="sc-key-select" value={key} onChange={e => setKey(e.target.value)}>
          {NOTE_NAMES.map(k => <option key={k} value={k}>{k}</option>)}
        </select>

        <div className="sc-pattern-btns">
          {PATTERN_LABELS.map((_, i) => (
            <button
              key={i}
              className={`sc-pattern-btn${patternIdxs.includes(i) ? " sc-pattern-active" : ""}`}
              onClick={() => togglePattern(i)}
            >
              {i + 1}
            </button>
          ))}
        </div>

        <div className="sc-mode-btns">
          <button className={`sc-mode-btn${mode === "sequential" ? " sc-mode-active" : ""}`} onClick={() => setMode("sequential")}>
            Sequential
          </button>
          <button className={`sc-mode-btn${mode === "seq3" ? " sc-mode-active" : ""}`} onClick={() => setMode("seq3")}>
            Groups of 3
          </button>
          <button className={`sc-mode-btn${mode === "seq4" ? " sc-mode-active" : ""}`} onClick={() => setMode("seq4")}>
            Groups of 4
          </button>
        </div>

        <div className="sc-mode-btns">
          <button className={`sc-mode-btn${display === "notes" ? " sc-mode-active" : ""}`} onClick={() => setDisplay("notes")}>
            Notes
          </button>
          <button className={`sc-mode-btn${display === "degrees" ? " sc-mode-active" : ""}`} onClick={() => setDisplay("degrees")}>
            Degrees
          </button>
        </div>
      </div>

      {/* Fretboard */}
      <div className="sc-fretboard-wrap">
        <Fretboard
          positions={positions}
          target={target}
          startFret={start}
          endFret={end}
          rootKey={key}
          displayMode={display}
        />
      </div>

      {/* Bottom bar */}
      <div className="sc-bottom">
        <div className="sc-legend">
          <span className="sc-legend-dot" style={{ background: "#4af8dc" }} />Target
          <span className="sc-legend-dot" style={{ background: "#f0a500" }} />Root (1)
          <span className="sc-legend-dot" style={{ background: "#1db954" }} />Scale note
        </div>

        <div className="sc-target">
          <div className="sc-target-note">
            {goingUp ? "↑" : "↓"} {target?.note ?? "—"}
          </div>
          <div className="sc-target-hint">
            {target
              ? `Pattern${patternIdxs.length > 1 ? "s" : ""} ${patternIdxs.map(i => i + 1).join("+")} · String ${STRING_NUMS[target.stringIdx]} · Fret ${target.fret}`
              : "Waiting for audio…"}
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
