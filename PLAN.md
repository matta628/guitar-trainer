# Guitar Trainer — Roadmap & Future Work

## Profiles
- Named local profiles (stored in localStorage, keyed by profile name)
- Each profile owns its own:
  - Unlocked chord voicings
  - Personal high score per difficulty
- Global high score still shown alongside personal best (aggregate across all profiles)
- Profile switcher on the Home screen

## Chord Timing Analytics
- Record how long (ms) each correct chord play takes, per chord, per profile
- Store a rolling window (e.g. last 20 plays per chord) to smooth out outliers
- Expose a simple data viewer: table of chords × median response time
- Use this data to re-calibrate difficulty tiers (see below)

## Data-Driven Difficulty Tiers
- Maintain a text file (`chords.txt` or `difficulties.json`) that explicitly lists
  which chords belong to easy / medium / hard / expert
- User can edit/review this file and the app reloads from it
- Eventually: auto-suggest tier changes based on median response time data
  (e.g. if "F" is consistently slow across profiles, bump it to medium)

## Timer Progression
- Default timer starts at 10s for everyone (not 6s)
- Timer shortens automatically as difficulty level increases:
    easy   → 10s
    medium →  7s
    hard   →  5s
    expert →  3.5s
- Remove manual time adjuster (or make it an "advanced" toggle)
- Rationale: prevents indefinite streaks at easy difficulty with a long timer

## Notes / Open Questions
- Profiles are local-only for now; cloud sync is out of scope until there's a backend
- Global high score = highest score ever recorded across all local profiles
- Chord timing data stays local; no telemetry
- chords.txt format TBD — probably one chord per line with a tier prefix:
    easy:   E, A, D, G, C, Em, Am, Dm
    medium: F, Bb, Eb, ...
