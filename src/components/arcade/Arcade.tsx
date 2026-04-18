import { useCallback, useEffect, useRef, useState } from "react";
import { useAudio } from "../../hooks/useAudio";
import { randomChord, chordMatches, DIFFICULTIES, DIFFICULTY_ORDER } from "../../utils/chordUtils";
import { isChordUnlocked, getAllUnlockedVoicings, chordDiagramSVG } from "../../utils/voicings";
import { pickProgression } from "../../utils/progressions";
import type { ChordResult, Difficulty } from "../../types";

const MAX_LIVES           = 3;
const CORRECT_TO_LEVEL_UP  = 5;
const MISSES_TO_LEVEL_DOWN = 2;

const DIFFICULTY_BPM: Record<string, number> = {
  easy: 60, medium: 80, hard: 100, expert: 120,
};
const DIFFICULTY_TIMES: Record<string, number> = {
  easy: 4, medium: 3, hard: 2.4, expert: 2,
};

function diffBpm(diffIdx: number): number {
  return DIFFICULTY_BPM[DIFFICULTY_ORDER[diffIdx]] ?? 60;
}
function diffTimeSec(diffIdx: number): number {
  return DIFFICULTY_TIMES[DIFFICULTY_ORDER[diffIdx]] ?? 4;
}

type Phase = "start" | "game" | "gameover";

interface FeedbackState {
  text: string;
  cls: "correct" | "wrong" | "timeout" | "neutral";
}

function getBest(): number { return parseInt(localStorage.getItem("guitar_arcade_best") ?? "0", 10); }
function saveBest(s: number): void { localStorage.setItem("guitar_arcade_best", String(s)); }

function availableChords(diffIdx: number): string[] {
  const diff = DIFFICULTY_ORDER[diffIdx] as Difficulty;
  return DIFFICULTIES[diff].chords.filter(isChordUnlocked);
}

interface Props {
  onExit: () => void;
}

