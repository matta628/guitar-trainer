import guitarDataRaw from "@tombatossals/chords-db/lib/guitar.json";

interface GuitarPosition {
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

const KEY_MAP: Record<string, string> = {
  "C":"C",  "C#":"C#","Db":"C#",
  "D":"D",  "D#":"Eb","Eb":"Eb",
  "E":"E",  "F":"F",  "F#":"F#","Gb":"F#",
  "G":"G",  "G#":"Ab","Ab":"Ab",
  "A":"A",  "A#":"Bb","Bb":"Bb",
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

export function getVoicing(chordName: string): GuitarPosition | null {
  const parsed = parseChordName(chordName);
  if (!parsed) return null;
  const dbKey    = KEY_MAP[parsed.root];
  const dbSuffix = SUFFIX_MAP[parsed.suffix];
  if (!dbKey || dbSuffix === undefined) return null;
  const entry = guitarData.chords[dbKey]?.find(c => c.suffix === dbSuffix);
  return entry?.positions?.[0] ?? null;
}

// ── SVG chord diagram ─────────────────────────────────────────────────────────
const STRINGS = 6;
const ROWS    = 4;
const SX      = 13;
const RY      = 13;
const ML      = 16;
const MT      = 20;
const W       = ML + (STRINGS - 1) * SX + 18;
const H       = MT + ROWS * RY + 10;
const DOT_R   = 4.5;

export function chordDiagramSVG(chordName: string): string {
  const pos = getVoicing(chordName);
  const els: string[] = [
    `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">`,
  ];

  if (!pos) {
    els.push(`<text x="${W/2}" y="${H/2+4}" text-anchor="middle" fill="#888" font-size="9" font-family="monospace">?</text>`);
    els.push(`</svg>`);
    return els.join("");
  }

  const { frets, barres = [], baseFret = 1 } = pos;
  const showNut = baseFret === 1;

  for (let r = 0; r <= ROWS; r++) {
    const y  = MT + r * RY;
    const sw = r === 0 && showNut ? 3 : 1;
    els.push(`<line x1="${ML}" y1="${y}" x2="${ML+(STRINGS-1)*SX}" y2="${y}" stroke="#555" stroke-width="${sw}"/>`);
  }
  for (let s = 0; s < STRINGS; s++) {
    const x = ML + s * SX;
    els.push(`<line x1="${x}" y1="${MT}" x2="${x}" y2="${MT+ROWS*RY}" stroke="#555" stroke-width="1"/>`);
  }

  if (!showNut && baseFret > 1) {
    els.push(`<text x="${ML+(STRINGS-1)*SX+4}" y="${MT+RY*0.6+3}" font-size="7" fill="#777" font-family="monospace">${baseFret}fr</text>`);
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
      els.push(`<text x="${x}" y="${MT-5}" text-anchor="middle" font-size="8" fill="#666" font-family="monospace">✕</text>`);
    } else if (fret === 0) {
      els.push(`<circle cx="${x}" cy="${MT-7}" r="3" fill="none" stroke="#666" stroke-width="1"/>`);
    } else if (fret >= 1 && fret <= ROWS) {
      const y = MT + (fret - 0.5) * RY;
      els.push(`<circle cx="${x}" cy="${y}" r="${DOT_R}" fill="#e0e0e0"/>`);
    }
  });

  els.push(`</svg>`);
  return els.join("");
}
