import type { FretPosition } from "../../types";
import {
  STRING_NAMES, STRING_NUMS, MARKER_FRETS, DOUBLE_MARKERS,
  svgWidth, svgHeight, fretX, stringY, getScaleDegree,
  PAD_L, PAD_T, FRET_W, STRING_H, DOT_R, NOTE_NAMES,
  OPEN_W,
} from "../../utils/fretboard";

type DisplayMode = "notes" | "degrees";

interface Props {
  positions:    FretPosition[];
  target:       FretPosition | null;
  startFret:    number;
  endFret:      number;
  rootKey:      string;
  displayMode?: DisplayMode;
  onNoteClick?: (pos: FretPosition) => void;
}

export default function Fretboard({
  positions, target, startFret, endFret, rootKey, displayMode = "notes", onNoteClick,
}: Props) {
  const W       = svgWidth(startFret, endFret);
  const H       = svgHeight();
  const rootPc  = NOTE_NAMES.indexOf(rootKey);
  const showOpen = startFret === 0;
  const fbX     = showOpen ? PAD_L + OPEN_W : PAD_L;
  const nFrets  = showOpen ? endFret : (endFret - startFret + 1);
  const firstFret = showOpen ? 1 : startFret;
  const markerY = PAD_T + 2 * STRING_H + STRING_H / 2;

  const strWidths = [0.9, 1.1, 1.4, 1.7, 2.0, 2.4];
  const strColors = ["#d8d8d8","#d8d8d8","#d8d8d8","#c8a050","#c8a050","#c8a050"];

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={{ width: "100%", height: "auto", display: "block" }}
    >
      {/* Background */}
      <rect width={W} height={H} fill="#1a0e06" rx={6} />
      {showOpen && (
        <rect x={PAD_L} y={PAD_T - 8} width={OPEN_W} height={5 * STRING_H + 16} fill="#110900" rx={2} />
      )}
      <rect x={fbX} y={PAD_T - 8} width={nFrets * FRET_W} height={5 * STRING_H + 16} fill="#2d1408" rx={2} />

      {/* Inlay markers */}
      {Array.from({ length: endFret - firstFret + 1 }, (_, i) => firstFret + i)
        .filter(f => MARKER_FRETS.includes(f))
        .map(f => {
          const mx = fretX(f, startFret);
          return DOUBLE_MARKERS.includes(f) ? (
            <g key={f}>
              <circle cx={mx} cy={markerY - 10} r={5} fill="#3d2010" />
              <circle cx={mx} cy={markerY + 10} r={5} fill="#3d2010" />
            </g>
          ) : (
            <circle key={f} cx={mx} cy={markerY} r={5} fill="#3d2010" />
          );
        })}

      {/* Nut */}
      {showOpen && (
        <rect x={fbX - 4} y={PAD_T - 8} width={6} height={5 * STRING_H + 16} fill="#c8a87a" rx={1} />
      )}

      {/* Fret lines */}
      {Array.from({ length: nFrets + 1 }, (_, i) => i).map(i => {
        const x = fbX + i * FRET_W;
        return (
          <line key={i} x1={x} y1={PAD_T - 4} x2={x} y2={PAD_T + 5 * STRING_H + 4}
            stroke="#6b4423" strokeWidth={1.5} />
        );
      })}

      {/* Strings */}
      {Array.from({ length: 6 }, (_, s) => (
        <line key={s}
          x1={PAD_L + 4} y1={stringY(s)} x2={W - 24} y2={stringY(s)}
          stroke={strColors[s]} strokeWidth={strWidths[s]} strokeLinecap="round"
        />
      ))}

      {/* Fret numbers */}
      {Array.from({ length: endFret - firstFret + 1 }, (_, i) => firstFret + i).map(f => (
        <text key={f} x={fretX(f, startFret)} y={PAD_T - 16}
          textAnchor="middle" fontFamily="monospace" fontSize={11} fill="#3d2a1a">
          {f}
        </text>
      ))}
      {showOpen && (
        <text x={PAD_L + OPEN_W / 2} y={PAD_T - 16}
          textAnchor="middle" fontFamily="monospace" fontSize={11} fill="#3d2a1a">
          0
        </text>
      )}

      {/* String labels */}
      {Array.from({ length: 6 }, (_, s) => (
        <text key={s} x={PAD_L - 10} y={stringY(s) + 4}
          textAnchor="end" fontFamily="monospace" fontSize={12} fill="#4a3020">
          {STRING_NAMES[s]}{STRING_NUMS[s]}
        </text>
      ))}

      {/* Scale dots — rendered as React elements so onClick works */}
      {positions.map(pos => {
        const x        = fretX(pos.fret, startFret);
        const y        = stringY(pos.stringIdx);
        const isTarget = target?.stringIdx === pos.stringIdx && target?.fret === pos.fret;
        const fill     = isTarget ? "#4af8dc" : pos.isRoot ? "#f0a500" : "#1db954";
        const stroke   = isTarget ? "#fff"    : pos.isRoot ? "#fff8e0" : "#0d8040";
        const txtColor = isTarget ? "#003"    : pos.isRoot ? "#3d1a00" : "#002810";
        const notePc   = NOTE_NAMES.indexOf(pos.note);
        const degree   = getScaleDegree(notePc, rootPc);
        const label    = displayMode === "degrees"
          ? (degree != null ? String(degree) : pos.note)
          : pos.note;
        const key = `${pos.stringIdx}-${pos.fret}`;

        return (
          <g
            key={key}
            onClick={() => onNoteClick?.(pos)}
            style={{ cursor: onNoteClick ? "pointer" : "default" }}
          >
            <circle
              cx={x} cy={y} r={DOT_R + (onNoteClick ? 4 : 0)}
              fill="transparent"
            />
            <circle
              cx={x} cy={y} r={DOT_R}
              fill={fill} stroke={stroke} strokeWidth={isTarget ? 2 : 1.5}
            />
            {isTarget && (
              <circle cx={x} cy={y} r={DOT_R + 4} fill="none" stroke="#4af8dc" strokeWidth={1.5} opacity={0.5} />
            )}
            <text
              x={x} y={y + 4}
              textAnchor="middle"
              fontFamily="monospace"
              fontSize={displayMode === "degrees" ? 12 : 9}
              fontWeight="bold"
              fill={txtColor}
              style={{ pointerEvents: "none" }}
            >
              {label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
