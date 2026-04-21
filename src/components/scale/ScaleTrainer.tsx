import { useCallback, useEffect, useRef, useState } from "react";
import { profileKey } from "../../utils/profiles";
import { useAudio } from "../../hooks/useAudio";
import {
  mergePatternPositions, mergedFretRange, NOTE_NAMES, STRING_NUMS,
  PATTERN_LABELS, getScaleDegree,
  computeSharedRootFret, getPatternPositionsAtR, OPEN_MIDI,
  buildChairPositions, buildChairCycle, CHAIR_MAX_FRET,
} from "../../utils/fretboard";
import Fretboard from "./Fretboard";
import type { FretPosition, NoteResult } from "../../types";

const STABLE_THRESHOLD = 3;
const STRIP_SIZE       = 9;

type TraversalMode = "sequential" | "seq3" | "seq4" | "random" | "chair";
type Direction     = "up" | "down";
type DisplayMode   = "notes" | "degrees";

interface Props { onExit: () => void; }
interface Stats { correct: number; streak: number; bestStreak: number; }

// ── Sequence builders ─────────────────────────────────────────────────────────

function pitchOf(pos: FretPosition) { return OPEN_MIDI[pos.stringIdx] + pos.fret; }

function slideWindow(seq: number[], g: number): number[] {
  if (seq.length < g) return seq;
  const out: number[] = [];
  for (let i = 0; i <= seq.length - g; i++)
    for (let j = 0; j < g; j++) out.push(seq[i + j]);
  return out;
}

// Per-pattern sequential neighbor map for random mode.
// Each note's neighbors = the notes immediately before/after it within each
// pattern it belongs to. Junction notes (same physical position in both
// patterns) accumulate neighbors from both. Same-pitch notes on different
// strings are NOT connected.
function buildNeighborMap(
  key: string,
  patternIdxs: number[],
  mergedPositions: FretPosition[],
): Map<number, number[]> {
  const R   = computeSharedRootFret(key, patternIdxs);
  const adj = new Map<number, Set<number>>();
  mergedPositions.forEach((_, i) => adj.set(i, new Set()));

  for (const patternIdx of patternIdxs) {
    const patPos = getPatternPositionsAtR(key, patternIdx, R)
      .sort((a, b) => pitchOf(a) - pitchOf(b));
    const idxs = patPos
      .map(pos => mergedPositions.findIndex(p => p.stringIdx === pos.stringIdx && p.fret === pos.fret))
      .filter(i => i >= 0);
    for (let i = 0; i < idxs.length; i++) {
      if (i > 0) { adj.get(idxs[i])!.add(idxs[i - 1]); adj.get(idxs[i - 1])!.add(idxs[i]); }
    }
  }

  const result = new Map<number, number[]>();
  for (const [k, v] of adj) result.set(k, [...v]);
  return result;
}

// Multi-pattern zigzag forward/backward passes.
function buildZigzagPasses(
  key: string,
  patternIdxs: number[],
  mergedPositions: FretPosition[],
): { forward: number[]; backward: number[] } {
  const R = computeSharedRootFret(key, patternIdxs);
  const perIdx: number[][] = patternIdxs.map(idx => {
    const patPos = getPatternPositionsAtR(key, idx, R)
      .sort((a, b) => pitchOf(a) - pitchOf(b));
    return patPos
      .map(pos => mergedPositions.findIndex(
        p => p.stringIdx === pos.stringIdx && p.fret === pos.fret,
      ))
      .filter(i => i >= 0);
  });

  const forward  = perIdx.flatMap((asc, i) => i % 2 === 0 ? asc : [...asc].reverse());
  const backward = [...perIdx].reverse().flatMap((asc, i) => i % 2 === 0 ? [...asc].reverse() : asc);
  return { forward, backward };
}

// Build both directional cycles for a given key/pattern/traversal combo.
function buildCycles(
  key: string,
  patternIdxs: number[],
  positions: FretPosition[],
  traversal: TraversalMode,
): { up: number[]; down: number[] } {
  const n = positions.length;
  if (n === 0) return { up: [], down: [] };

  if (traversal === "random") {
    const identity = Array.from({ length: n }, (_, i) => i);
    return { up: identity, down: identity };
  }

  if (patternIdxs.length === 1) {
    const base = Array.from({ length: n }, (_, i) => i);
    const rev  = [...base].reverse();
    if (traversal === "seq3") return { up: slideWindow(base, 3), down: slideWindow(rev, 3) };
    if (traversal === "seq4") return { up: slideWindow(base, 4), down: slideWindow(rev, 4) };
    return { up: base, down: rev };
  }

  const { forward, backward } = buildZigzagPasses(key, patternIdxs, positions);
  if (traversal === "seq3") return { up: slideWindow(forward, 3), down: slideWindow(backward, 3) };
  if (traversal === "seq4") return { up: slideWindow(forward, 4), down: slideWindow(backward, 4) };
  return { up: forward, down: backward };
}

