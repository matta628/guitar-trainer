import type { FretPosition } from "../../types";
import {
  STRING_NAMES, STRING_NUMS, MARKER_FRETS, DOUBLE_MARKERS,
  svgWidth, svgHeight, fretX, stringY, getScaleDegree,
  PAD_L, PAD_R, PAD_T, FRET_W, STRING_H, DOT_R, NOTE_NAMES,
} from "../../utils/fretboard";

type DisplayMode = "notes" | "degrees";

interface Props {
  positions: FretPosition[];
  target: FretPosition | null;
  startFret: number;
  endFret: number;
  rootKey: string;
  displayMode?: DisplayMode;
}

export default function Fretboard({ positions, target, startFret, endFret, rootKey, displayMode = "notes" }: Props) {
  const W = svgWidth(startFret, endFret);
  const H = svgHeight();
  const rootPc = NOTE_NAMES.indexOf(rootKey);
  const showOpen = startFret === 0;
  // Leftmost fretboard x (start of first drawn fret cell)
  const fbX = showOpen ? PAD_L + 52 /* OPEN_W */ : PAD_L;
  const nFrets = showOpen ? endFret : (endFret - startFret + 1);

  const lines: string[] = [];

  // Background panels
  lines.push(`<rect width="${W}" height="${H}" fill="#1a0e06" rx="6"/>`);
  if (showOpen) {
    lines.push(`<rect x="${PAD_L}" y="${PAD_T-8}" width="52" height="${5*STRING_H+16}" fill="#110900" rx="2"/>`);
  }
  lines.push(`<rect x="${fbX}" y="${PAD_T-8}" width="${nFrets*FRET_W}" height="${5*STRING_H+16}" fill="#2d1408" rx="2"/>`);

  // Inlay markers — only draw for frets that are within the visible range
  const markerY = PAD_T + 2 * STRING_H + STRING_H / 2;
  const firstFret = showOpen ? 1 : startFret;
  for (let f = firstFret; f <= endFret; f++) {
    if (!MARKER_FRETS.includes(f)) continue;
    const mx = fretX(f, startFret);
    if (DOUBLE_MARKERS.includes(f)) {
      lines.push(`<circle cx="${mx}" cy="${markerY-10}" r="5" fill="#3d2010"/>`);
      lines.push(`<circle cx="${mx}" cy="${markerY+10}" r="5" fill="#3d2010"/>`);
    } else {
      lines.push(`<circle cx="${mx}" cy="${markerY}" r="5" fill="#3d2010"/>`);
    }
  }

  // Nut (only when showing from fret 0)
  if (showOpen) {
    lines.push(`<rect x="${fbX-4}" y="${PAD_T-8}" width="6" height="${5*STRING_H+16}" fill="#c8a87a" rx="1"/>`);
  }

  // Fret lines
  for (let i = 0; i <= nFrets; i++) {
    const x = fbX + i * FRET_W;
    lines.push(`<line x1="${x}" y1="${PAD_T-4}" x2="${x}" y2="${PAD_T+5*STRING_H+4}" stroke="#6b4423" stroke-width="1.5"/>`);
  }

  // Strings (0 = high E at top)
  const strWidths = [0.9, 1.1, 1.4, 1.7, 2.0, 2.4];
  const strColors = ["#d8d8d8","#d8d8d8","#d8d8d8","#c8a050","#c8a050","#c8a050"];
  for (let s = 0; s < 6; s++) {
    const y = stringY(s);
    lines.push(`<line x1="${PAD_L+4}" y1="${y}" x2="${W-PAD_R}" y2="${y}" stroke="${strColors[s]}" stroke-width="${strWidths[s]}" stroke-linecap="round"/>`);
  }

  // Fret numbers
  for (let f = firstFret; f <= endFret; f++) {
    const x = fretX(f, startFret);
    lines.push(`<text x="${x}" y="${PAD_T-16}" text-anchor="middle" font-family="monospace" font-size="11" fill="#3d2a1a">${f}</text>`);
  }
  if (showOpen) {
    lines.push(`<text x="${PAD_L+26}" y="${PAD_T-16}" text-anchor="middle" font-family="monospace" font-size="11" fill="#3d2a1a">0</text>`);
  }

  // String labels
  for (let s = 0; s < 6; s++) {
    const y = stringY(s);
    lines.push(`<text x="${PAD_L-10}" y="${y+4}" text-anchor="end" font-family="monospace" font-size="12" fill="#4a3020">${STRING_NAMES[s]}${STRING_NUMS[s]}</text>`);
  }

  // Scale dots
  for (const pos of positions) {
    const x = fretX(pos.fret, startFret);
    const y = stringY(pos.stringIdx);
    const isTarget = target && pos.stringIdx === target.stringIdx && pos.fret === target.fret;
    const fill   = isTarget ? "#4af8dc" : pos.isRoot ? "#f0a500" : "#1db954";
    const stroke = isTarget ? "#fff"    : pos.isRoot ? "#fff8e0" : "#0d8040";
    const textColor = isTarget ? "#003" : pos.isRoot ? "#3d1a00" : "#002810";
    const notePc = NOTE_NAMES.indexOf(pos.note);
    const degree = getScaleDegree(notePc, rootPc);
    const label = displayMode === "degrees" ? (degree != null ? String(degree) : pos.note) : pos.note;
    lines.push(`<circle cx="${x}" cy="${y}" r="${DOT_R}" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>`);
    lines.push(`<text x="${x}" y="${y+4}" text-anchor="middle" font-family="monospace" font-size="${displayMode==="degrees"?12:9}" font-weight="bold" fill="${textColor}" pointer-events="none">${label}</text>`);
  }

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={{ width: "100%", height: "auto", display: "block" }}
      dangerouslySetInnerHTML={{ __html: lines.join("") }}
    />
  );
}
