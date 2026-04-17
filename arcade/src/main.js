import { AudioEngine } from "./audio/AudioEngine.js";
import { ChordDetector } from "./audio/ChordDetector.js";
import { randomChord, chordMatches, DIFFICULTIES, DIFFICULTY_ORDER } from "./utils/chordUtils.js";

// ── DOM ───────────────────────────────────────────────────────────────────────
const screenStart    = document.getElementById("screen-start");
const screenGame     = document.getElementById("screen-game");
const screenGameover = document.getElementById("screen-gameover");

const bestScoreEl    = document.getElementById("best-score-start");
const btnStart       = document.getElementById("btn-start");
const btnRestart     = document.getElementById("btn-restart");

const scoreDisplay   = document.getElementById("score-display");
const diffBadge      = document.getElementById("difficulty-badge");
const livesDisplay   = document.getElementById("lives-display");
const streakDisplay  = document.getElementById("streak-display");
const chordDisplay   = document.getElementById("chord-display");
const timerBar       = document.getElementById("timer-bar");
const feedback       = document.getElementById("feedback");
const multiplierEl   = document.getElementById("multiplier-display");

const finalScore     = document.getElementById("final-score");
const newHighScore   = document.getElementById("new-high-score");
const reachedDiff    = document.getElementById("reached-difficulty");

const btnTimeDown    = document.getElementById("btn-time-down");
const btnTimeUp      = document.getElementById("btn-time-up");
const timeValueEl    = document.getElementById("time-value");
const timeScoreHint  = document.getElementById("time-score-hint");

// ── Constants ─────────────────────────────────────────────────────────────────
const MAX_LIVES    = 3;
const DEFAULT_TIME = 6; // seconds — baseline for score multiplier calculation
const MIN_TIME     = 2;
const MAX_TIME     = 15;
const CORRECT_TO_LEVEL_UP   = 5;  // consecutive correct to increase difficulty
const MISSES_TO_LEVEL_DOWN  = 2;  // consecutive misses/timeouts to decrease difficulty

// ── State ─────────────────────────────────────────────────────────────────────
let engine   = null;
let detector = null;

let customTimeSec  = DEFAULT_TIME;

let score          = 0;
let lives          = MAX_LIVES;
let streak         = 0;
let difficultyIdx  = 0;
let correctInRow   = 0;
let missInRow      = 0;
let currentChord   = null;
let chordShownAt   = null;
let waitingForChord = false;
let timerRafId     = null;

// ── Persistence ───────────────────────────────────────────────────────────────
function getBestScore() { return parseInt(localStorage.getItem("guitar_arcade_best") ?? "0", 10); }
function saveBestScore(s) { localStorage.setItem("guitar_arcade_best", String(s)); }

// ── Screen helpers ────────────────────────────────────────────────────────────
function showScreen(name) {
  screenStart.hidden    = name !== "start";
  screenGame.hidden     = name !== "game";
  screenGameover.hidden = name !== "gameover";
}

// ── Audio bootstrap ───────────────────────────────────────────────────────────
async function initAudio() {
  if (engine) return; // already connected

  detector = new ChordDetector({ onChord: handleChordDetected });
  engine = new AudioEngine({
    fftSize: 4096,
    onFrame: (freqData, meta) => detector.process(freqData, meta),
  });
  await engine.start();
}

// ── Game lifecycle ────────────────────────────────────────────────────────────
async function startGame() {
  btnStart.disabled = true;
  btnStart.textContent = "Connecting...";

  try {
    await initAudio();
  } catch {
    btnStart.disabled = false;
    btnStart.textContent = "Connect + Play";
    feedback.textContent = "⚠ Mic access denied.";
    return;
  }

  score         = 0;
  lives         = MAX_LIVES;
  streak        = 0;
  difficultyIdx = 0;
  correctInRow  = 0;
  missInRow     = 0;

  showScreen("game");
  updateHUD();
  nextChord();
}

function endGame() {
  stopTimer();
  waitingForChord = false;

  const best = getBestScore();
  const isNew = score > best;
  if (isNew) saveBestScore(score);

  finalScore.textContent  = score;
  newHighScore.hidden     = !isNew;
  reachedDiff.textContent = `Reached: ${DIFFICULTIES[DIFFICULTY_ORDER[difficultyIdx]].label}`;
  bestScoreEl.textContent = getBestScore();

  showScreen("gameover");
}

// ── Round logic ───────────────────────────────────────────────────────────────
function activeTimeMs() {
  return customTimeSec * 1000;
}

function timeMultiplier() {
  return Math.max(0.5, Math.round((DEFAULT_TIME / customTimeSec) * 10) / 10);
}

function nextChord() {
  stopTimer();
  const difficulty = DIFFICULTY_ORDER[difficultyIdx];
  currentChord  = randomChord(difficulty);
  chordShownAt  = performance.now();
  waitingForChord = true;

  chordDisplay.textContent = currentChord;
  feedback.textContent     = "Strum it!";
  feedback.className       = "";

  startTimer(activeTimeMs());
}

