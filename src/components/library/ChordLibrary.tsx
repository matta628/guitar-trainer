import { useCallback, useRef, useState } from "react";
import { useAudio } from "../../hooks/useAudio";
import {
  getAllChords, getChordType, CHORD_TYPE_LABELS,
  chordMatches, type ChordType,
} from "../../utils/chordUtils";
import {
  getVoicings, getVoicingPref, setVoicingPref,
  renderDiagramSVG, getAllUnlockedVoicings, unlockVoicing, relockVoicing,
} from "../../utils/voicings";
import type { ChordResult } from "../../types";

interface Props { onExit: () => void; }

const TYPES: ChordType[] = ["major", "minor", "dom7", "maj7", "min7"];

// ── Modal ──────────────────────────────────────────────────────────────────────
interface ModalProps {
  chord: string;
  voicingIdx: number;
  selectedIndices: number[];
  feedback: { text: string; ok: boolean } | null;
  onChangeVoicing: (idx: number) => void;
  onToggleCurrent: () => void;
  onClose: () => void;
}

function ChordModal({ chord, voicingIdx, selectedIndices, feedback, onChangeVoicing, onToggleCurrent, onClose }: ModalProps) {
  const voicings   = getVoicings(chord);
  const total      = voicings.length;
  const pos        = voicings[voicingIdx] ?? null;
  const svg        = renderDiagramSVG(pos, 2.2);
  const isSelected = selectedIndices.includes(voicingIdx);

  return (
    <div className="lib-modal-overlay" onClick={onClose}>
      <div className="lib-modal" onClick={e => e.stopPropagation()}>
        <div className="lib-modal-header">
          <span className="lib-modal-chord">{chord}</span>
          <button className="lib-modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="lib-modal-diagram" dangerouslySetInnerHTML={{ __html: svg }} />

        {total > 1 && (
          <div className="lib-modal-voicing-row">
            <button className="lib-nav-btn" onClick={() => onChangeVoicing((voicingIdx - 1 + total) % total)}>◄</button>
            <div className="lib-modal-voicing-dots">
              {Array.from({ length: total }, (_, i) => (
                <button
                  key={i}
                  className={`lib-voicing-dot${i === voicingIdx ? " lib-voicing-dot-active" : ""}${selectedIndices.includes(i) ? " lib-voicing-dot-selected" : ""}`}
                  onClick={() => onChangeVoicing(i)}
                  title={`Voicing ${i + 1}${selectedIndices.includes(i) ? " — selected" : ""}`}
                />
              ))}
            </div>
            <button className="lib-nav-btn" onClick={() => onChangeVoicing((voicingIdx + 1) % total)}>►</button>
          </div>
        )}

        <button
          className={`lib-select-btn${isSelected ? " lib-select-btn-on" : ""}`}
          onClick={onToggleCurrent}
        >
          {isSelected ? "✓ Selected for arcade — click to deselect" : "Select for arcade"}
        </button>

        <div className={`lib-modal-feedback${feedback ? (feedback.ok ? " lib-feedback-ok" : " lib-feedback-bad") : ""}`}>
          {feedback ? feedback.text : "🎸 Listening…"}
        </div>
      </div>
    </div>
  );
}

// ── Card ───────────────────────────────────────────────────────────────────────
interface CardProps {
  chord: string;
  selectedIndices: number[];
  onClick: () => void;
}

