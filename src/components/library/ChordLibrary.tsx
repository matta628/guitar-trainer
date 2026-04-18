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

interface Props {
  onExit: () => void;
}

const TYPES: ChordType[] = ["major", "minor", "dom7", "maj7", "min7"];

// ── Modal ──────────────────────────────────────────────────────────────────────
interface ModalProps {
  chord: string;
  voicingIdx: number;
  unlockedIndices: number[];
  feedback: { text: string; ok: boolean } | null;
  onChangeVoicing: (idx: number) => void;
  onToggleVoicing: (idx: number) => void;
  onClose: () => void;
}

function ChordModal({ chord, voicingIdx, unlockedIndices, feedback, onChangeVoicing, onToggleVoicing, onClose }: ModalProps) {
  const voicings = getVoicings(chord);
  const total    = voicings.length;
  const pos      = voicings[voicingIdx] ?? null;
  const svg      = renderDiagramSVG(pos, 2.2);
  const isUnlocked = unlockedIndices.includes(voicingIdx);

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
            <button
              className="lib-nav-btn"
              onClick={() => onChangeVoicing((voicingIdx - 1 + total) % total)}
            >◄</button>
            <div className="lib-modal-voicing-dots">
              {Array.from({ length: total }, (_, i) => (
                <button
                  key={i}
                  className={`lib-voicing-dot${i === voicingIdx ? " lib-voicing-dot-active" : ""}${unlockedIndices.includes(i) ? " lib-voicing-dot-unlocked" : ""}`}
                  onClick={() => unlockedIndices.includes(i) ? onToggleVoicing(i) : onChangeVoicing(i)}
                  title={unlockedIndices.includes(i) ? `Voicing ${i + 1} — click to re-lock` : `Voicing ${i + 1}`}
                />
              ))}
            </div>
            <button
              className="lib-nav-btn"
              onClick={() => onChangeVoicing((voicingIdx + 1) % total)}
            >►</button>
          </div>
        )}

        <div className="lib-modal-status">
          {isUnlocked
            ? <span className="lib-modal-unlocked">✓ Voicing {voicingIdx + 1} unlocked in arcade</span>
            : <span className="lib-modal-locked">Strum this chord correctly to unlock</span>}
        </div>

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
  unlockedIndices: number[];
  onClick: () => void;
}

function ChordCard({ chord, unlockedIndices, onClick }: CardProps) {
  const voicings = getVoicings(chord);
  const prefIdx  = getVoicingPref(chord);
  const svg      = renderDiagramSVG(voicings[prefIdx] ?? null, 1.5);
  const total    = voicings.length;
  const numUnlocked = unlockedIndices.length;

  return (
    <button className={`lib-card${numUnlocked > 0 ? " lib-card-has-unlock" : ""}`} onClick={onClick}>
      <div className="lib-card-header">
        <span className="lib-card-name">{chord}</span>
        {numUnlocked > 0 && (
          <span className="lib-card-unlock-badge" title={`${numUnlocked}/${total} voicings unlocked`}>
            {numUnlocked}/{total}
          </span>
        )}
      </div>
      <div className="lib-card-diagram" dangerouslySetInnerHTML={{ __html: svg }} />
    </button>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────────
export default function ChordLibrary({ onExit }: Props) {
  const [tab, setTab]             = useState<ChordType>("major");
  const [modalChord, setModalChord] = useState<string | null>(null);
  const [voicingIdx, setVoicingIdx] = useState(0);
  const [unlockedMap, setUnlockedMap] = useState<Record<string, number[]>>(getAllUnlockedVoicings);
  const [feedback, setFeedback]   = useState<{ text: string; ok: boolean } | null>(null);

  const activeChordRef   = useRef<string | null>(null);
  const activeVoicingRef = useRef(0);

  const handleChord = useCallback(({ chord, noteNames }: ChordResult) => {
    if (!activeChordRef.current) return;
    const target = activeChordRef.current;
    if (chord && chordMatches(noteNames, target)) {
      unlockVoicing(target, activeVoicingRef.current);
      setUnlockedMap(getAllUnlockedVoicings());
      setFeedback({ text: `✓ ${chord} — voicing ${activeVoicingRef.current + 1} unlocked!`, ok: true });
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

  function toggleVoicing(idx: number) {
    if (!modalChord) return;
    relockVoicing(modalChord, idx);
    setUnlockedMap(getAllUnlockedVoicings());
    setFeedback(null);
  }

  function unlockAllFirstVoicings() {
    tabChords.forEach(chord => unlockVoicing(chord, 0));
    setUnlockedMap(getAllUnlockedVoicings());
  }

  const allChords     = getAllChords();
  const tabChords     = allChords.filter(c => getChordType(c) === tab);
  const totalUnlocked = Object.keys(unlockedMap).length;
  const tabAllUnlocked = tabChords.every(c => (unlockedMap[c] ?? []).includes(0));

  return (
    <div className="lib-screen">
      <div className="lib-topbar">
        <button className="btn-back btn" onClick={onExit}>← Home</button>
        <span className="lib-title">Chord Library</span>
        <span className="lib-subtitle">
          Click a chord to open it and strum to unlock it for arcade
          · {totalUnlocked} chord{totalUnlocked !== 1 ? "s" : ""} unlocked
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
          onClick={unlockAllFirstVoicings}
          disabled={tabAllUnlocked}
          title="Unlock voicing 1 of every chord in this tab without strumming"
        >
          {tabAllUnlocked ? "✓ All 1st voicings unlocked" : "Unlock all (1st voicing)"}
        </button>
      </div>

      <div className="lib-grid">
        {tabChords.map(chord => (
          <ChordCard
            key={chord}
            chord={chord}
            unlockedIndices={unlockedMap[chord] ?? []}
            onClick={() => openModal(chord)}
          />
        ))}
      </div>

      {modalChord && (
        <ChordModal
          chord={modalChord}
          voicingIdx={voicingIdx}
          unlockedIndices={unlockedMap[modalChord] ?? []}
          feedback={feedback}
          onChangeVoicing={changeVoicing}
          onToggleVoicing={toggleVoicing}
          onClose={closeModal}
        />
      )}
    </div>
  );
}
