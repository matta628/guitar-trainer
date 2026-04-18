import {
  getPentatonicPositions, NOTE_NAMES, STRING_NAMES, STRING_NUMS,
  MARKER_FRETS, DOUBLE_MARKERS,
  svgWidth, svgHeight, fretX, stringY,
  PAD_L, PAD_R, PAD_T, PAD_B, OPEN_W, FRET_W, STRING_H, DOT_R,
} from "../utils/fretboard.js";

const $ = id => document.getElementById(id);

export function initScale({ getAudio, onBack }) {
  const keySelect    = $("sc-key");
  const btnFretDown  = $("sc-fret-down");
  const btnFretUp    = $("sc-fret-up");
  const fretValueEl  = $("sc-fret-value");
  const svgEl        = $("sc-fretboard");
  const targetNoteEl = $("sc-target-note");
  const targetHintEl = $("sc-target-hint");
  const feedbackEl   = $("sc-feedback");
  const statCorrect  = $("sc-stat-correct");
  const statStreak   = $("sc-stat-streak");
  const statBest     = $("sc-stat-best");
  const btnBack      = $("sc-btn-back");

  // ── State ──
  let key       = keySelect.value;
  let maxFret   = 5;
  let positions = [];
  let target    = null, lastTarget = null;

  let correct    = 0, streak = 0, bestStreak = 0;

  let stableNote = null, stableCount = 0;
  const STABLE_THRESHOLD = 3;

  const MIN_FRET = 3, MAX_FRET = 13;

  // ── Fret control ──
  function updateFretUI() {
    fretValueEl.textContent = `${maxFret} frets`;
  }

  btnFretDown.addEventListener("click", () => { if (maxFret > MIN_FRET) { maxFret--; refresh(); } });
  btnFretUp.addEventListener("click",   () => { if (maxFret < MAX_FRET) { maxFret++; refresh(); } });
  keySelect.addEventListener("change",  () => { key = keySelect.value; refresh(); });
  btnBack.addEventListener("click",     () => { const { detector } = getAudio(); detector.onNote = null; onBack(); });

  // ── Audio ──
  function handleNote(note) {
    if (!target) return;
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
      feedbackEl.className   = "sc-wrong";
    }
  }

  const { detector } = getAudio();
  detector.onNote = handleNote;

  // ── Game ──
  function refresh() {
    updateFretUI();
    positions = getPentatonicPositions(key, maxFret);
    renderFretboard();
    if (positions.length > 0) pickTarget();
  }

  function pickTarget() {
    if (positions.length === 0) return;
    let next;
    do { next = positions[Math.floor(Math.random() * positions.length)]; }
    while (positions.length > 1 && next === lastTarget);
    lastTarget    = target;
    target        = next;
    stableNote    = null;
    stableCount   = 0;

    targetNoteEl.textContent = target.note;
    const stringNum = STRING_NUMS[target.stringIdx];
    targetHintEl.textContent = `String ${stringNum}  ·  Fret ${target.fret === 0 ? "open" : target.fret}`;
    feedbackEl.textContent   = "";
    feedbackEl.className     = "";
    renderFretboard();
  }

  function onCorrect() {
    correct++;
    streak++;
    if (streak > bestStreak) bestStreak = streak;
    statCorrect.textContent = correct;
    statStreak.textContent  = streak;
    statBest.textContent    = bestStreak;
    feedbackEl.textContent  = `✓ ${target.note}!`;
    feedbackEl.className    = "sc-correct";

    // Flash dot
    const dot = svgEl.querySelector(`[data-pos="${target.stringIdx}-${target.fret}"]`);
    if (dot) { dot.classList.remove("sc-note-target"); dot.classList.add("sc-note-flash"); }

    stableNote = null; stableCount = 0;
    setTimeout(pickTarget, 600);
  }

  // ── SVG Renderer ──
  function renderFretboard() {
    const W = svgWidth(maxFret);
    const H = svgHeight();
    svgEl.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svgEl.setAttribute("width", W);
    svgEl.setAttribute("height", H);

    const els = [];

    // Background
    els.push(`<rect width="${W}" height="${H}" fill="#1a0e06" rx="6"/>`);

    // Open string area
    const fbX = PAD_L + OPEN_W;
    els.push(`<rect x="${PAD_L}" y="${PAD_T-8}" width="${OPEN_W}" height="${5*STRING_H+16}" fill="#110900" rx="2"/>`);
    els.push(`<rect x="${fbX}" y="${PAD_T-8}" width="${maxFret*FRET_W}" height="${5*STRING_H+16}" fill="#2d1408" rx="2"/>`);

    // Fret position markers (between strings 2 and 3 from top = stringIdx 2 and 3)
    const markerY = PAD_T + 2 * STRING_H + STRING_H / 2;
    for (let f = 1; f <= maxFret; f++) {
      if (!MARKER_FRETS.includes(f)) continue;
      const mx = fbX + (f-1)*FRET_W + FRET_W/2;
      if (DOUBLE_MARKERS.includes(f)) {
        els.push(`<circle cx="${mx}" cy="${markerY-10}" r="5" fill="#3d2010"/>`);
        els.push(`<circle cx="${mx}" cy="${markerY+10}" r="5" fill="#3d2010"/>`);
      } else {
        els.push(`<circle cx="${mx}" cy="${markerY}" r="5" fill="#3d2010"/>`);
      }
    }

    // Nut
    els.push(`<rect x="${fbX-4}" y="${PAD_T-8}" width="6" height="${5*STRING_H+16}" fill="#c8a87a" rx="1"/>`);

    // Fret lines
    for (let f = 0; f <= maxFret; f++) {
      const x = fbX + f*FRET_W;
      els.push(`<line x1="${x}" y1="${PAD_T-4}" x2="${x}" y2="${PAD_T+5*STRING_H+4}" stroke="#6b4423" stroke-width="1.5"/>`);
    }

    // Strings (index 0=high E at top, 5=low E at bottom)
    const strWidths = [0.9, 1.1, 1.4, 1.7, 2.0, 2.4];
    const strColors = ["#d8d8d8","#d8d8d8","#d8d8d8","#c8a050","#c8a050","#c8a050"];
    for (let s = 0; s < 6; s++) {
      const y = stringY(s);
      els.push(`<line x1="${PAD_L+4}" y1="${y}" x2="${W-PAD_R}" y2="${y}" stroke="${strColors[s]}" stroke-width="${strWidths[s]}" stroke-linecap="round"/>`);
    }

    // Fret numbers
    for (let f = 1; f <= maxFret; f++) {
      const x = fbX + (f-1)*FRET_W + FRET_W/2;
      els.push(`<text x="${x}" y="${PAD_T-16}" text-anchor="middle" font-family="monospace" font-size="11" fill="#3d2a1a">${f}</text>`);
    }
    els.push(`<text x="${PAD_L+OPEN_W/2}" y="${PAD_T-16}" text-anchor="middle" font-family="monospace" font-size="11" fill="#3d2a1a">0</text>`);

    // String labels (E1=high E at top, E6=low E at bottom)
    for (let s = 0; s < 6; s++) {
      const y = stringY(s);
      els.push(`<text x="${PAD_L-10}" y="${y+4}" text-anchor="end" font-family="monospace" font-size="12" fill="#4a3020">${STRING_NAMES[s]}${STRING_NUMS[s]}</text>`);
    }

    // Scale note dots
    for (const pos of positions) {
      const x = fretX(pos.fret);
      const y = stringY(pos.stringIdx);
      const isTarget = target && pos.stringIdx === target.stringIdx && pos.fret === target.fret;
      const fill   = isTarget ? "#4af8dc" : pos.isRoot ? "#f0a500" : "#1db954";
      const stroke = isTarget ? "#fff"    : pos.isRoot ? "#fff8e0" : "#0d8040";
      const cls    = isTarget ? "sc-note-target" : "";
      els.push(`<circle cx="${x}" cy="${y}" r="${DOT_R}" fill="${fill}" stroke="${stroke}" stroke-width="1.5" class="${cls}" data-pos="${pos.stringIdx}-${pos.fret}"/>`);
      els.push(`<text x="${x}" y="${y+4}" text-anchor="middle" font-family="monospace" font-size="9" font-weight="bold" fill="${isTarget?"#003":pos.isRoot?"#3d1a00":"#002810"}" pointer-events="none">${pos.note}</text>`);
    }

    svgEl.innerHTML = els.join("\n");
  }

  // Init
  refresh();
}