// ── Prefs persistence ──────────────────────────────────────────────────────────

function loadScalePrefs() {
  try { return JSON.parse(localStorage.getItem(profileKey("scale_prefs")) ?? "{}"); }
  catch { return {}; }
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ScaleTrainer({ onExit }: Props) {
  const saved = loadScalePrefs();
  const [key, setKey]                 = useState<string>(saved.key ?? "G");
  const [patternIdxs, setPatternIdxs] = useState<number[]>(saved.patternIdxs ?? [0]);
  const [traversal, setTraversal]     = useState<TraversalMode>(saved.traversal ?? "sequential");
  const [direction, setDirection]     = useState<Direction>(saved.direction ?? "up");
  const [display, setDisplay]         = useState<DisplayMode>(saved.display ?? "notes");
  const [cyclePos, setCyclePos]       = useState(0);
  const [feedback, setFeedback]       = useState({ text: "", cls: "" });
  const [stats, setStats]             = useState<Stats>({ correct: 0, streak: 0, bestStreak: 0 });
  const [toast, setToast]             = useState("");
  const toastTimerRef                 = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [metronomeOn, setMetronomeOn] = useState<boolean>(saved.metronomeOn ?? false);
  const [bpm, setBpm]                 = useState<number>(saved.bpm ?? 80);
  const metroIntervalRef              = useRef<ReturnType<typeof setInterval> | null>(null);
  const metroCtxRef                   = useRef<AudioContext | null>(null);

  const positionsRef  = useRef<FretPosition[]>([]);
  const upCycleRef    = useRef<number[]>([]);
  const downCycleRef  = useRef<number[]>([]);
  const directionRef  = useRef<Direction>("up");
  const traversalRef  = useRef<TraversalMode>("sequential");
  const posRef        = useRef(0);
  const historyRef    = useRef<number[]>([0]);
  const neighborMapRef = useRef<Map<number, number[]>>(new Map());
  const stableRef     = useRef({ note: "", count: 0 });
  const statsRef      = useRef<Stats>({ correct: 0, streak: 0, bestStreak: 0 });
  const advancingRef  = useRef(false);

  useEffect(() => {
    localStorage.setItem(profileKey("scale_prefs"), JSON.stringify(
      { key, patternIdxs, traversal, direction, display, bpm, metronomeOn }
    ));
  }, [key, patternIdxs, traversal, direction, display, bpm, metronomeOn]);

  function getCycle() {
    return directionRef.current === "up" ? upCycleRef.current : downCycleRef.current;
  }

  function playMetroClick() {
    if (!metroCtxRef.current) metroCtxRef.current = new AudioContext();
    const ctx = metroCtxRef.current;
    if (ctx.state === "suspended") ctx.resume();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.04);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.04);
  }

  useEffect(() => {
    if (metroIntervalRef.current) { clearInterval(metroIntervalRef.current); metroIntervalRef.current = null; }
    if (!metronomeOn) return;
    playMetroClick();
    metroIntervalRef.current = setInterval(playMetroClick, 60000 / bpm);
    return () => { if (metroIntervalRef.current) clearInterval(metroIntervalRef.current); };
  }, [metronomeOn, bpm]);

  function showToast(msg: string) {
    setToast(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(""), 2500);
  }

  function togglePattern(i: number) {
    if (traversal === "chair") { showToast("Chair mode uses all 5 patterns"); return; }
    setPatternIdxs(prev => {
      const lo = Math.min(...prev), hi = Math.max(...prev);
      const fill = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, k) => a + k);
      if (prev.includes(i)) {
        if (prev.length === 1) return prev;
        if (i === lo) return fill(lo + 1, hi);
        if (i === hi) return fill(lo, hi - 1);
        return [i];
      }
      if (i === lo - 1) return fill(i, hi);
      if (i === hi + 1) return fill(lo, i);
      return [i];
    });
  }

  useEffect(() => {
    let positions = traversal === "chair"
      ? buildChairPositions(key)
      : mergePatternPositions(key, patternIdxs);

    let up: number[], down: number[];
    if (traversal === "chair") {
      const cycle = buildChairCycle(key, positions);
      up = cycle; down = [...cycle].reverse();
    } else {
      ({ up, down } = buildCycles(key, patternIdxs, positions, traversal));
    }

    const activePatterns = traversal === "chair" ? [0,1,2,3,4] : patternIdxs;
    positionsRef.current   = positions;
    upCycleRef.current     = up;
    downCycleRef.current   = down;
    traversalRef.current   = traversal;
    neighborMapRef.current = buildNeighborMap(key, activePatterns, positions);
    posRef.current         = 0;
    historyRef.current     = [0];
    setCyclePos(0);
    setFeedback({ text: "", cls: "" });
    stableRef.current = { note: "", count: 0 };
    advancingRef.current = false;
  }, [key, patternIdxs, traversal]);

  function getTarget(): FretPosition | null {
    const c = getCycle();
    const p = positionsRef.current;
    if (!c.length || !p.length) return null;
    return p[c[posRef.current % c.length]] ?? null;
  }

  function jumpTo(cycleIdx: number) {
    posRef.current = cycleIdx;
    setCyclePos(cycleIdx);
    stableRef.current = { note: "", count: 0 };
    advancingRef.current = false;
    setFeedback({ text: "", cls: "" });
  }

  function pickRandomNeighbor(): number {
    const neighbors = neighborMapRef.current.get(posRef.current) ?? [];
    if (neighbors.length === 0) return posRef.current;
    return neighbors[Math.floor(Math.random() * neighbors.length)];
  }

  function advanceRandom() {
    const next = pickRandomNeighbor();
    jumpTo(next);
    historyRef.current = [...historyRef.current.slice(-99), next];
  }

  function advanceCycle() {
    if (traversalRef.current === "random") { advanceRandom(); return; }
    const c = getCycle();
    if (!c.length) return;
    jumpTo((posRef.current + 1) % c.length);
  }

  function retreatCycle() {
    if (traversalRef.current === "random") { advanceRandom(); return; }
    const c = getCycle();
    if (!c.length) return;
    jumpTo((posRef.current - 1 + c.length) % c.length);
  }

  function toggleDirection() {
    const newDir    = directionRef.current === "up" ? "down" : "up";
    const oldCycle  = getCycle();
    const posIdx    = oldCycle[posRef.current] ?? -1;
    const newCycle  = newDir === "up" ? upCycleRef.current : downCycleRef.current;

    // Find current note in the new cycle — first occurrence is fine so the
    // user starts at the beginning of a group when in groups mode.
    let newPos = 0;
    if (posIdx >= 0) {
      const found = newCycle.indexOf(posIdx);
      if (found >= 0) newPos = found;
    }

    directionRef.current = newDir;
    setDirection(newDir);
    posRef.current = newPos;
    setCyclePos(newPos);
    stableRef.current = { note: "", count: 0 };
    advancingRef.current = false;
    setFeedback({ text: "", cls: "" });
  }

  function handleNoteClick(pos: FretPosition) {
    const positions = positionsRef.current;
    const c         = getCycle();
    const posIdx    = positions.findIndex(p => p.stringIdx === pos.stringIdx && p.fret === pos.fret);
    if (posIdx < 0 || !c.length) return;
    // Find the nearest upcoming occurrence in the current direction's cycle.
    let best = -1, bestDist = Infinity;
    for (let i = 0; i < c.length; i++) {
      if (c[i] !== posIdx) continue;
      const dist = (i - posRef.current + c.length) % c.length;
      if (dist < bestDist) { bestDist = dist; best = i; }
    }
    if (best >= 0) jumpTo(best);
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") { e.preventDefault(); advanceCycle(); }
      if (e.key === "ArrowLeft")  { e.preventDefault(); retreatCycle(); }
      if (e.key === "ArrowUp")    { e.preventDefault(); toggleDirection(); }
      if (e.key === "ArrowDown")  { e.preventDefault(); toggleDirection(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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
      const s    = statsRef.current;
      const next = { correct: s.correct + 1, streak: s.streak + 1, bestStreak: Math.max(s.bestStreak, s.streak + 1) };
      statsRef.current = next;
      setStats(next);
      setFeedback({ text: `✓ ${target.note}`, cls: "correct" });
      setTimeout(advanceCycle, 500);
    }
  }, []);

  useAudio({ onNote: handleNote });

  const target    = getTarget();
  const positions = positionsRef.current;
  const { start, end } = traversal === "chair"
    ? { start: 0, end: CHAIR_MAX_FRET }
    : mergedFretRange(key, patternIdxs);
  const rootPc = NOTE_NAMES.indexOf(key);

  // Build strip from whichever cycle is active.
  const activeCycle = direction === "up" ? upCycleRef.current : downCycleRef.current;
  const half        = Math.floor(STRIP_SIZE / 2);
  const stripItems  = traversal === "random"
    ? (() => {
        const hist = historyRef.current;
        return Array.from({ length: STRIP_SIZE }, (_, i) => {
          const histIdx = hist.length - STRIP_SIZE + i;
          if (histIdx < 0) return null;
          const posIdx = hist[histIdx];
          const p = positions[posIdx];
          if (!p) return null;
          const deg = getScaleDegree(NOTE_NAMES.indexOf(p.note), rootPc);
          return { note: p.note, degree: deg, isRoot: p.isRoot, isCurrent: i === STRIP_SIZE - 1 };
        });
      })()
    : activeCycle.length > 0
      ? Array.from({ length: STRIP_SIZE }, (_, i) => {
          const idx = ((cyclePos - half + i) % activeCycle.length + activeCycle.length * STRIP_SIZE) % activeCycle.length;
          const p   = positions[activeCycle[idx]];
          if (!p) return null;
          const deg = getScaleDegree(NOTE_NAMES.indexOf(p.note), rootPc);
          return { note: p.note, degree: deg, isRoot: p.isRoot, isCurrent: i === half };
        })
      : [];

  const TRAVERSAL_MODES: { id: TraversalMode; label: string }[] = [
    { id: "sequential", label: "Sequential" },
    { id: "seq3",       label: "Groups·3"   },
    { id: "seq4",       label: "Groups·4"   },
    { id: "random",     label: "Random"     },
    { id: "chair",      label: "Chair"      },
  ];

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
              className={[
                "sc-pattern-btn",
                (traversal === "chair" || patternIdxs.includes(i)) ? "sc-pattern-active" : "",
                traversal === "chair" ? "sc-pattern-locked" : "",
              ].filter(Boolean).join(" ")}
              onClick={() => togglePattern(i)}
            >
              {i + 1}
            </button>
          ))}
        </div>

        <div className="sc-mode-btns">
          {TRAVERSAL_MODES.map(m => (
            <button
              key={m.id}
              className={`sc-mode-btn${traversal === m.id ? " sc-mode-active" : ""}`}
              onClick={() => setTraversal(m.id)}
            >
              {m.label}
            </button>
          ))}
        </div>

        <div className="sc-mode-btns">
          <button className={`sc-mode-btn${display === "notes"   ? " sc-mode-active" : ""}`} onClick={() => setDisplay("notes")}>Notes</button>
          <button className={`sc-mode-btn${display === "degrees" ? " sc-mode-active" : ""}`} onClick={() => setDisplay("degrees")}>Degrees</button>
        </div>
      </div>

      {/* ── Metronome bar ────────────────────────────────────────────────── */}
      <div className="sc-metro-bar">
        <button
          className={`sc-metro-toggle${metronomeOn ? " sc-metro-on" : ""}`}
          onClick={() => setMetronomeOn(v => !v)}
          title="Toggle metronome"
        >
          ♩ {metronomeOn ? "On" : "Off"}
        </button>
        <input
          type="range"
          className="sc-metro-slider"
          min={20} max={240} step={1}
          value={bpm}
          onChange={e => setBpm(Number(e.target.value))}
        />
        <input
          type="number"
          className="sc-metro-bpm"
          min={20} max={240}
          value={bpm}
          onChange={e => setBpm(Math.max(20, Math.min(240, Number(e.target.value) || 80)))}
        />
        <span className="sc-metro-label">BPM</span>
      </div>

      {/* ── Above-fretboard control bar ──────────────────────────────────── */}
      <div className="sc-above-fb">
        {/* Direction toggle — hidden in random and chair modes */}
        {traversal !== "random" && traversal !== "chair" && (
          <button
            className="sc-dir-toggle"
            onClick={toggleDirection}
            title="Toggle direction (↑/↓ keys)"
          >
            {direction === "up" ? "↑" : "↓"}
          </button>
        )}

        {/* Traversal strip */}
        <div className="sc-strip">
          {stripItems.map((item, i) =>
            item ? (
              <span
                key={i}
                className={[
                  "sc-strip-note",
                  item.isCurrent ? "sc-strip-current" : "",
                  item.isRoot    ? "sc-strip-root"    : "",
                ].filter(Boolean).join(" ")}
              >
                {display === "degrees"
                  ? (item.degree != null ? item.degree : item.note)
                  : item.note}
              </span>
            ) : null
          )}
        </div>

        {/* Current note info */}
        <div className="sc-above-note">
          <span className="sc-above-note-name">{target?.note ?? "—"}</span>
          {target && (
            <span className="sc-above-note-hint">
              str {STRING_NUMS[target.stringIdx]} · fret {target.fret}
            </span>
          )}
        </div>

        <span className="sc-nav-hint">↑↓ dir · click dot to jump</span>
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
          onNoteClick={handleNoteClick}
        />
      </div>

      {/* Bottom bar — legend + stats only */}
      <div className="sc-bottom">
        <div className="sc-legend">
          <span className="sc-legend-dot" style={{ background: "#4af8dc" }} />Target
          <span className="sc-legend-dot" style={{ background: "#f0a500" }} />Root (1)
          <span className="sc-legend-dot" style={{ background: "#1db954" }} />Scale note
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

      {/* Toast notification */}
      {toast && <div className="sc-toast">{toast}</div>}
    </div>
  );
}
