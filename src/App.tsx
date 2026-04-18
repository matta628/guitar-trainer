import { useState } from "react";
import Home from "./components/Home";
import Arcade from "./components/arcade/Arcade";
import ScaleTrainer from "./components/scale/ScaleTrainer";
import ChordLibrary from "./components/library/ChordLibrary";
import type { Screen } from "./types";

export default function App() {
  const [screen, setScreen] = useState<Screen>("home");

  if (screen === "arcade")  return <Arcade onExit={() => setScreen("home")} />;
  if (screen === "scale")   return <ScaleTrainer onExit={() => setScreen("home")} />;
  if (screen === "library") return <ChordLibrary onExit={() => setScreen("home")} />;
  return <Home onSelect={setScreen} />;
}
