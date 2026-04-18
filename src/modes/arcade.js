import { randomChord, chordMatches, DIFFICULTIES, DIFFICULTY_ORDER } from "../utils/chordUtils.js";
import { chordDiagramSVG } from "../utils/voicings.js";

const MAX_LIVES           = 3;
const CORRECT_TO_LEVEL_UP = 5;
const MISSES_TO_LEVEL_DOWN = 2;
const DEFAULT_TIME        = 6;
const MIN_TIME            = 2;
const MAX_TIME            = 15;

// ── DOM (all elements live inside #screen-arcade) ─────────────────────────────
const $ = id => document.getElementById(id);

export function initArcade({ getAudio, onBack }) {
  const scoreDisplay   = $("arc-score");
  const diffBadge      = $("arc-diff");
  const livesDisplay   = $("arc-lives");
  const streakDisplay  = $("arc-streak");
  const chordDisplay   = $("arc-chord");
  const diagramWrap    = $("arc-diagram");
  const timerBar       = $("arc-timer-bar");
  const feedbackEl     = $("arc-feedback");
  const multiplierEl   = $("arc-mult");
  const finalScore     = $("arc-final-score");
  const newHighScore   = $("arc-new-hs");
  const reachedDiff    = $("arc-reached-diff");
  const timeValueEl    = $("arc-time-value");
  const timeScoreHint  = $("arc-time-hint");
  const btnStart       = $("arc-btn-start");
  const btnRestart     = $("arc-btn-restart");
  const btnBack        = $("arc-btn-back");
  const btnBack2       = $("arc-btn-back2");
  const btnTimeDown    = $("arc-time-down");
  const btnTimeUp      = $("arc-time-up");
  const screenStart    = $("arc-screen-start");
  const screenGame     = $("arc-screen-game");
  const screenGameover = $("arc-screen-gameover");

  // ── State ──
  let score = 0, lives = MAX_LIVES, streak = 0;
  let difficultyIdx = 0, correctInRow = 0, missInRow = 0;
  let currentChord = null, chordShownAt = null, waitingForChord = false;
  let timerRafId = null, customTimeSec = DEFAULT_TIME;

  // ── Helpers ──
  function showSub(name) {
    screenStart.hidden    = name !== "start";
    screenGame.hidden     = name !== "game";
    screenGameover.hidden = name !== "gameover";
  }

  function getBest() { return parseInt(localStorage.getItem("guitar_arcade_best") ?? "0", 10); }
  function saveBest(s) { localStorage.setItem("guitar_arcade_best", String(s)); }

  function activeTimeMs()   { return customTimeSec * 1000; }
  function timeMult()       { return Math.max(0.5, Math.round((DEFAULT_TIME / customTimeSec) * 10) / 10); }
  function streakMult(s)    { return s >= 8 ? 4 : s >= 5 ? 3 : s >= 3 ? 2 : 1; }

  function updateTimeUI() {
    timeValueEl.textContent = `${customTimeSec}s`;
    timeScoreHint.textContent = `score multiplier: x${timeMult().toFixed(1)}`;
  }

  function updateHUD() {
    const diff = DIFFICULTIES[DIFFICULTY_ORDER[difficultyIdx]];
    scoreDisplay.textContent = score;
    livesDisplay.textContent = "♥".repeat(lives) + "♡".repeat(MAX_LIVES - lives);
    diffBadge.textContent    = diff.label;
    diffBadge.style.color    = diff.color;
    diffBadge.style.background    = diff.color + "22";
    diffBadge.style.borderColor   = diff.color + "44";
    if (streak >= 3) {
      streakDisplay.textContent = `${streak} STREAK`;
      multiplierEl.textContent  = `x${streakMult(streak)} MULTIPLIER`;
      multiplierEl.className    = "arc-mult-active";
    } else {
      streakDisplay.textContent = streak > 0 ? `${streak} streak` : "";
      multiplierEl.textContent  = "";
      multiplierEl.className    = "";
    }
  }

  // ── Game lifecycle ──
  function startGame() {
    score = 0; lives = MAX_LIVES; streak = 0;
    difficultyIdx = 0; correctInRow = 0; missInRow = 0;
    $("arc-best-start").textContent = getBest();
    showSub("game");
    updateHUD();
    nextChord();
  }

  function endGame() {
    stopTimer();
    waitingForChord = false;
    const best  = getBest();
    const isNew = score > best;
    if (isNew) saveBest(score);
    finalScore.textContent  = score;
    newHighScore.hidden     = !isNew;
    reachedDiff.textContent = `Reached: ${DIFFICULTIES[DIFFICULTY_ORDER[difficultyIdx]].label}`;
    $("arc-best-start").textContent = getBest();
    showSub("gameover");
  }

  function nextChord() {
    stopTimer();
    currentChord    = randomChord(DIFFICULTY_ORDER[difficultyIdx]);
    chordShownAt    = performance.now();
    waitingForChord = true;

    chordDisplay.textContent = currentChord;
    diagramWrap.innerHTML    = chordDiagramSVG(currentChord);
    feedbackEl.textContent   = "Strum it!";
    feedbackEl.className     = "";
    startTimer(activeTimeMs());
  }

  function onCorrect(detectedChord) {
    if (!waitingForChord) return;
    waitingForChord = false;
    stopTimer();

    const elapsed    = performance.now() - chordShownAt;
    const sm         = streakMult(++streak);
    correctInRow++;
    missInRow = 0;
    const speedBonus = elapsed < activeTimeMs() * 0.4 ? 50 : 0;
    const points     = Math.round(100 * sm * timeMult()) + speedBonus;
    score += points;

    feedbackEl.textContent = speedBonus
      ? `✓ ${detectedChord}  +${points} (fast!)`
      : `✓ ${detectedChord}  +${points}`;
    feedbackEl.className = "arc-correct";

    if (correctInRow >= CORRECT_TO_LEVEL_UP && difficultyIdx < DIFFICULTY_ORDER.length - 1) {
      difficultyIdx++;
      correctInRow = 0;
      feedbackEl.textContent += "  ↑ LEVEL UP";
    }
    updateHUD();
    setTimeout(nextChord, 1000);
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
    feedbackEl.textContent = reason === "timeout" ? "✗ Too slow!" : "✗ Wrong chord";
    feedbackEl.className   = reason === "timeout" ? "arc-timeout" : "arc-wrong";
    updateHUD();
    if (lives <= 0) setTimeout(endGame, 1000);
    else            setTimeout(nextChord, 1000);
  }

  // ── Timer ──
  function startTimer(ms) {
    const start = performance.now();
    function tick() {
      const rem = Math.max(0, 1 - (performance.now() - start) / ms);
      timerBar.style.width      = `${rem * 100}%`;
      timerBar.style.background = rem > 0.5 ? "#1db954" : rem > 0.25 ? "#f0a500" : "#e04040";
      if (rem <= 0) { if (waitingForChord) onMiss("timeout"); return; }
      timerRafId = requestAnimationFrame(tick);
    }
    timerRafId = requestAnimationFrame(tick);
  }

  function stopTimer() {
    if (timerRafId) { cancelAnimationFrame(timerRafId); timerRafId = null; }
    timerBar.style.width      = "100%";
    timerBar.style.background = "#1db954";
  }

  // ── Chord detection ──
  function handleChord({ chord, noteNames }) {
    if (!waitingForChord || !currentChord) return;
    if (chord && chordMatches(noteNames, currentChord)) {
      onCorrect(chord);
    } else if (chord && chord !== currentChord) {
      feedbackEl.textContent = `Hearing: ${chord} — need ${currentChord}`;
      feedbackEl.className   = "arc-wrong";
    }
  }

  // Wire up audio
  const { detector } = getAudio();
  detector.onChord = handleChord;

  // ── Events ──
  btnStart.addEventListener("click", startGame);
  btnRestart.addEventListener("click", () => { showSub("start"); startGame(); });
  btnBack.addEventListener("click",  () => { stopTimer(); waitingForChord = false; detector.onChord = null; onBack(); });
  btnBack2.addEventListener("click", () => { detector.onChord = null; onBack(); });
  btnTimeDown.addEventListener("click", () => { if (customTimeSec > MIN_TIME) { customTimeSec--; updateTimeUI(); } });
  btnTimeUp.addEventListener("click",   () => { if (customTimeSec < MAX_TIME) { customTimeSec++; updateTimeUI(); } });

  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && !$("screen-arcade").hidden && !screenGame.hidden) {
      stopTimer(); waitingForChord = false; detector.onChord = null; onBack();
    }
  });

  // Init
  $("arc-best-start").textContent = getBest();
  updateTimeUI();
  showSub("start");
}