export default function Arcade({ onExit }: Props) {
  const [phase, setPhase]                       = useState<Phase>("start");
  const [score, setScore]                       = useState(0);
  const [lives, setLives]                       = useState(MAX_LIVES);
  const [streak, setStreak]                     = useState(0);
  const [diffIdx, setDiffIdx]                   = useState(0);
  const [currentChord, setCurrentChord]         = useState("");
  const [feedback, setFeedback]                 = useState<FeedbackState>({ text: "", cls: "neutral" });
  const [highScore, setHighScore]               = useState(getBest);
  const [gameOverData, setGameOverData]         = useState({ score: 0, isNew: false, diffLabel: "EASY" });
  const [currentBeat, setCurrentBeat]           = useState(-1);
  const [nextChordPreview, setNextChordPreview] = useState("");

  const G = useRef({
    waiting:           false,
    chord:             "",
    score:             0,
    lives:             MAX_LIVES,
    streak:            0,
    diffIdx:           0,
    correctInRow:      0,
    missInRow:         0,
    progQueue:         [] as string[],
    lastDetectedNotes: [] as string[],
    beatNum:           -1,          // current beat 0-3, -1 = transition gap
    beatsHit:          new Set<number>(),
    nextChordVal:      "",
  }).current;

  const timerBarRef = useRef<HTMLDivElement>(null);
  const rafRef      = useRef<number | null>(null);
  const beatRafRef  = useRef<number | null>(null);

  function timeMult(): number {
    return Math.round((diffBpm(G.diffIdx) / 60) * 10) / 10;
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
      if (rem > 0) rafRef.current = requestAnimationFrame(tick);
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

  function findPlayableDiff(startIdx: number): number {
    for (let i = startIdx; i >= 0; i--) {
      if (availableChords(i).length > 0) return i;
    }
    return -1;
  }

  function stopBeatTicker(): void {
    if (beatRafRef.current) { cancelAnimationFrame(beatRafRef.current); beatRafRef.current = null; }
  }

  function startBeatTicker(): void {
    stopBeatTicker();
    const intervalMs = 60000 / diffBpm(G.diffIdx);
    let nextBeatTime = performance.now() + intervalMs;
    let beat = 0;
    const tick = () => {
      if (!G.waiting) return;
      const now = performance.now();
      if (now >= nextBeatTime) {
        handleBeat(beat);
        beat = (beat + 1) % 4;
        nextBeatTime += intervalMs;
      }
      beatRafRef.current = requestAnimationFrame(tick);
    };
    beatRafRef.current = requestAnimationFrame(tick);
  }

  function handleBeat(beat: number): void {
    G.beatNum = beat;
    setCurrentBeat(beat);

    if (beat !== 3) return;

    const hits = G.beatsHit.size;
    G.beatsHit.clear();

    if (hits === 0) {
      G.lives--; G.streak = 0; G.missInRow++; G.correctInRow = 0;
      if (G.missInRow >= MISSES_TO_LEVEL_DOWN && G.diffIdx > 0) {
        const d = findPlayableDiff(G.diffIdx - 1);
        if (d >= 0) { G.diffIdx = d; }
        G.missInRow = 0;
        stopBeatTicker(); startBeatTicker();
      }
      setFeedback({ text: "✗ Missed!", cls: "timeout" });
      syncState();
      if (G.lives <= 0) { G.waiting = false; setTimeout(endGame, 800); return; }
    } else {
      const sm     = streakMult(++G.streak);
      G.missInRow  = 0; G.correctInRow++;
      const points = Math.round(hits * 25 * timeMult() * sm);
      G.score     += points;
      const label  = hits === 4 ? "Perfect!" : `${hits}/4`;
      if (G.correctInRow >= CORRECT_TO_LEVEL_UP && G.diffIdx < DIFFICULTY_ORDER.length - 1) {
        const nextD = findPlayableDiff(G.diffIdx + 1) ?? G.diffIdx;
        if (nextD > G.diffIdx && availableChords(nextD).length > 0) {
          G.diffIdx = nextD; G.correctInRow = 0;
          stopBeatTicker(); startBeatTicker();
          setFeedback({ text: `✓ ${label}  +${points}  ↑ LEVEL UP`, cls: "correct" });
        } else {
          setFeedback({ text: `✓ ${label}  +${points}`, cls: "correct" });
        }
      } else {
        setFeedback({ text: `✓ ${label}  +${points}`, cls: "correct" });
      }
      syncState();
    }

    advanceChord();
    stopTimer(); startTimer(diffTimeSec(G.diffIdx) * 1000);
  }

  function advanceChord(): void {
    G.beatNum = -1; // block strum attribution during chord transition
    if (G.progQueue.length < 2) {
      const prog = pickProgression(Object.keys(getAllUnlockedVoicings()));
      if (prog) G.progQueue.push(...prog);
    }
    const chord = G.progQueue.length > 0
      ? G.progQueue.shift()!
      : randomChord(DIFFICULTY_ORDER[G.diffIdx] as Difficulty, availableChords(G.diffIdx));
    if (!chord) { G.waiting = false; endGame(); return; }
    G.chord = chord;
    G.lastDetectedNotes = [];
    setCurrentChord(chord);

    const preview = G.progQueue[0] ?? "";
    G.nextChordVal = preview;
    setNextChordPreview(preview);
  }

  function endGame(): void {
    stopTimer();
    stopBeatTicker();
    G.waiting = false;
    setCurrentBeat(-1);
    const best  = getBest();
    const isNew = G.score > best;
    if (isNew) { saveBest(G.score); setHighScore(G.score); }
    setGameOverData({ score: G.score, isNew, diffLabel: DIFFICULTIES[DIFFICULTY_ORDER[G.diffIdx] as Difficulty].label });
    setPhase("gameover");
  }

  function startGame(): void {
    G.score = 0; G.lives = MAX_LIVES; G.streak = 0;
    G.diffIdx = 0; G.correctInRow = 0; G.missInRow = 0;
    G.progQueue = []; G.beatNum = -1; G.beatsHit.clear(); G.lastDetectedNotes = []; G.nextChordVal = "";
    const d = findPlayableDiff(0);
    if (d >= 0) G.diffIdx = d;
    syncState();
    setCurrentBeat(-1);
    setNextChordPreview("");
    setPhase("game");
    setTimeout(() => {
      G.waiting = true;
      advanceChord();
      startTimer(diffTimeSec(G.diffIdx) * 1000);
      startBeatTicker();
    }, 50);
  }

  const handleChord = useCallback(({ chord, noteNames }: ChordResult) => {
    G.lastDetectedNotes = noteNames;
    if (chord && G.chord) {
      setFeedback({ text: `Hearing: ${chord}`, cls: "neutral" });
    }
  }, []);

  const handleStrum = useCallback(() => {
    if (!G.waiting || !G.chord || G.beatNum < 0) return;
    if (G.lastDetectedNotes.length > 0 && chordMatches(G.lastDetectedNotes, G.chord)) {
      G.beatsHit.add(G.beatNum);
    }
  }, []);

  useAudio({ onChord: handleChord, onStrum: handleStrum });

  useEffect(() => {
    return () => { stopTimer(); stopBeatTicker(); };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && phase === "game") {
        stopTimer(); stopBeatTicker(); G.waiting = false; onExit();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, onExit]);

  const diff          = DIFFICULTIES[DIFFICULTY_ORDER[diffIdx] as Difficulty];
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
              <div className="arc-time-hint">
                4 beats per chord · 60 → 80 → 100 → 120 BPM
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
        <button className="btn-back btn" onClick={() => { stopTimer(); stopBeatTicker(); G.waiting = false; onExit(); }}>← Quit</button>
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

      <div className="arc-beats">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className={`arc-beat-dot${currentBeat === i ? " active" : ""}`} />
        ))}
      </div>

      <div className="arc-game-body">
        <div className="arc-chord-name">{currentChord}</div>
        {currentChord && (
          <div className="arc-diagram-wrap">
            <span className="arc-diagram-label">voicing</span>
            <div dangerouslySetInnerHTML={{ __html: chordDiagramSVG(currentChord, 1.8) }} />
          </div>
        )}
        {nextChordPreview && (
          <div className="arc-next-wrap">
            <div className="arc-next-label">up next</div>
            <div className="arc-next-chord">{nextChordPreview}</div>
          </div>
        )}
        <div className={`arc-feedback arc-feedback-${feedback.cls}`}>{feedback.text}</div>
      </div>
    </div>
  );
}
