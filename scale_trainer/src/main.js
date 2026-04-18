import { AudioEngine }  from "./audio/AudioEngine.js";
import { ChordDetector } from "./audio/ChordDetector.js";
import {
  getPentatonicPositions,
  NOTE_NAMES, STRING_NAMES,
  MARKER_FRETS, DOUBLE_MARKERS,
  svgWidth, svgHeight,
  fretX, stringY,
  PAD_L, PAD_R, PAD_T, PAD_B,
  OPEN_W, FRET_W, STRING_H, DOT_R,
} from "./utils/fretboard.js";

// ── DOM ───────────────────────────────────────────────────────────────────────
const keySelect    = document.getElementById("key-select");
const btnFretDown  = document.getElementById("btn-fret-down");
const btnFretUp    = document.getElementById("btn-fret-up");
const fretValueEl  = document.getElementById("fret-value");
const btnConnect   = document.getElementById("btn-connect");
const svg          = document.getElementById("fretboard-svg");
const targetNoteEl = document.getElementById("target-note");
const targetHintEl = document.getElementById("target-hint");
const feedbackEl   = document.getElementById("feedback");
const statCorrect  = document.getElementById("stat-correct");
const statStreak   = document.getElementById("stat-streak");
const statBest     = document.getElementById("stat-best");

// ── State ─────────────────────────────────────────────────────────────────────
let key        = keySelect.value;
let maxFret    = 5;
let positions  = [];   // all pentatonic positions for current key+fret
let target     = null; // current target position
let lastTarget = null;

let engine   = null;
let detector = null;
let started  = false;

let correct    = 0;
let streak     = 0;
let bestStreak = 0;

// Monophonic stability filter
let stableNote  = null;
let stableCount = 0;
const STABLE_THRESHOLD = 3;

// ── Fret control ──────────────────────────────────────────────────────────────
const DIFFICULTY_FRETS = [3, 5, 9, 13];
const MIN_FRET = 3, MAX_FRET = 13;

function updateFretUI() {
  fretValueEl.textContent = `${maxFret} frets`;
  const label = maxFret <= 3 ? "EASY" : maxFret <= 5 ? "MEDIUM" : maxFret <= 9 ? "HARD" : "EXPERT";
  fretValueEl.title = label;
}

btnFretDown.addEventListener("click", () => {
  if (maxFret > MIN_FRET) { maxFret--; refresh(); }
});
btnFretUp.addEventListener("click", () => {
  if (maxFret < MAX_FRET) { maxFret++; refresh(); }
});
keySelect.addEventListener("change", () => { key = keySelect.value; refresh(); });

// ── Audio ─────────────────────────────────────────────────────────────────────
async function connect() {
  btnConnect.disabled    = true;
  btnConnect.textContent = "Connecting...";

  try {
    detector = new ChordDetector({
      onNote: handleNote,
    });
    engine = new AudioEngine({
      fftSize: 4096,
      onFrame: (d, m) => detector.process(d, m),
    });
    await engine.start();
    btnConnect.textContent = "Connected ✓";
    started = true;
    pickTarget();
  } catch {
    btnConnect.disabled    = false;
    btnConnect.textContent = "Connect mic";
    targetHintEl.textContent = "⚠ Mic access denied.";
  }
}

btnConnect.addEventListener("click", connect);

// ── Game loop ─────────────────────────────────────────────────────────────────
function refresh() {
  updateFretUI();
  positions = getPentatonicPositions(key, maxFret);
  renderFretboard();
  if (started) pickTarget();
}

function pickTarget() {
  if (positions.length === 0) return;
  let next;
  do {
    next = positions[Math.floor(Math.random() * positions.length)];
  } while (positions.length > 1 && next === lastTarget);
  lastTarget = target;
  target = next;

  targetNoteEl.textContent = target.note;
  targetHintEl.textContent =
    `String ${6 - target.stringIdx}  ·  Fret ${target.fret === 0 ? "open" : target.fret}`;
  feedbackEl.textContent  = "";
  feedbackEl.className    = "";

  renderFretboard(); // re-render to highlight new target
}

function handleNote(note) {
  if (!started || !target) return;

  // Stability filter
  if (note.name === stableNote) {
    stableCount++;
  } else {
    stableNote  = note.name;
    stableCount = 1;
  }
  if (stableCount !== STABLE_THRESHOLD) return;

  if (note.name === target.note) {
    onCorrect();
  } else {
    feedbackEl.textContent = `Hearing: ${note.name}`;
    feedbackEl.className   = "wrong";
  }
}

function onCorrect() {
  correct++;
  streak++;
  if (streak > bestStreak) bestStreak = streak;

  statCorrect.textContent = correct;
  statStreak.textContent  = streak;
  statBest.textContent    = bestStreak;

  feedbackEl.textContent = `✓ ${target.note}!`;
  feedbackEl.className   = "correct";

  // Flash the dot
  const dot = svg.querySelector(`[data-key="${dotKey(target)}"]`);
  if (dot) {
    dot.classList.remove("note-target");
    dot.classList.add("note-flash");
  }

  stableNote  = null;
  stableCount = 0;

  setTimeout(() => {
    pickTarget();
  }, 600);
}

function dotKey(pos) {
  return `${pos.stringIdx}-${pos.fret}`;
}

