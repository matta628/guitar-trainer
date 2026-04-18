import { AudioEngine }  from "./audio/AudioEngine.js";
import { ChordDetector } from "./audio/ChordDetector.js";
import { initArcade }    from "./modes/arcade.js";
import { initScale }     from "./modes/scale.js";

// ── Shared audio pipeline (lazily started on first mode launch) ───────────────
let engine   = null;
let detector = null;

async function ensureAudio() {
  if (engine) return { engine, detector };

  detector = new ChordDetector({});
  engine   = new AudioEngine({
    fftSize: 4096,
    onFrame: (d, m) => detector.process(d, m),
  });
  await engine.start();
  return { engine, detector };
}

// ── Screen navigation ─────────────────────────────────────────────────────────
const screens = {
  home:   document.getElementById("screen-home"),
  arcade: document.getElementById("screen-arcade"),
  scale:  document.getElementById("screen-scale"),
};

function showScreen(name) {
  Object.entries(screens).forEach(([k, el]) => { el.hidden = k !== name; });
}

// ── Home ──────────────────────────────────────────────────────────────────────
let arcadeReady = false;
let scaleReady  = false;

document.getElementById("card-arcade").addEventListener("click", async () => {
  showScreen("arcade");
  if (!arcadeReady) {
    arcadeReady = true;
    const audio = await ensureAudio();
    initArcade({
      getAudio: () => audio,
      onBack:   () => showScreen("home"),
    });
  }
});

document.getElementById("card-scale").addEventListener("click", async () => {
  showScreen("scale");
  if (!scaleReady) {
    scaleReady = true;
    const audio = await ensureAudio();
    initScale({
      getAudio: () => audio,
      onBack:   () => showScreen("home"),
    });
  }
});
