import { useCallback, useEffect, useRef, useState } from "react";
import { useAudio } from "../../hooks/useAudio";
import { randomChord, chordMatches, DIFFICULTIES, DIFFICULTY_ORDER } from "../../utils/chordUtils";
import { isChordUnlocked, getAllUnlockedVoicings, chordDiagramSVG } from "../../utils/voicings";
import type { ChordResult, Difficulty } from "../../types";

const MAX_LIVES           = 3;
const CORRECT_TO_LEVEL_UP  = 5;
const MISSES_TO_LEVEL_DOWN = 2;
const DEFAULT_TIME_SEC    = 6;
const MIN_TIME_SEC        = 2;
const MAX_TIME_SEC        = 15;

type Phase = "start" | "game" | "gameover";

interface FeedbackState {
  text: string;
  cls: "correct" | "wrong" | "timeout" | "neutral";
}

function getBest(): number { return parseInt(localStorage.getItem("guitar_arcade_best") ?? "0", 10); }
function saveBest(s: number): void { localStorage.setItem("guitar_arcade_best", String(s)); }

// Returns chords available at a difficulty level (unlocked by user in library)
function availableChords(diffIdx: number): string[] {
  const diff = DIFFICULTY_ORDER[diffIdx] as Difficulty;
  return DIFFICULTIES[diff].chords.filter(isChordUnlocked);
}

interface Props {
  onExit: () => void;
}

