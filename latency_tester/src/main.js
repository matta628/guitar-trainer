/**
 * main.js
 * Wires together AudioEngine + ChordDetector and drives the latency tester UI.
 *
 * Game loop:
 *   1. Show a target chord
 *   2. Record timestamp (T_shown)
 *   3. Poll ChordDetector until target chord is detected
 *   4. Record timestamp (T_detected)
 *   5. Latency = T_detected - T_shown
 *   6. Show result, update stats
 */

import { AudioEngine } from "./audio/AudioEngine.js";
import { ChordDetector } from "./audio/ChordDetector.js";
import { randomChord, chordMatches } from "./utils/chordUtils.js";

// ── DOM refs ────────────────────────────────────────────────────────────────
const startBtn      = document.getElementById("start-btn");
const nextBtn       = document.getElementById("next-btn");
const freqDisplay   = document.getElementById("freq-display");
const notesDisplay  = document.getElementById("notes-display");
const chordDisplay  = document.getElementById("chord-display");
const targetChord   = document.getElementById("target-chord");
const resultBanner  = document.getElementById("result-banner");
const latencyDisplay = document.getElementById("latency-display");
const statAttempts  = document.getElementById("stat-attempts");
const statCorrect   = document.getElementById("stat-correct");
const statLatency   = document.getElementById("stat-latency");
const statMin       = document.getElementById("stat-min");

// ── State ───────────────────────────────────────────────────────────────────
let engine = null;
let detector = null;
let currentTarget = null;
let shownAt = null;
let waitingForChord = false;

const stats = {
  attempts: 0,
  correct: 0,
  latencies: [],
};

// ── Audio pipeline ───────────────────────────────────────────────────────────
async function startAudio() {
  startBtn.disabled = true;
  startBtn.textContent = "Connecting...";

  try {
    detector = new ChordDetector({
      onChord: handleChordDetected,
      onNote: (note) => {
        freqDisplay.textContent = `${note.freq} Hz  (${note.cents > 0 ? "+" : ""}${note.cents}¢)`;
      },
    });

    engine = new AudioEngine({
      fftSize: 4096,
      onFrame: (freqData, meta) => detector.process(freqData, meta),
    });

    await engine.start();

    startBtn.textContent = "Connected ✓";
    nextBtn.disabled = false;
    showNextChord();
  } catch (err) {
    startBtn.disabled = false;
    startBtn.textContent = "Connect Microphone";
    console.error("Mic access failed:", err);
    resultBanner.textContent = "⚠ Mic access denied or unavailable.";
    resultBanner.className = "result-fail";
  }
}

// ── Game loop ────────────────────────────────────────────────────────────────
function showNextChord() {
  currentTarget = randomChord();
  shownAt = performance.now();
  waitingForChord = true;

  targetChord.textContent = currentTarget;
  resultBanner.textContent = "—";
  resultBanner.className = "";
  latencyDisplay.textContent = "Waiting for strum...";
  nextBtn.disabled = true;
}

function handleChordDetected({ chord, noteNames, dominantFreq }) {
  // Always update the raw detection display
  notesDisplay.textContent = noteNames.join("  ");
  chordDisplay.textContent = chord ?? "—";

  if (!waitingForChord || !currentTarget) return;

  const detectedAt = performance.now();
  const latencyMs = Math.round(detectedAt - shownAt);

  // Check if detected chord matches target
  const isCorrect = chord && chordMatches(noteNames, currentTarget);

  if (isCorrect) {
    waitingForChord = false;
    stats.attempts++;
    stats.correct++;
    stats.latencies.push(latencyMs);
    updateStats();

    resultBanner.textContent = `✓ Correct! (${chord})`;
    resultBanner.className = "result-pass";
    latencyDisplay.textContent = `Detected in ${latencyMs}ms`;
    nextBtn.disabled = false;
  } else if (chord && chord !== currentTarget) {
    // Wrong chord — still show feedback but don't advance
    resultBanner.textContent = `✗ That's ${chord ?? "unknown"}`;
    resultBanner.className = "result-fail";
    latencyDisplay.textContent = `Try again — target: ${currentTarget}`;
  }
}

function updateStats() {
  statAttempts.textContent = stats.attempts;
  statCorrect.textContent = stats.correct;

  if (stats.latencies.length > 0) {
    const avg = Math.round(stats.latencies.reduce((a, b) => a + b, 0) / stats.latencies.length);
    const min = Math.min(...stats.latencies);

    const avgEl = statLatency;
    avgEl.textContent = `${avg}ms`;
    avgEl.className = latencyClass(avg);

    statMin.textContent = `${min}ms`;
  }
}

function latencyClass(ms) {
  if (ms < 200) return "value highlight";
  if (ms < 350) return "value warn";
  return "value bad";
}

// ── Event listeners ──────────────────────────────────────────────────────────
startBtn.addEventListener("click", startAudio);
nextBtn.addEventListener("click", showNextChord);
