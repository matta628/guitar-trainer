import type { FretPosition } from "../../types";
import {
  STRING_NAMES, STRING_NUMS, MARKER_FRETS, DOUBLE_MARKERS,
  svgWidth, svgHeight, fretX, stringY,
  PAD_L, PAD_R, PAD_T, OPEN_W, FRET_W, STRING_H, DOT_R,
} from "../../utils/fretboard";

interface Props {
  positions: FretPosition[];
  target: FretPosition | null;
  maxFret: number;
  detectedNote?: string | null;
}

export default function Fretboard({ positions, target, maxFret, detectedNote }: Props) {
  const W = svgWidth(maxFret);
  const H = svgHeight();
  const fbX = PAD_L + OPEN_W;

  const lines: string[] = [];

  // Background panels
  lines.push(`<rect width="${W}" height="${H}" fill="#1a0e06" rx="6"/>`);
  lines.push(`<rect x="${PAD_L}" y="${PAD_T-8}" width="${OPEN_W}" height="${5*STRING_H+16}" fill="#110900" rx="2"/>`);
  lines.push(`<rect x="${fbX}" y="${PAD_T-8}" width="${maxFret*FRET_W}" height="${5*STRING_H+16}" fill="#2d1408" rx="2"/>`);

  // Fret position markers
  const markerY = PAD_T + 2 * STRING_H + STRING_H / 2;
  for (let f = 1; f <= maxFret; f++) {
    if (!MARKER_FRETS.includes(f)) continue;
    const mx = fbX + (f - 1) * FRET_W + FRET_W / 2;
    if (DOUBLE_MARKERS.includes(f)) {
      lines.push(`<circle cx="${mx}" cy="${markerY-10}" r="5" fill="#3d2010"/>`);
      lines.push(`<circle cx="${mx}" cy="${markerY+10}" r="5" fill="#3d2010"/>`);
    } else {
      lines.push(`<circle cx="${mx}" cy="${markerY}" r="5" fill="#3d2010"/>`);
    }
  }

  // Nut
  lines.push(`<rect x="${fbX-4}" y="${PAD_T-8}" width="6" height="${5*STRING_H+16}" fill="#c8a87a" rx="1"/>`);

  // Fret lines
  for (let f = 0; f <= maxFret; f++) {
    const x = fbX + f * FRET_W;
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
  for (let f = 1; f <= maxFret; f++) {
    const x = fbX + (f - 1) * FRET_W + FRET_W / 2;
    lines.push(`<text x="${x}" y="${PAD_T-16}" text-anchor="middle" font-family="monospace" font-size="11" fill="#3d2a1a">${f}</text>`);
  }
  lines.push(`<text x="${PAD_L+OPEN_W/2}" y="${PAD_T-16}" text-anchor="middle" font-family="monospace" font-size="11" fill="#3d2a1a">0</text>`);

  // String labels
  for (let s = 0; s < 6; s++) {
    const y = stringY(s);
    lines.push(`<text x="${PAD_L-10}" y="${y+4}" text-anchor="end" font-family="monospace" font-size="12" fill="#4a3020">${STRING_NAMES[s]}${STRING_NUMS[s]}</text>`);
  }

  // Scale dots
  for (const pos of positions) {
    const x = fretX(pos.fret);
    const y = stringY(pos.stringIdx);
    const isTarget = target && pos.stringIdx === target.stringIdx && pos.fret === target.fret;
    const isDetected = detectedNote && pos.note === detectedNote;
    const fill   = isTarget ? "#4af8dc" : isDetected ? "#a78bfa" : pos.isRoot ? "#f0a500" : "#1db954";
    const stroke = isTarget ? "#fff"    : isDetected ? "#ddd"    : pos.isRoot ? "#fff8e0" : "#0d8040";
    lines.push(`<circle cx="${x}" cy="${y}" r="${DOT_R}" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>`);
    lines.push(`<text x="${x}" y="${y+4}" text-anchor="middle" font-family="monospace" font-size="9" font-weight="bold" fill="${isTarget?"#003":pos.isRoot?"#3d1a00":"#002810"}" pointer-events="none">${pos.note}</text>`);
  }

  return (
    <svg
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      dangerouslySetInnerHTML={{ __html: lines.join("") }}
    />
  );
}