export default function Arcade({ onExit }: Props) {
  const [phase, setPhase]               = useState<Phase>("start");
  const [score, setScore]               = useState(0);
  const [lives, setLives]               = useState(MAX_LIVES);
  const [streak, setStreak]             = useState(0);
  const [diffIdx, setDiffIdx]           = useState(0);
  const [currentChord, setCurrentChord] = useState("");
  const [feedback, setFeedback]         = useState<FeedbackState>({ text: "", cls: "neutral" });
  const [customTimeSec, setCustomTimeSec] = useState(DEFAULT_TIME_SEC);
  const [highScore, setHighScore]       = useState(getBest);
  const [gameOverData, setGameOverData] = useState({ score: 0, isNew: false, diffLabel: "EASY" });

  const G = useRef({
    waiting: false,
    chord: "",
    score: 0,
    lives: MAX_LIVES,
    streak: 0,
    diffIdx: 0,
    correctInRow: 0,
    missInRow: 0,
    chordShownAt: 0,
    customTimeSec: DEFAULT_TIME_SEC,
  }).current;

  const timerBarRef = useRef<HTMLDivElement>(null);
  const rafRef      = useRef<number | null>(null);

  function timeMult(): number {
    return Math.max(0.5, Math.round((DEFAULT_TIME_SEC / G.customTimeSec) * 10) / 10);
  }
  function streakMult(s: number): number {
    return s >= 8 ? 4 : s >= 5 ? 3 : s >= 3 ? 2 : 1;
  }

  function startTimer(ms: number): void {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    const start = performance.now();
    const tick = () => {
      const rem = Math.max(0, 1 - (performance.now() - start) / ms);
      if (timerBarRef.current) {
        timerBarRef.current.style.width      = `${rem * 100}%`;
        timerBarRef.current.style.background = rem > 0.5 ? "#4ade80" : rem > 0.25 ? "#fb923c" : "#f87171";
      }
      if (rem <= 0) { if (G.waiting) handleMiss("timeout"); return; }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }

  function stopTimer(): void {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    if (timerBarRef.current) {
      timerBarRef.current.style.width      = "100%";
      timerBarRef.current.style.background = "#4ade80";
    }
  }

  function syncState(): void {
    setScore(G.score);
    setLives(G.lives);
    setStreak(G.streak);
    setDiffIdx(G.diffIdx);
  }

  // Find a difficulty idx that has unlocked chords (search downward from current)
  function findPlayableDiff(startIdx: number): number {
    for (let i = startIdx; i >= 0; i--) {
      if (availableChords(i).length > 0) return i;
    }
    return -1; // no chords unlocked at all
  }

  const nextChord = useCallback(() => {
    stopTimer();
    const pool  = availableChords(G.diffIdx);
    if (pool.length === 0) {
      // Level down until we find available chords
      const d = findPlayableDiff(G.diffIdx - 1);
      if (d < 0) { endGame(); return; }
      G.diffIdx = d;
    }
    const chord = randomChord(DIFFICULTY_ORDER[G.diffIdx] as Difficulty, availableChords(G.diffIdx));
    G.chord        = chord;
    G.chordShownAt = performance.now();
    G.waiting      = true;
    setCurrentChord(chord);
    setFeedback({ text: "Strum it!", cls: "neutral" });
    startTimer(G.customTimeSec * 1000);
  }, []);

  function handleMiss(reason: "timeout" | "wrong"): void {
    G.waiting = false;
    stopTimer();
    G.lives--;
    G.streak = 0;
    G.missInRow++;
    G.correctInRow = 0;
    if (G.missInRow >= MISSES_TO_LEVEL_DOWN && G.diffIdx > 0) {
      const d = findPlayableDiff(G.diffIdx - 1);
      if (d >= 0) { G.diffIdx = d; }
      G.missInRow = 0;
    }
    setFeedback({ text: reason === "timeout" ? "✗ Too slow!" : "✗ Wrong chord", cls: reason === "timeout" ? "timeout" : "wrong" });
    syncState();
    if (G.lives <= 0) setTimeout(endGame, 1000);
    else              setTimeout(nextChord, 1000);
  }

  function handleCorrect(detectedChord: string): void {
    if (!G.waiting) return;
    G.waiting = false;
    stopTimer();
    const elapsed    = performance.now() - G.chordShownAt;
    const sm         = streakMult(++G.streak);
    G.correctInRow++;
    G.missInRow = 0;
    const speedBonus = elapsed < G.customTimeSec * 1000 * 0.4 ? 50 : 0;
    const points     = Math.round(100 * sm * timeMult()) + speedBonus;
    G.score += points;
    if (G.correctInRow >= CORRECT_TO_LEVEL_UP && G.diffIdx < DIFFICULTY_ORDER.length - 1) {
      const nextD = findPlayableDiff(G.diffIdx + 1) ?? G.diffIdx;
      if (nextD > G.diffIdx && availableChords(nextD).length > 0) {
        G.diffIdx = nextD;
        G.correctInRow = 0;
        setFeedback({ text: `✓ ${detectedChord}  +${points}  ↑ LEVEL UP`, cls: "correct" });
      } else {
        setFeedback({ text: speedBonus ? `✓ ${detectedChord}  +${points} (fast!)` : `✓ ${detectedChord}  +${points}`, cls: "correct" });
      }
    } else {
      setFeedback({ text: speedBonus ? `✓ ${detectedChord}  +${points} (fast!)` : `✓ ${detectedChord}  +${points}`, cls: "correct" });
    }
    syncState();
    setTimeout(nextChord, 1000);
  }

  function endGame(): void {
    stopTimer();
    G.waiting = false;
    const best  = getBest();
    const isNew = G.score > best;
    if (isNew) { saveBest(G.score); setHighScore(G.score); }
    setGameOverData({ score: G.score, isNew, diffLabel: DIFFICULTIES[DIFFICULTY_ORDER[G.diffIdx] as Difficulty].label });
    setPhase("gameover");
  }

  function startGame(): void {
    G.score = 0; G.lives = MAX_LIVES; G.streak = 0;
    G.diffIdx = 0; G.correctInRow = 0; G.missInRow = 0;
    // Start at highest difficulty with unlocked chords that is still "easy"
    const d = findPlayableDiff(0);
    if (d >= 0) G.diffIdx = d;
    syncState();
    setPhase("game");
    setTimeout(nextChord, 50);
  }

  const handleChord = useCallback(({ chord, noteNames }: ChordResult) => {
    if (!G.waiting || !G.chord) return;
    if (chord && chordMatches(noteNames, G.chord)) {
      handleCorrect(chord!);
    } else if (chord) {
      setFeedback({ text: `Hearing: ${chord} — need ${G.chord}`, cls: "wrong" });
    }
  }, []);

  useAudio({ onChord: handleChord });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && phase === "game") { stopTimer(); G.waiting = false; onExit(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, onExit]);

  const diff = DIFFICULTIES[DIFFICULTY_ORDER[diffIdx] as Difficulty];

  // Total unlocked chords across all difficulties
  const totalUnlocked = Object.keys(getAllUnlockedVoicings()).length;

  // ── Start screen ──────────────────────────────────────────────────────────
  if (phase === "start") {
    const canPlay = totalUnlocked > 0;
    return (
      <div className="arcade">
        <div className="arc-start">
          <div className="arc-start-title">Guitar Arcade</div>
          <div className="arc-start-hs">High score: {highScore}</div>

          {!canPlay ? (
            <div className="arc-no-chords">
              <p>No chords unlocked yet.</p>
              <p>Visit the <strong>Chord Library</strong> to strum chords and unlock them.</p>
              <button className="btn btn-primary" onClick={onExit}>← Go to Library</button>
            </div>
          ) : (
            <>
              <div className="arc-start-pool">
                {totalUnlocked} chord{totalUnlocked !== 1 ? "s" : ""} unlocked
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.4rem" }}>
                <div className="arc-time-row">
                  <button className="btn btn-sm" onClick={() => { const t = Math.max(MIN_TIME_SEC, customTimeSec - 1); setCustomTimeSec(t); G.customTimeSec = t; }}>◄</button>
                  <span className="arc-time-val">{customTimeSec}s</span>
                  <button className="btn btn-sm" onClick={() => { const t = Math.min(MAX_TIME_SEC, customTimeSec + 1); setCustomTimeSec(t); G.customTimeSec = t; }}>►</button>
                  <span style={{ color: "#888" }}>per chord</span>
                </div>
                <div className="arc-time-hint">score multiplier: x{Math.max(0.5, Math.round((DEFAULT_TIME_SEC / customTimeSec) * 10) / 10).toFixed(1)}</div>
              </div>
              <div className="arc-start-actions">
                <button className="btn btn-primary" onClick={startGame}>Start Game</button>
                <button className="btn-back btn" onClick={onExit}>← Home</button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  // ── Game over screen ──────────────────────────────────────────────────────
  if (phase === "gameover") {
    return (
      <div className="arcade">
        <div className="arc-gameover">
          <div className="arc-gameover-title">GAME OVER</div>
          <div className="arc-gameover-score">Score: {gameOverData.score}</div>
          {gameOverData.isNew && <div className="arc-gameover-new-hs">⭐ NEW HIGH SCORE!</div>}
          <div className="arc-gameover-diff">Reached: {gameOverData.diffLabel}</div>
          <div className="arc-gameover-actions">
            <button className="btn btn-primary" onClick={startGame}>Play Again</button>
            <button className="btn btn-back" onClick={onExit}>← Home</button>
          </div>
        </div>
      </div>
    );
  }

  // ── Game screen ───────────────────────────────────────────────────────────
  return (
    <div className="arcade">
      <div className="arc-hud">
        <button className="btn-back btn" onClick={() => { stopTimer(); G.waiting = false; onExit(); }}>← Quit</button>
        <span className="arc-hud-score">{score}</span>
        <span className="arc-hud-lives">{"♥".repeat(lives)}{"♡".repeat(MAX_LIVES - lives)}</span>
        <span className="arc-diff-badge" style={{ color: diff.color, background: diff.color + "22", borderColor: diff.color + "44" }}>
          {diff.label}
        </span>
        {streak >= 3 && <span className="arc-hud-streak">{streak} STREAK</span>}
        {streak >= 3 && <span className="arc-hud-mult">x{streakMult(streak)}</span>}
      </div>

      <div className="arc-timer-wrap">
        <div ref={timerBarRef} className="arc-timer-bar" />
      </div>

      <div className="arc-game-body">
        <div className="arc-chord-name">{currentChord}</div>
        {currentChord && (
          <div className="arc-diagram-wrap">
            <span className="arc-diagram-label">voicing</span>
            <div dangerouslySetInnerHTML={{ __html: chordDiagramSVG(currentChord, 1.8) }} />
          </div>
        )}
        <div className={`arc-feedback arc-feedback-${feedback.cls}`}>{feedback.text}</div>
      </div>
    </div>
  );
}
