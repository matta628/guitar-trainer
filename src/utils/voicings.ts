import guitarDataRaw from "@tombatossals/chords-db/lib/guitar.json";
import { profileKey } from "./profiles";

export interface GuitarPosition {
  frets: number[];
  fingers: number[];
  baseFret: number;
  barres: number[];
  capo?: boolean;
}

interface GuitarChordEntry {
  key: string;
  suffix: string;
  positions: GuitarPosition[];
}

interface GuitarData {
  chords: Record<string, GuitarChordEntry[]>;
}

const guitarData = guitarDataRaw as unknown as GuitarData;

// NOTE: the DB uses "Csharp" / "Fsharp" — NOT "C#" / "F#"
const KEY_MAP: Record<string, string> = {
  "C":"C",       "C#":"Csharp", "Db":"Csharp",
  "D":"D",       "D#":"Eb",     "Eb":"Eb",
  "E":"E",       "F":"F",       "F#":"Fsharp", "Gb":"Fsharp",
  "G":"G",       "G#":"Ab",     "Ab":"Ab",
  "A":"A",       "A#":"Bb",     "Bb":"Bb",
  "B":"B",
};

const SUFFIX_MAP: Record<string, string> = {
  "":"major", "m":"minor", "7":"7", "maj7":"maj7", "m7":"m7",
};

