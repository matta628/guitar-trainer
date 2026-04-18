import { chordDiagramSVG } from "../../utils/voicings";

interface Props {
  chord: string;
  locked?: boolean;
}

export default function ChordDiagram({ chord, locked }: Props) {
  if (locked) {
    return (
      <div className="arc-diagram-wrap">
        <span className="arc-diagram-label">voicing</span>
        <div className="arc-diagram-locked">
          <span className="arc-diagram-lock-icon">🔒</span>
          <span className="arc-diagram-lock-text">Play it correctly to reveal</span>
        </div>
      </div>
    );
  }

  return (
    <div className="arc-diagram-wrap">
      <span className="arc-diagram-label">voicing</span>
      <div dangerouslySetInnerHTML={{ __html: chordDiagramSVG(chord) }} />
    </div>
  );
}
