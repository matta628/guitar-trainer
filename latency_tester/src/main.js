import { AudioEngine } from "./audio/AudioEngine.js";
import { ChordDetector } from "./audio/ChordDetector.js";
import { randomChord, chordMatches } from "./utils/chordUtils.js";
import { notesMatch } from "./utils/noteUtils.js";

// ── DOM refs ────────────────────────────────────────────────────────────────
const startBtn       = document.getElementById("start-btn");
const nextBtn        = document.getElementById("next-btn");
const freqDisplay    = document.getElementById("freq-display");
const notesDisplay   = document.getElementById("notes-display");
const chordDisplay   = document.getElementById("chord-display");
const targetChord    = document.getElementById("target-chord");
const resultBanner   = document.getElementById("result-banner");
const latencyDisplay = document.getElementById("latency-display");
const statAttempts   = document.getElementById("stat-attempts");
const statCorrect    = document.getElementById("stat-correct");
const statLatency    = document.getElementById("stat-latency");
const statMin        = document.getElementById("stat-min");
const noteInstruction = document.getElementById("note-instruction");
const noteTargetEl   = document.getElementById("note-target");
const noteResultEl   = document.getElementById("note-result");

// ── Note pool ────────────────────────────────────────────────────────────────
const NOTE_TARGETS = [
  { string: 6, fret: 1, note: "F"  },
  { string: 6, fret: 3, note: "G"  },
  { string: 5, fret: 2, note: "B"  },
  { string: 5, fret: 3, note: "C"  },
  { string: 4, fret: 1, note: "D#" },
  { string: 4, fret: 3, note: "F"  },
  { string: 3, fret: 2, note: "A"  },
  { string: 3, fret: 4, note: "B"  },
  { string: 2, fret: 1, note: "C"  },
  { string: 2, fret: 3, note: "D"  },
];

let lastNoteIndex = -1;
function randomNoteTarget() {
  let idx;
  do { idx = Math.floor(Math.random() * NOTE_TARGETS.length); } while (idx === lastNoteIndex);
  lastNoteIndex = idx;
  return NOTE_TARGETS[idx];
}

// ── State ────────────────────────────────────────────────────────────────────
let engine = null;
let detector = null;

// chord mode
let currentTarget = null;
let shownAt = null;
let waitingForChord = false;
const stats = { attempts: 0, correct: 0, latencies: [] };

// note mode
let currentNote = null;
let waitingForNote = false;

// ── Audio pipeline ────────────────────────────────────────────────────────────
async function startAudio() {
  startBtn.disabled = true;
  startBtn.textContent = "Connecting...";

  try {
    detector = new ChordDetector({
      onChord: handleChordDetected,
      onNote: (note) => {
        freqDisplay.textContent = `${note.freq} Hz  (${note.cents > 0 ? "+" : ""}${note.cents}¢)`;
        handleNoteDetected(note);
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
    showNextNote();
  } catch (err) {
    startBtn.disabled = false;
    startBtn.textContent = "Connect Microphone";
    console.error("Mic access failed:", err);
    resultBanner.textContent = "⚠ Mic access denied or unavailable.";
    resultBanner.className = "result-fail";
  }
}

// ── Chord game loop ───────────────────────────────────────────────────────────
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

function handleChordDetected({ chord, noteNames }) {
  notesDisplay.textContent = noteNames.join("  ");
  chordDisplay.textContent = chord ?? "—";

  if (!waitingForChord || !currentTarget) return;

  const latencyMs = Math.round(performance.now() - shownAt);
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
    setTimeout(showNextChord, 1000);
  } else if (chord && chord !== currentTarget) {
    resultBanner.textContent = `✗ That's ${chord ?? "unknown"}`;
    resultBanner.className = "result-fail";
    latencyDisplay.textContent = `Try again — target: ${currentTarget}`;
  }
}

// ── Note game loop ────────────────────────────────────────────────────────────
function showNextNote() {
  currentNote = randomNoteTarget();
  waitingForNote = true;

  noteInstruction.textContent = `String ${currentNote.string}, Fret ${currentNote.fret}`;
  noteTargetEl.textContent = currentNote.note;
  noteResultEl.textContent = "—";
  noteResultEl.style.color = "#666";
}

function handleNoteDetected(note) {
  if (!waitingForNote || !currentNote) return;

  if (notesMatch(note, currentNote.note)) {
    waitingForNote = false;
    noteResultEl.textContent = `✓ ${currentNote.note}!`;
    noteResultEl.style.color = "#1db954";
    setTimeout(showNextNote, 1000);
  } else {
    noteResultEl.textContent = `Hearing: ${note.name}`;
    noteResultEl.style.color = "#666";
  }
}

// ── Stats ─────────────────────────────────────────────────────────────────────
function updateStats() {
  statAttempts.textContent = stats.attempts;
  statCorrect.textContent = stats.correct;

  if (stats.latencies.length > 0) {
    const avg = Math.round(stats.latencies.reduce((a, b) => a + b, 0) / stats.latencies.length);
    const min = Math.min(...stats.latencies);
    statLatency.textContent = `${avg}ms`;
    statLatency.className = latencyClass(avg);
    statMin.textContent = `${min}ms`;
  }
}

function latencyClass(ms) {
  if (ms < 200) return "value highlight";
  if (ms < 350) return "value warn";
  return "value bad";
}

// ── Event listeners ───────────────────────────────────────────────────────────
startBtn.addEventListener("click", startAudio);
nextBtn.addEventListener("click", showNextChord);
