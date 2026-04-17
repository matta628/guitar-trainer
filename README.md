# Guitar Trainer

A gamified music theory trainer with real-time guitar chord detection via Web Audio API.

---

## Architecture Decisions

### Input
- **Device**: Fender Mustang Micro → laptop audio input
- **Capture**: Web Audio API (`getUserMedia` → `AudioContext` → `AnalyserNode`)

### Pitch Detection
- **Approach**: Polyphonic (detects multiple simultaneous pitches for full chord strums)
- **Rationale**: Monophonic only captures the dominant frequency — useless for chord detection
- **Monophonic reserved for**: Scale/pentatonic mode (single note exercises, Phase 2)

### Chord Detection
- **Step 1**: Polyphonic pitch detection → list of (frequency, octave) pairs
- **Step 2**: Frequencies → note names with octave (e.g. A2, E3, C#4)
- **Step 3**: Note names (without octave) → chord name via template matching
- **Step 4 (future)**: Note octave positions → chord voicing (open vs barred)

### Voicing Detection (future)
- Open A: mutes low E string → no A2 in detected notes
- Barred A: frets low E at 5th fret → A2 present
- Octave profile differentiates voicings without any camera/sensor — purely from pitch data

### Music Theory Library
- `@tonaljs/tonal` — chord dictionaries, note name utilities, interval math

### Tech Stack
- **MVP / Latency Tester**: Vanilla JS + Vite (React only if latency validates well)
- **Full Game**: React + TypeScript (migrate after latency is validated)
- **Desktop wrapper (if needed)**: Electron or Tauri if React render loop adds too much latency

---

## Latency Budget
- Target: < 200ms strum → visual feedback
- Acceptable: < 300ms
- Unacceptable: > 400ms (feels like lag, breaks gameplay)

---

## Phase Plan

### Phase 1: Latency Tester (current)
Validate the full pipeline before investing in game UI.
- [ ] Capture audio from Mustang Micro
- [ ] Detect polyphonic pitches in real time
- [ ] Display detected note names + chord name
- [ ] Measure and display latency (chord shown → chord detected)
- [ ] Basic pass/fail: did you hit the target chord within N seconds?

### Phase 2: Arcade Mode (Chord Game)
- [ ] Game loop: show chord → player strums → detect → score
- [ ] Adjustable time window per chord
- [ ] Streak, score, high score tracking
- [ ] Pass/fail feedback (visual + audio)
- [ ] Chord difficulty progression (open chords → barre chords → extensions)

### Phase 3: Scale Mode
- [ ] Pentatonic scale exercises
- [ ] Switch to monophonic detection for single note tracking
- [ ] Weave chord + scale logic for riff context

### Phase 4: Additional Game Modes
- [ ] Spaceship / arcade shooter concept (Rocksmith-style)
- [ ] Chord progression challenges
- [ ] Voicing detection (open vs barred differentiation)

---

## Project Structure

```
guitar_trainer/
├── README.md                  ← this file
└── latency_tester/            ← Phase 1: pipeline validation
    ├── index.html
    ├── package.json
    ├── vite.config.js
    └── src/
        ├── main.js            ← app entry point
        ├── audio/
        │   ├── AudioEngine.js ← Web Audio API setup + mic capture
        │   └── ChordDetector.js ← pitch detection + chord recognition
        └── utils/
            ├── noteUtils.js   ← frequency → note name + octave
            └── chordUtils.js  ← note set → chord name
```