function ChordCard({ chord, selectedIndices, onClick }: CardProps) {
  const voicings    = getVoicings(chord);
  const prefIdx     = getVoicingPref(chord);
  const svg         = renderDiagramSVG(voicings[prefIdx] ?? null, 1.5);
  const total       = voicings.length;
  const numSelected = selectedIndices.length;

  return (
    <button className={`lib-card${numSelected > 0 ? " lib-card-has-selected" : ""}`} onClick={onClick}>
      <div className="lib-card-header">
        <span className="lib-card-name">{chord}</span>
        {numSelected > 0 && (
          <span className="lib-card-selected-badge" title={`${numSelected}/${total} voicings selected`}>
            {numSelected}/{total}
          </span>
        )}
      </div>
      <div className="lib-card-diagram" dangerouslySetInnerHTML={{ __html: svg }} />
    </button>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────────
export default function ChordLibrary({ onExit }: Props) {
  const [tab, setTab]               = useState<ChordType>("major");
  const [modalChord, setModalChord] = useState<string | null>(null);
  const [voicingIdx, setVoicingIdx] = useState(0);
  const [selectedMap, setSelectedMap] = useState<Record<string, number[]>>(getAllUnlockedVoicings);
  const [feedback, setFeedback]     = useState<{ text: string; ok: boolean } | null>(null);

  const activeChordRef   = useRef<string | null>(null);
  const activeVoicingRef = useRef(0);

  // Listening only — confirms detection, no longer auto-selects
  const handleChord = useCallback(({ chord, noteNames }: ChordResult) => {
    if (!activeChordRef.current) return;
    const target = activeChordRef.current;
    if (chord && chordMatches(noteNames, target)) {
      setFeedback({ text: `✓ ${chord} detected correctly`, ok: true });
    } else if (chord) {
      setFeedback({ text: `Hearing: ${chord}`, ok: false });
    }
  }, []);

  useAudio({ onChord: handleChord });

  function openModal(chord: string) {
    const pref = getVoicingPref(chord);
    setModalChord(chord);
    setVoicingIdx(pref);
    setFeedback(null);
    activeChordRef.current   = chord;
    activeVoicingRef.current = pref;
  }

  function closeModal() {
    setModalChord(null);
    setFeedback(null);
    activeChordRef.current = null;
  }

  function changeVoicing(idx: number) {
    setVoicingIdx(idx);
    activeVoicingRef.current = idx;
    setFeedback(null);
    if (modalChord) setVoicingPref(modalChord, idx);
  }

  function toggleCurrentVoicing() {
    if (!modalChord) return;
    const idx      = activeVoicingRef.current;
    const isSelected = (selectedMap[modalChord] ?? []).includes(idx);
    if (isSelected) relockVoicing(modalChord, idx);
    else             unlockVoicing(modalChord, idx);
    setSelectedMap(getAllUnlockedVoicings());
  }

  function selectAllFirstVoicings() {
    tabChords.forEach(chord => unlockVoicing(chord, 0));
    setSelectedMap(getAllUnlockedVoicings());
  }

  function deselectAllVoicings() {
    tabChords.forEach(chord => {
      (selectedMap[chord] ?? []).forEach(idx => relockVoicing(chord, idx));
    });
    setSelectedMap(getAllUnlockedVoicings());
  }

  const allChords          = getAllChords();
  const tabChords          = allChords.filter(c => getChordType(c) === tab);
  const totalSelected      = Object.keys(selectedMap).length;
  const tabAllFirstSelected = tabChords.every(c => (selectedMap[c] ?? []).includes(0));
  const tabNoneSelected    = tabChords.every(c => (selectedMap[c] ?? []).length === 0);

  return (
    <div className="lib-screen">
      <div className="lib-topbar">
        <button className="btn-back btn" onClick={onExit}>← Home</button>
        <span className="lib-title">Chord Library</span>
        <span className="lib-subtitle">
          Click a chord to browse voicings and select them for arcade
          · {totalSelected} chord{totalSelected !== 1 ? "s" : ""} selected
        </span>
      </div>

      <div className="lib-tabs">
        {TYPES.map(t => (
          <button
            key={t}
            className={`lib-tab${tab === t ? " lib-tab-active" : ""}`}
            onClick={() => setTab(t)}
          >
            {CHORD_TYPE_LABELS[t]}
          </button>
        ))}
        <button
          className="lib-tab-unlock-all"
          onClick={selectAllFirstVoicings}
          disabled={tabAllFirstSelected}
          title="Select voicing 1 of every chord in this tab"
        >
          {tabAllFirstSelected ? "✓ All 1st voicings selected" : "Select all 1st voicings"}
        </button>
        <button
          className="lib-tab-unlock-all lib-tab-deselect-all"
          onClick={deselectAllVoicings}
          disabled={tabNoneSelected}
          title="Deselect all voicings in this tab"
        >
          Deselect all
        </button>
      </div>

      <div className="lib-grid">
        {tabChords.map(chord => (
          <ChordCard
            key={chord}
            chord={chord}
            selectedIndices={selectedMap[chord] ?? []}
            onClick={() => openModal(chord)}
          />
        ))}
      </div>

      {modalChord && (
        <ChordModal
          chord={modalChord}
          voicingIdx={voicingIdx}
          selectedIndices={selectedMap[modalChord] ?? []}
          feedback={feedback}
          onChangeVoicing={changeVoicing}
          onToggleCurrent={toggleCurrentVoicing}
          onClose={closeModal}
        />
      )}
    </div>
  );
}