function parseChordName(name: string): { root: string; suffix: string } | null {
  const m = name.match(/^([A-G][b#]?)(maj7|m7|m|7)?$/);
  if (!m) return null;
  return { root: m[1], suffix: m[2] ?? "" };
}

export function getVoicings(chordName: string): GuitarPosition[] {
  const parsed = parseChordName(chordName);
  if (!parsed) return [];
  const dbKey    = KEY_MAP[parsed.root];
  const dbSuffix = SUFFIX_MAP[parsed.suffix];
  if (!dbKey || dbSuffix === undefined) return [];
  return guitarData.chords[dbKey]?.find(c => c.suffix === dbSuffix)?.positions ?? [];
}

// ── Voicing preference (per chord, persisted per profile) ─────────────────────

export function getVoicingPref(chordName: string): number {
  try {
    const prefs = JSON.parse(localStorage.getItem(profileKey("voicing_prefs")) ?? "{}");
    return Number(prefs[chordName] ?? 0);
  } catch { return 0; }
}

export function setVoicingPref(chordName: string, idx: number): void {
  try {
    const prefs = JSON.parse(localStorage.getItem(profileKey("voicing_prefs")) ?? "{}");
    prefs[chordName] = idx;
    localStorage.setItem(profileKey("voicing_prefs"), JSON.stringify(prefs));
  } catch {}
}

export function getVoicing(chordName: string): GuitarPosition | null {
  const voicings = getVoicings(chordName);
  return voicings[getVoicingPref(chordName)] ?? voicings[0] ?? null;
}

// ── Per-voicing unlock tracking (per profile) ─────────────────────────────────
// Structure: { "Bbm": [0, 2], "Am": [0] }  → voicing indices that are unlocked

function loadUnlockMap(): Record<string, number[]> {
  try { return JSON.parse(localStorage.getItem(profileKey("unlocked_voicings")) ?? "{}"); }
  catch { return {}; }
}

function saveUnlockMap(map: Record<string, number[]>): void {
  localStorage.setItem(profileKey("unlocked_voicings"), JSON.stringify(map));
}

export function getAllUnlockedVoicings(): Record<string, number[]> {
  return loadUnlockMap();
}

export function getUnlockedVoicingIndices(chordName: string): number[] {
  return loadUnlockMap()[chordName] ?? [];
}

export function isChordUnlocked(chordName: string): boolean {
  return getUnlockedVoicingIndices(chordName).length > 0;
}

export function unlockVoicing(chordName: string, voicingIdx: number): void {
  const map = loadUnlockMap();
  const existing = map[chordName] ?? [];
  if (!existing.includes(voicingIdx)) {
    map[chordName] = [...existing, voicingIdx].sort((a, b) => a - b);
    saveUnlockMap(map);
  }
}

export function relockVoicing(chordName: string, voicingIdx: number): void {
  const map = loadUnlockMap();
  const existing = map[chordName] ?? [];
  const next = existing.filter(i => i !== voicingIdx);
  if (next.length === 0) {
    delete map[chordName];
  } else {
    map[chordName] = next;
  }
  saveUnlockMap(map);
}

// ── SVG rendering ─────────────────────────────────────────────────────────────
// scale=1 → small (original), scale=1.6 → library, scale=2 → arcade
export function renderDiagramSVG(pos: GuitarPosition | null, scale = 1): string {
  const STRINGS = 6;
  const ROWS    = 4;
  const SX      = Math.round(13 * scale);
  const RY      = Math.round(13 * scale);
  const ML      = Math.round(16 * scale);
  const MT      = Math.round(20 * scale);
  const DOT_R   = 4.5 * scale;
  const W       = ML + (STRINGS - 1) * SX + Math.round(18 * scale);
  const H       = MT + ROWS * RY + Math.round(10 * scale);
  const fs      = Math.round(7 * scale);   // font size
  const fsSmall = Math.round(6 * scale);

  const els: string[] = [
    `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">`,
  ];

  if (!pos) {
    els.push(`<text x="${W/2}" y="${H/2+4}" text-anchor="middle" fill="#888" font-size="${fs+2}" font-family="monospace">?</text>`);
    els.push(`</svg>`);
    return els.join("");
  }

  const { frets, barres = [], baseFret = 1 } = pos;
  const showNut = baseFret === 1;

  for (let r = 0; r <= ROWS; r++) {
    const y  = MT + r * RY;
    const sw = r === 0 && showNut ? Math.round(3 * scale) : 1;
    els.push(`<line x1="${ML}" y1="${y}" x2="${ML+(STRINGS-1)*SX}" y2="${y}" stroke="#555" stroke-width="${sw}"/>`);
  }
  for (let s = 0; s < STRINGS; s++) {
    const x = ML + s * SX;
    els.push(`<line x1="${x}" y1="${MT}" x2="${x}" y2="${MT+ROWS*RY}" stroke="#555" stroke-width="1"/>`);
  }

  if (!showNut && baseFret > 1) {
    els.push(`<text x="${ML+(STRINGS-1)*SX+Math.round(4*scale)}" y="${MT+RY*0.6+3}" font-size="${fsSmall}" fill="#777" font-family="monospace">${baseFret}fr</text>`);
  }

  for (const barreFret of barres) {
    const row = barreFret;
    if (row < 1 || row > ROWS) continue;
    const y = MT + (row - 0.5) * RY;
    const barStrings = frets.map((f, i) => f === barreFret ? i : -1).filter(i => i >= 0);
    if (barStrings.length < 2) continue;
    const x1 = ML + Math.min(...barStrings) * SX;
    const x2 = ML + Math.max(...barStrings) * SX;
    els.push(`<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="#ddd" stroke-width="${DOT_R * 1.8}" stroke-linecap="round"/>`);
  }

  frets.forEach((fret, s) => {
    const x = ML + s * SX;
    if (fret === -1) {
      els.push(`<text x="${x}" y="${MT - Math.round(5*scale)}" text-anchor="middle" font-size="${fs+1}" fill="#666" font-family="monospace">✕</text>`);
    } else if (fret === 0) {
      els.push(`<circle cx="${x}" cy="${MT - Math.round(7*scale)}" r="${Math.round(3*scale)}" fill="none" stroke="#666" stroke-width="1"/>`);
    } else if (fret >= 1 && fret <= ROWS) {
      const y = MT + (fret - 0.5) * RY;
      els.push(`<circle cx="${x}" cy="${y}" r="${DOT_R}" fill="#e0e0e0"/>`);
    }
  });

  els.push(`</svg>`);
  return els.join("");
}

export function chordDiagramSVG(chordName: string, scale = 1): string {
  return renderDiagramSVG(getVoicing(chordName), scale);
}