function onCorrect(detectedChord) {
  if (!waitingForChord) return;
  waitingForChord = false;
  stopTimer();

  const elapsed = performance.now() - chordShownAt;
  streak++;
  correctInRow++;
  missInRow = 0;

  const mult = multiplier(streak);
  const timeMult = timeMultiplier();
  const speedBonus = elapsed < activeTimeMs() * 0.4 ? 50 : 0;
  const points = Math.round(100 * mult * timeMult) + speedBonus;
  score += points;

  feedback.textContent = speedBonus
    ? `✓ ${detectedChord}  +${points} (fast!)`
    : `✓ ${detectedChord}  +${points}`;
  feedback.className = "correct";

  if (correctInRow >= CORRECT_TO_LEVEL_UP && difficultyIdx < DIFFICULTY_ORDER.length - 1) {
    difficultyIdx++;
    correctInRow = 0;
    feedback.textContent += "  ↑ LEVEL UP";
  }

  updateHUD();
  setTimeout(nextChord, 900);
}

function onMiss(reason) {
  waitingForChord = false;
  stopTimer();

  lives--;
  streak = 0;
  missInRow++;
  correctInRow = 0;

  if (missInRow >= MISSES_TO_LEVEL_DOWN && difficultyIdx > 0) {
    difficultyIdx--;
    missInRow = 0;
  }

  feedback.textContent = reason === "timeout" ? "✗ Too slow!" : `✗ Wrong chord`;
  feedback.className   = reason === "timeout" ? "timeout" : "wrong";

  updateHUD();

  if (lives <= 0) {
    setTimeout(endGame, 1000);
  } else {
    setTimeout(nextChord, 1000);
  }
}

// ── Timer ─────────────────────────────────────────────────────────────────────
function startTimer(durationMs) {
  const start = performance.now();

  function tick() {
    const elapsed  = performance.now() - start;
    const remaining = Math.max(0, 1 - elapsed / durationMs);

    timerBar.style.width = `${remaining * 100}%`;

    // Color: green → yellow → red
    if (remaining > 0.5)      timerBar.style.background = "#1db954";
    else if (remaining > 0.25) timerBar.style.background = "#f0a500";
    else                       timerBar.style.background = "#e04040";

    if (remaining <= 0) {
      if (waitingForChord) onMiss("timeout");
      return;
    }
    timerRafId = requestAnimationFrame(tick);
  }

  timerRafId = requestAnimationFrame(tick);
}

function stopTimer() {
  if (timerRafId) {
    cancelAnimationFrame(timerRafId);
    timerRafId = null;
  }
  timerBar.style.width = "100%";
  timerBar.style.background = "#1db954";
}

// ── Chord detection callback ──────────────────────────────────────────────────
function handleChordDetected({ chord, noteNames }) {
  if (!waitingForChord || !currentChord) return;

  if (chord && chordMatches(noteNames, currentChord)) {
    onCorrect(chord);
  } else if (chord && chord !== currentChord) {
    // Wrong chord — show feedback but don't penalize (let timer do it)
    feedback.textContent = `Hearing: ${chord} — need ${currentChord}`;
    feedback.className   = "wrong";
  }
}

// ── HUD ───────────────────────────────────────────────────────────────────────
function multiplier(s) {
  if (s >= 8) return 4;
  if (s >= 5) return 3;
  if (s >= 3) return 2;
  return 1;
}

function updateHUD() {
  const difficulty = DIFFICULTY_ORDER[difficultyIdx];
  const diff       = DIFFICULTIES[difficulty];

  scoreDisplay.textContent = score;
  livesDisplay.textContent = "♥".repeat(lives) + "♡".repeat(MAX_LIVES - lives);

  diffBadge.textContent   = diff.label;
  diffBadge.style.color   = diff.color;
  diffBadge.style.background = diff.color + "22";
  diffBadge.style.borderColor = diff.color + "44";

  if (streak >= 3) {
    const mult = multiplier(streak);
    streakDisplay.textContent   = `${streak} STREAK`;
    multiplierEl.textContent    = `x${mult} MULTIPLIER`;
    multiplierEl.className      = "active";
  } else {
    streakDisplay.textContent = streak > 0 ? `${streak} streak` : "";
    multiplierEl.textContent  = "";
    multiplierEl.className    = "";
  }
}

// ── Time control ──────────────────────────────────────────────────────────────
function updateTimeUI() {
  timeValueEl.textContent  = `${customTimeSec}s`;
  const mult = Math.max(0.5, Math.round((DEFAULT_TIME / customTimeSec) * 10) / 10);
  timeScoreHint.textContent = `score multiplier: x${mult.toFixed(1)}`;
}

btnTimeDown.addEventListener("click", () => {
  if (customTimeSec > MIN_TIME) { customTimeSec--; updateTimeUI(); }
});
btnTimeUp.addEventListener("click", () => {
  if (customTimeSec < MAX_TIME) { customTimeSec++; updateTimeUI(); }
});

// ── Escape to quit ────────────────────────────────────────────────────────────
function quitGame() {
  stopTimer();
  waitingForChord = false;
  showScreen("start");
  btnStart.disabled    = false;
  btnStart.textContent = "Connect + Play";
}

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !screenGame.hidden) quitGame();
});

// ── Event listeners ───────────────────────────────────────────────────────────
btnStart.addEventListener("click", startGame);
btnRestart.addEventListener("click", () => {
  showScreen("start");
  btnStart.disabled    = false;
  btnStart.textContent = "Connect + Play";
  startGame();
});

// Init
bestScoreEl.textContent = getBestScore();
updateTimeUI();
