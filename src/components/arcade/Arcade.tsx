import { useCallback, useEffect, useRef, useState } from "react";
import { useAudio } from "../../hooks/useAudio";
import { randomChord, chordMatches, DIFFICULTIES, DIFFICULTY_ORDER } from "../../utils/chordUtils";
import { isChordUnlocked, getAllUnlockedVoicings, chordDiagramSVG } from "../../utils/voicings";
import { pickProgression } from "../../utils/progressions";
import type { ChordResult, Difficulty } from "../../types";

const MAX_LIVES          = 3;
const CORRECT_TO_LEVEL_UP = 10;

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
function fmtMs(ms: number): string {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

type Phase = "start" | "game" | "summary";

interface FeedbackState {
  text: string;
  cls: "correct" | "wrong" | "timeout" | "neutral";
}

interface ChordEntry { chord: string; hits: number; }

interface SummaryData {
  score:        number;
  isNew:        boolean;
  isEndless:    boolean;
  reason:       "gameover" | "quit";
  peakDiffLabel: string;
  chordHistory: ChordEntry[];
  diffTimeMs:   Record<string, number>;
}

function getBest(): number { return parseInt(localStorage.getItem("guitar_arcade_best") ?? "0", 10); }
function saveBest(s: number): void { localStorage.setItem("guitar_arcade_best", String(s)); }

function availableChords(diffIdx: number): string[] {
  const diff = DIFFICULTY_ORDER[diffIdx] as Difficulty;
  return DIFFICULTIES[diff].chords.filter(isChordUnlocked);
}

interface Props { onExit: () => void; }

export default function Arcade({ onExit }: Props) {
  const [phase, setPhase]                       = useState<Phase>("start");
  const [score, setScore]                       = useState(0);
  const [lives, setLives]                       = useState(MAX_LIVES);
  const [streak, setStreak]                     = useState(0);
  const [diffIdx, setDiffIdx]                   = useState(0);
  const [currentChord, setCurrentChord]         = useState("");
  const [feedback, setFeedback]                 = useState<FeedbackState>({ text: "", cls: "neutral" });
  const [highScore, setHighScore]               = useState(getBest);
  const [summaryData, setSummaryData]           = useState<SummaryData | null>(null);
  const [currentBeat, setCurrentBeat]           = useState(-1);
  const [nextChordPreview, setNextChordPreview] = useState("");
  const [beatResults, setBeatResults]           = useState<(boolean | null)[]>([null, null, null, null]);
  const [countInBeat, setCountInBeat]           = useState<number | null>(null);
  const [infiniteMode, setInfiniteMode]         = useState(false);
  const [freeStrumMode, setFreeStrumMode]       = useState(false);
  const [isMatch, setIsMatch]                   = useState(false);

  const G = useRef({
    waiting:           false,
    chord:             "",
    score:             0,
    lives:             MAX_LIVES,
    streak:            0,
    diffIdx:           0,
    correctInRow:      0,
    beatMissStreak:    0,
    chordMissHistory:  [] as number[],
    progQueue:         [] as string[],
    lastDetectedNotes: [] as string[],
    beatNum:           -1,
    beatsHit:          new Set<number>(),
    beatHitArr:        [false, false, false, false] as boolean[],
    nextChordVal:      "",
    pendingAdvance:    false,
    countIn:           0,
    infiniteMode:      false,
    freeStrum:         false,
    chordHistory:      [] as ChordEntry[],
    diffTimeMs:        {} as Record<string, number>,
    diffStartMs:       0,
    peakDiffIdx:       0,
  }).current;

  const timerBarRef  = useRef<HTMLDivElement>(null);
  const rafRef       = useRef<number | null>(null);
  const beatRafRef   = useRef<number | null>(null);
  const audioCtxRef  = useRef<AudioContext | null>(null);
  const tickerGenRef = useRef(0);

  function playClick(accent: boolean): void {
    try {
      if (!audioCtxRef.current) audioCtxRef.current = new AudioContext();
      const ctx = audioCtxRef.current;
      if (ctx.state === "suspended") void ctx.resume();
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = accent ? 1200 : 900;
      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.05);
    } catch (_) { /* audio unavailable */ }
  }

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

  function snapDiffTime(): void {
    const key     = DIFFICULTY_ORDER[G.diffIdx];
    const elapsed = performance.now() - G.diffStartMs;
    G.diffTimeMs[key] = (G.diffTimeMs[key] ?? 0) + elapsed;
    G.diffStartMs = performance.now();
  }

  function stopBeatTicker(): void {
    if (beatRafRef.current) { cancelAnimationFrame(beatRafRef.current); beatRafRef.current = null; }
  }

  function startBeatTicker(): void {
    stopBeatTicker();
    const myGen      = ++tickerGenRef.current;
    const intervalMs = 60000 / diffBpm(G.diffIdx);
    let nextBeatTime = performance.now() + intervalMs;
    let beat = 0;
    const tick = () => {
      if (!G.waiting || tickerGenRef.current !== myGen) return;
      const now = performance.now();
      if (now >= nextBeatTime) {
        handleBeat(beat);
        beat = (beat + 1) % 4;
        nextBeatTime += intervalMs;
      }
      if (tickerGenRef.current === myGen) {
        beatRafRef.current = requestAnimationFrame(tick);
      }
    };
    beatRafRef.current = requestAnimationFrame(tick);
  }

  function checkLevelDown(): boolean {
    if (G.diffIdx <= 0) return false;
    const h = G.chordMissHistory;
    return (
      G.beatMissStreak >= 6 ||
      (h.length >= 2 && h.slice(-2).every(m => m >= 3)) ||
      (h.length >= 4 && h.slice(-4).every(m => m >= 2))
    );
  }

  function tallyAndAdvance(): void {
    const hits   = G.beatsHit.size;
    const missed = 4 - hits;
    G.beatsHit.clear();
    G.pendingAdvance = false;

    // Record this chord result for session stats
    if (G.chord) G.chordHistory.push({ chord: G.chord, hits });

    // Update beat miss tracking
    G.chordMissHistory.push(missed);
    if (G.chordMissHistory.length > 4) G.chordMissHistory.shift();
    if (hits === 0) {
      G.beatMissStreak += 4;
    } else {
      G.beatMissStreak = 0;
    }

    let diffChanged = false;

    if (hits === 0) {
      if (!G.infiniteMode) G.lives--;
      G.streak = 0; G.correctInRow = 0;

      if (checkLevelDown()) {
        const d = findPlayableDiff(G.diffIdx - 1);
        if (d >= 0) {
          snapDiffTime();
          G.diffIdx = d;
          G.diffStartMs = performance.now();
          diffChanged = true;
        }
        G.beatMissStreak = 0;
        G.chordMissHistory = [];
        setFeedback({ text: `✗ Missed  ↓ ${diffBpm(G.diffIdx)} BPM`, cls: "timeout" });
      } else {
        setFeedback({ text: "✗ Missed!", cls: "timeout" });
      }
      syncState();
      if (!G.infiniteMode && G.lives <= 0) { G.waiting = false; setTimeout(() => endGame("gameover"), 800); return; }
    } else {
      const sm = streakMult(++G.streak);
      G.correctInRow++;
      const points = Math.round(hits * 25 * timeMult() * sm);
      G.score     += points;
      const label  = hits === 4 ? "Perfect!" : `${hits}/4`;

      // Level-down check even on partial hit (e.g. 4 chords with 2 misses each)
      if (checkLevelDown()) {
        const d = findPlayableDiff(G.diffIdx - 1);
        if (d >= 0) {
          snapDiffTime();
          G.diffIdx = d;
          G.diffStartMs = performance.now();
          diffChanged = true;
        }
        G.beatMissStreak = 0;
        G.chordMissHistory = [];
        setFeedback({ text: `↓ ${diffBpm(G.diffIdx)} BPM  ${label}  +${points}`, cls: "timeout" });
      } else if (G.correctInRow >= CORRECT_TO_LEVEL_UP && G.diffIdx < DIFFICULTY_ORDER.length - 1) {
        const nextD = findPlayableDiff(G.diffIdx + 1) ?? G.diffIdx;
        if (nextD > G.diffIdx && availableChords(nextD).length > 0) {
          snapDiffTime();
          G.diffIdx = nextD; G.correctInRow = 0;
          G.beatMissStreak = 0; G.chordMissHistory = [];
          G.diffStartMs = performance.now();
          diffChanged = true;
          if (nextD > G.peakDiffIdx) G.peakDiffIdx = nextD;
          setFeedback({ text: `✓ ${label}  +${points}  ↑ ${diffBpm(G.diffIdx)} BPM`, cls: "correct" });
        } else {
          setFeedback({ text: `✓ ${label}  +${points}`, cls: "correct" });
        }
      } else {
        setFeedback({ text: `✓ ${label}  +${points}`, cls: "correct" });
      }
      syncState();
    }

    stopTimer();
    if (diffChanged) {
      G.countIn = 4;
      G.chord = "";
      G.beatNum = -1;
      G.beatHitArr = [false, false, false, false];
      setBeatResults([null, null, null, null]);
      setCurrentChord("");
      setNextChordPreview("");
      stopBeatTicker();
      startBeatTicker();
    } else {
      advanceChord();
      startTimer(diffTimeSec(G.diffIdx) * 1000);
    }
  }

  function handleBeat(beat: number): void {
    playClick(beat === 0);

    if (G.countIn > 0) {
      setCurrentBeat(beat);
      setCountInBeat(5 - G.countIn);
      G.countIn--;
      if (G.countIn === 0) {
        setTimeout(advanceChord, 0);
      }
      return;
    }

    if (beat === 0 && G.pendingAdvance) {
      tallyAndAdvance();
      if (!G.waiting) return;
      if (G.countIn > 0) return;
    }

    G.beatNum = beat;
    setCurrentBeat(beat);

    // Free strum: match on each beat tick instead of requiring a muted restrum
    if (G.freeStrum && G.chord && G.lastDetectedNotes.length > 0) {
      if (chordMatches(G.lastDetectedNotes, G.chord)) {
        G.beatsHit.add(beat);
        G.beatHitArr[beat] = true;
      }
    }

    setBeatResults([...G.beatHitArr]);

    if (beat === 3) {
      G.pendingAdvance = true;
    }
  }

  function advanceChord(): void {
    G.beatNum = -1;
    G.beatHitArr = [false, false, false, false];
    setBeatResults([null, null, null, null]);
    setCountInBeat(null);
    if (G.progQueue.length < 2) {
      const prog = pickProgression(Object.keys(getAllUnlockedVoicings()));
      if (prog) G.progQueue.push(...prog);
    }
    const chord = G.progQueue.length > 0
      ? G.progQueue.shift()!
      : randomChord(DIFFICULTY_ORDER[G.diffIdx] as Difficulty, availableChords(G.diffIdx));
    if (!chord) { G.waiting = false; endGame("gameover"); return; }
    G.chord = chord;
    G.lastDetectedNotes = [];
    setCurrentChord(chord);
    setIsMatch(false);

    const preview = G.progQueue[0] ?? "";
    G.nextChordVal = preview;
    setNextChordPreview(preview);
  }

  function endGame(reason: "gameover" | "quit"): void {
    stopTimer();
    stopBeatTicker();
    G.waiting = false;
    setCurrentBeat(-1);
    snapDiffTime();
    const best  = getBest();
    const isNew = G.score > best;
    if (isNew) { saveBest(G.score); setHighScore(G.score); }
    setSummaryData({
      score:         G.score,
      isNew,
      isEndless:     G.infiniteMode,
      reason,
      peakDiffLabel: DIFFICULTIES[DIFFICULTY_ORDER[G.peakDiffIdx] as Difficulty].label,
      chordHistory:  [...G.chordHistory],
      diffTimeMs:    { ...G.diffTimeMs },
    });
    setPhase("summary");
  }

  function startGame(infinite = false): void {
    G.score = 0; G.lives = MAX_LIVES; G.streak = 0;
    G.diffIdx = 0; G.correctInRow = 0;
    G.beatMissStreak = 0; G.chordMissHistory = [];
    G.progQueue = []; G.beatNum = -1; G.beatsHit.clear();
    G.beatHitArr = [false, false, false, false];
    G.lastDetectedNotes = []; G.nextChordVal = ""; G.pendingAdvance = false; G.countIn = 4;
    G.infiniteMode = infinite;
    G.freeStrum    = freeStrumMode;
    G.chordHistory = []; G.diffTimeMs = {}; G.peakDiffIdx = 0;
    const d = findPlayableDiff(0);
    if (d >= 0) G.diffIdx = d;
    G.diffStartMs = performance.now();
    syncState();
    setCurrentBeat(-1);
    setNextChordPreview("");
    setCurrentChord("");
    setCountInBeat(null);
    setPhase("game");
    setTimeout(() => {
      G.waiting = true;
      startBeatTicker();
    }, 50);
  }

  const handleChord = useCallback(({ chord, noteNames }: ChordResult) => {
    G.lastDetectedNotes = noteNames;
    if (chord && G.chord) {
      const matched = chordMatches(noteNames, G.chord);
      setIsMatch(matched);
      setFeedback({ text: `Hearing: ${chord}`, cls: "neutral" });
    }
  }, []);

  const handleStrum = useCallback(() => {
    if (!G.waiting || !G.chord || G.beatNum < 0) return;
    if (G.lastDetectedNotes.length > 0 && chordMatches(G.lastDetectedNotes, G.chord)) {
      G.beatsHit.add(G.beatNum);
      G.beatHitArr[G.beatNum] = true;
    }
  }, []);

  useAudio({ onChord: handleChord, onStrum: handleStrum });

  useEffect(() => {
    return () => { stopTimer(); stopBeatTicker(); audioCtxRef.current?.close(); };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && phase === "game") {
        stopTimer(); stopBeatTicker(); G.waiting = false;
        endGame("quit");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase]);

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
              <div className="arc-mode-toggle">
                <button
                  className={`arc-mode-btn${!infiniteMode ? " active" : ""}`}
                  onClick={() => setInfiniteMode(false)}
                >Normal</button>
                <button
                  className={`arc-mode-btn${infiniteMode ? " active" : ""}`}
                  onClick={() => setInfiniteMode(true)}
                >Endless ∞</button>
              </div>
              {infiniteMode && (
                <div className="arc-mode-hint">No lives — difficulty adapts to your playing</div>
              )}
              <div className="arc-mode-toggle">
                <button
                  className={`arc-mode-btn${!freeStrumMode ? " active" : ""}`}
                  onClick={() => setFreeStrumMode(false)}
                >Beat Sync</button>
                <button
                  className={`arc-mode-btn${freeStrumMode ? " active" : ""}`}
                  onClick={() => setFreeStrumMode(true)}
                >Free Strum</button>
              </div>
              {freeStrumMode
                ? <div className="arc-mode-hint">Strum anytime — no muting needed</div>
                : <div className="arc-mode-hint">Mute between beats for best detection</div>
              }
              <div className="arc-start-actions">
                <button className="btn btn-primary" onClick={() => startGame(infiniteMode)}>Start Game</button>
                <button className="btn-back btn" onClick={onExit}>← Home</button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  // ── Summary screen (quit + game over) ─────────────────────────────────────
  if (phase === "summary" && summaryData) {
    const sd = summaryData;

    // Chord breakdown counts
    const breakdown = [4, 3, 2, 1, 0].map(n => ({
      hits:  n,
      count: sd.chordHistory.filter(e => e.hits === n).length,
    }));
    const breakdownLabels: Record<number, string> = {
      4: "Perfect (4/4)",
      3: "Good (3/4)",
      2: "Shaky (2/4)",
      1: "Barely (1/4)",
      0: "Missed (0/4)",
    };
    const breakdownCls: Record<number, string> = {
      4: "bk-perfect", 3: "bk-good", 2: "bk-shaky", 1: "bk-barely", 0: "bk-missed",
    };

    // Per-chord average hits (worst first)
    const chordMap = new Map<string, { total: number; count: number }>();
    for (const e of sd.chordHistory) {
      const cur = chordMap.get(e.chord) ?? { total: 0, count: 0 };
      chordMap.set(e.chord, { total: cur.total + e.hits, count: cur.count + 1 });
    }
    const worstChords = [...chordMap.entries()]
      .map(([chord, { total, count }]) => ({ chord, avg: total / count, count }))
      .filter(c => c.avg < 3)
      .sort((a, b) => a.avg - b.avg)
      .slice(0, 6);

    // Diff times (only diffs with time > 1s)
    const diffTimes = DIFFICULTY_ORDER
      .map(key => ({ label: DIFFICULTIES[key as Difficulty].label, color: DIFFICULTIES[key as Difficulty].color, ms: sd.diffTimeMs[key] ?? 0 }))
      .filter(d => d.ms > 1000);

    return (
      <div className="arcade">
        <div className="arc-summary">
          <div className="arc-summary-title">
            {sd.reason === "gameover" ? "GAME OVER" : "SESSION SUMMARY"}
          </div>
          {sd.isEndless && <div className="arc-summary-mode">Endless Mode</div>}

          <div className="arc-summary-score-row">
            <div className="arc-summary-stat">
              <span className="arc-summary-stat-val">{sd.score}</span>
              <span className="arc-summary-stat-lbl">score</span>
            </div>
            <div className="arc-summary-stat">
              <span className="arc-summary-stat-val">{highScore}</span>
              <span className="arc-summary-stat-lbl">best</span>
            </div>
            <div className="arc-summary-stat">
              <span className="arc-summary-stat-val">{sd.chordHistory.length}</span>
              <span className="arc-summary-stat-lbl">chords</span>
            </div>
          </div>
          {sd.isNew && <div className="arc-summary-new-hs">NEW HIGH SCORE!</div>}

          <div className="arc-summary-section-title">Chord Results</div>
          <div className="arc-summary-breakdown">
            {breakdown.map(b => (
              <div key={b.hits} className={`arc-bk-row ${breakdownCls[b.hits]}`}>
                <span className="arc-bk-label">{breakdownLabels[b.hits]}</span>
                <span className="arc-bk-bar-wrap">
                  <span
                    className="arc-bk-bar"
                    style={{ width: sd.chordHistory.length > 0 ? `${(b.count / sd.chordHistory.length) * 100}%` : "0%" }}
                  />
                </span>
                <span className="arc-bk-count">{b.count}</span>
              </div>
            ))}
          </div>

          {worstChords.length > 0 && (
            <>
              <div className="arc-summary-section-title">Needs Work</div>
              <div className="arc-summary-worst">
                {worstChords.map(c => (
                  <div key={c.chord} className="arc-worst-row">
                    <span className="arc-worst-chord">{c.chord}</span>
                    <span className="arc-worst-avg">{c.avg.toFixed(1)}/4 avg</span>
                    <span className="arc-worst-plays">{c.count}×</span>
                  </div>
                ))}
              </div>
            </>
          )}

          {diffTimes.length > 0 && (
            <>
              <div className="arc-summary-section-title">Time per Difficulty</div>
              <div className="arc-summary-diff-times">
                {diffTimes.map(d => (
                  <div key={d.label} className="arc-diff-time-row">
                    <span className="arc-diff-time-badge" style={{ color: d.color }}>{d.label}</span>
                    <span className="arc-diff-time-val">{fmtMs(d.ms)}</span>
                  </div>
                ))}
              </div>
            </>
          )}

          <div className="arc-summary-actions">
            <button className="btn btn-primary" onClick={() => startGame(sd.isEndless)}>Play Again</button>
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
        <button className="btn-back btn" onClick={() => { stopTimer(); stopBeatTicker(); G.waiting = false; endGame("quit"); }}>← Quit</button>
        <span className="arc-hud-score">{score}</span>
        {G.infiniteMode
          ? <span className="arc-hud-lives">∞</span>
          : <span className="arc-hud-lives">{"♥".repeat(lives)}{"♡".repeat(MAX_LIVES - lives)}</span>
        }
        <span className="arc-diff-badge" style={{ color: diff.color, background: diff.color + "22", borderColor: diff.color + "44" }}>
          {diff.label}
        </span>
        {streak >= 3 && <span className="arc-hud-streak">{streak} STREAK</span>}
        {streak >= 3 && <span className="arc-hud-mult">x{streakMult(streak)}</span>}
      </div>

      <div className="arc-beats">
        {[0, 1, 2, 3].map(i => {
          const isActive = currentBeat === i;
          const isPast   = currentBeat > i;
          const result   = beatResults[i];
          const scored   = isPast && result !== null && !freeStrumMode;
          const cls = `arc-beat-dot${isActive ? " active" : scored ? (result ? " hit" : " miss") : ""}`;
          return (
            <div key={i} className={cls}>
              {scored && (result ? "✓" : "✗")}
            </div>
          );
        })}
      </div>

      <div className="arc-game-body">
        {countInBeat !== null ? (
          <div className="arc-countin">
            <div className="arc-countin-label">get ready</div>
            <div className="arc-countin-num">{countInBeat}</div>
          </div>
        ) : (
          <>
            <div className={`arc-chord-name${isMatch ? " arc-chord-match" : ""}`}>{currentChord}</div>
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
          </>
        )}
      </div>
    </div>
  );
}