// ── SVG Renderer ──────────────────────────────────────────────────────────────
function renderFretboard() {
  const W = svgWidth(maxFret);
  const H = svgHeight();

  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute("width", W);
  svg.setAttribute("height", H);

  const els = [];

  // ── Wood background ──
  els.push(`<rect x="0" y="0" width="${W}" height="${H}" fill="#1a0e06" rx="6"/>`);

  // ── Open-string area background ──
  els.push(`<rect x="${PAD_L}" y="${PAD_T - 8}" width="${OPEN_W}" height="${5 * STRING_H + 16}" fill="#110900" rx="2"/>`);

  // ── Fretboard body ──
  const fbX = PAD_L + OPEN_W;
  const fbY = PAD_T - 8;
  const fbW = maxFret * FRET_W;
  const fbH = 5 * STRING_H + 16;
  els.push(`<rect x="${fbX}" y="${fbY}" width="${fbW}" height="${fbH}" fill="#2d1408" rx="2"/>`);

  // ── Fret position markers (dots between strings 3 & 4) ──
  const markerY = PAD_T + 2 * STRING_H + STRING_H / 2;
  for (let f = 1; f <= maxFret; f++) {
    if (MARKER_FRETS.includes(f)) {
      const mx = PAD_L + OPEN_W + (f - 1) * FRET_W + FRET_W / 2;
      if (DOUBLE_MARKERS.includes(f)) {
        els.push(`<circle cx="${mx}" cy="${markerY - 10}" r="5" fill="#3d2010"/>`);
        els.push(`<circle cx="${mx}" cy="${markerY + 10}" r="5" fill="#3d2010"/>`);
      } else {
        els.push(`<circle cx="${mx}" cy="${markerY}" r="5" fill="#3d2010"/>`);
      }
    }
  }

  // ── Nut ──
  els.push(`<rect x="${PAD_L + OPEN_W - 4}" y="${PAD_T - 8}" width="6" height="${5 * STRING_H + 16}" fill="#c8a87a" rx="1"/>`);

  // ── Fret lines ──
  for (let f = 0; f <= maxFret; f++) {
    const x = PAD_L + OPEN_W + f * FRET_W;
    els.push(`<line x1="${x}" y1="${PAD_T - 4}" x2="${x}" y2="${PAD_T + 5 * STRING_H + 4}" stroke="#6b4423" stroke-width="${f === 0 ? 0 : 1.5}"/>`);
  }

  // ── Strings ──
  const stringWidths = [2.4, 2.0, 1.7, 1.4, 1.1, 0.9]; // low E → high E
  const stringColors = ["#c8a050","#c8a050","#c8a050","#d8d8d8","#d8d8d8","#d8d8d8"];
  for (let s = 0; s < 6; s++) {
    const y = stringY(s);
    els.push(`<line x1="${PAD_L + 4}" y1="${y}" x2="${W - PAD_R}" y2="${y}" stroke="${stringColors[s]}" stroke-width="${stringWidths[s]}" stroke-linecap="round"/>`);
  }

  // ── Fret numbers ──
  for (let f = 1; f <= maxFret; f++) {
    const x = PAD_L + OPEN_W + (f - 1) * FRET_W + FRET_W / 2;
    els.push(`<text x="${x}" y="${PAD_T - 16}" text-anchor="middle" font-family="monospace" font-size="11" fill="#3d2a1a">${f}</text>`);
  }
  els.push(`<text x="${PAD_L + OPEN_W / 2}" y="${PAD_T - 16}" text-anchor="middle" font-family="monospace" font-size="11" fill="#3d2a1a">0</text>`);

  // ── String labels (left side) ──
  for (let s = 0; s < 6; s++) {
    const y = stringY(s);
    const label = STRING_NAMES[s];
    const num = 6 - s; // string number: 6=low E, 1=high E
    els.push(`<text x="${PAD_L - 10}" y="${y + 4}" text-anchor="end" font-family="monospace" font-size="12" fill="#4a3020">${label}${num}</text>`);
  }

  // ── Scale note dots ──
  for (const pos of positions) {
    const x = fretX(pos.fret);
    const y = stringY(pos.stringIdx);
    const isTarget = target && pos.stringIdx === target.stringIdx && pos.fret === target.fret;

    const fill   = isTarget ? "#4af8dc" : pos.isRoot ? "#f0a500" : "#1db954";
    const stroke = isTarget ? "#ffffff" : pos.isRoot ? "#fff8e0" : "#0d8040";
    const cls    = isTarget ? "note-target" : "";

    els.push(
      `<circle cx="${x}" cy="${y}" r="${DOT_R}" fill="${fill}" stroke="${stroke}" stroke-width="1.5" class="${cls}" data-key="${dotKey(pos)}"/>`
    );

    // Note name inside dot
    const textFill = isTarget ? "#003" : pos.isRoot ? "#3d1a00" : "#002810";
    els.push(
      `<text x="${x}" y="${y + 4}" text-anchor="middle" font-family="monospace" font-size="9" font-weight="bold" fill="${textFill}" pointer-events="none">${pos.note}</text>`
    );
  }

  svg.innerHTML = els.join("\n");
}

// ── Init ──────────────────────────────────────────────────────────────────────
refresh();
