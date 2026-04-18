import { chordDiagramSVG } from "../../utils/voicings";

interface Props {
  chord: string;
}

export default function ChordDiagram({ chord }: Props) {
  const svg = chordDiagramSVG(chord);
  return (
    <div className="arc-diagram-wrap">
      <span className="arc-diagram-label">voicing</span>
      <div dangerouslySetInnerHTML={{ __html: svg }} />
    </div>
  );
}
