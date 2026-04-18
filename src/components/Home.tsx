import type { Screen } from "../types";

interface Props {
  onSelect: (screen: Screen) => void;
}

export default function Home({ onSelect }: Props) {
  return (
    <div className="home">
      <div>
        <h1 className="home-title">Guitar Trainer</h1>
        <p className="home-subtitle">Choose your mode</p>
      </div>

      <div className="mode-grid">
        <button className="mode-card" onClick={() => onSelect("arcade")}>
          <span className="mode-card-icon">🎸</span>
          <span className="mode-card-name">Chord Arcade</span>
          <span className="mode-card-desc">
            Play chords against the clock. Streak multipliers, auto-leveling difficulty.
          </span>
        </button>

        <button className="mode-card" onClick={() => onSelect("scale")}>
          <span className="mode-card-icon">🎵</span>
          <span className="mode-card-name">Scale Trainer</span>
          <span className="mode-card-desc">
            Practice major pentatonic scales on an interactive fretboard.
          </span>
        </button>
      </div>
    </div>
  );
}
