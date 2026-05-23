// App entry point. Wires menu -> game loop -> results.

import { state } from "./store.js";
import { Engine } from "./engine.js";
import { InputManager } from "./input.js";
import { Stats } from "./stats.js";
import { FlickMode } from "./modes/flick.js";
import { MicroflickMode } from "./modes/microflick.js";
import { TrackingMode } from "./modes/tracking.js";
import {
  $, bindMenu, showScreen, renderCrosshair, setHud, labelMode,
  durationSeconds, renderChart, updateReadouts,
} from "./ui.js";
import { getCm360 } from "./sensitivity.js";

const canvas = document.getElementById("three-canvas");
const engine = new Engine(canvas, state);
const input = new InputManager(canvas);
const stats = new Stats();

let mode = null;
let running = false;
let paused = false;
let startedAt = 0;
let elapsedAcc = 0;
let pauseStart = 0;
let rafId = 0;
let lastFrame = 0;
let fpsSmooth = 0;

bindMenu(startGame);
renderCrosshair();

input.on("lockchange", (locked) => {
  if (!locked && running && !paused) {
    // User pressed ESC mid-game -> pause
    paused = true;
    pauseStart = performance.now() / 1000;
    $("#pause-overlay").classList.remove("hidden");
  }
});

input.on("mousemove", ({ dx, dy }) => {
  if (!running || paused) return;
  engine.applyMouseDelta(dx, dy, state.sens, state.game, state.invertY);
});

input.on("mousedown", ({ button }) => {
  if (!running || paused) return;
  if (button !== 0) return;
  if (!mode) return;
  const now = performance.now() / 1000;
  mode.onShoot(now);
});

// Game screen buttons
$("#lock-btn").addEventListener("click", () => {
  $("#click-overlay").classList.add("hidden");
  input.requestLock();
});
$("#pause-btn").addEventListener("click", () => {
  if (!running) return;
  if (paused) return;
  paused = true;
  pauseStart = performance.now() / 1000;
  $("#pause-overlay").classList.remove("hidden");
  input.exitLock();
});
$("#resume-btn").addEventListener("click", () => {
  if (!paused) return;
  elapsedAcc += performance.now() / 1000 - pauseStart;
  paused = false;
  $("#pause-overlay").classList.add("hidden");
  input.requestLock();
});
$("#restart-btn").addEventListener("click", () => {
  cleanupRun();
  startGame();
});
$("#quit-btn").addEventListener("click", () => {
  cleanupRun();
  showScreen("menu");
  updateReadouts();
});
$("#pause-quit-btn").addEventListener("click", () => {
  cleanupRun();
  showScreen("menu");
  updateReadouts();
});
$("#retry-btn").addEventListener("click", () => {
  startGame();
});
$("#menu-btn").addEventListener("click", () => {
  showScreen("menu");
  updateReadouts();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && running && !paused) {
    // pointerlock will fire lockchange; nothing to do here
  }
  if (e.key === "p" && running) {
    $("#pause-btn").click();
  }
});

function startGame() {
  renderCrosshair();
  showScreen("game-screen");
  engine.applyPerformance(state);
  engine.applyVisualTheme(state);
  // canvas was hidden -> force resize so renderer matches real size
  requestAnimationFrame(() => engine.resize());
  engine.resetCamera();
  engine.setFov(state.fov);
  engine.clearTargets();
  stats.reset();
  paused = false;
  elapsedAcc = 0;
  fpsSmooth = 0;
  $("#fps-meter").textContent = "FPS: --";

  const ModeCls = { flick: FlickMode, microflick: MicroflickMode, tracking: TrackingMode }[state.mode];
  mode = new ModeCls(engine, stats, { ...state });
  mode.start();

  // HUD static fields
  setHud({
    mode: labelMode(state.mode),
    game: state.game === "valorant" ? "Valorant" : "CS2",
    sens: state.sens,
    cm360: getCm360(state.dpi, state.sens, state.game).toFixed(2),
  });

  $("#click-overlay").classList.remove("hidden");
  $("#pause-overlay").classList.add("hidden");
  running = true;
  lastFrame = performance.now() / 1000;
  startedAt = lastFrame;
  cancelAnimationFrame(rafId);
  loop();
}

function loop() {
  rafId = requestAnimationFrame(loop);
  const now = performance.now() / 1000;
  const dt = Math.min(0.1, now - lastFrame);
  lastFrame = now;

  if (dt > 0) {
    const instFps = 1 / dt;
    fpsSmooth = fpsSmooth === 0 ? instFps : (fpsSmooth * 0.88 + instFps * 0.12);
    $("#fps-meter").textContent = `FPS: ${Math.round(fpsSmooth)}`;
  }

  if (running && !paused) {
    mode?.update(dt, now);
    const elapsed = now - startedAt - elapsedAcc;
    const total = durationSeconds();
    const remaining = Math.max(0, total - elapsed);

    stats.sample(elapsed);

    setHud({
      time: remaining.toFixed(1),
      score: Math.round(stats.score),
      hits: stats.hits,
      acc: (stats.shots === 0
        ? (state.mode === "tracking" ? (stats.trackingAccuracy() * 100).toFixed(0) : "0")
        : (stats.accuracy() * 100).toFixed(0)) + "%",
    });

    if (remaining <= 0) finishGame();
  }

  engine.render(0.016);
}

function finishGame() {
  running = false;
  input.exitLock();

  if (state.mode === "tracking" && mode.finalizeScore) {
    mode.finalizeScore();
  }

  $("#res-score").textContent = Math.round(stats.score);
  if (state.mode === "tracking") {
    $("#res-acc").textContent = (stats.trackingAccuracy() * 100).toFixed(1) + "%";
    $("#res-hits").textContent = stats.trackingOnTime.toFixed(1) + "s no alvo";
    $("#res-miss").textContent = (stats.trackingTotalTime - stats.trackingOnTime).toFixed(1) + "s fora";
    $("#res-rt").textContent = "Suavidade " + (mode.smoothness ? mode.smoothness().toFixed(0) : "-");
    $("#res-streak").textContent = "-";
  } else {
    $("#res-acc").textContent = (stats.accuracy() * 100).toFixed(1) + "%";
    $("#res-hits").textContent = stats.hits;
    $("#res-miss").textContent = stats.misses;
    $("#res-rt").textContent = stats.avgReaction().toFixed(0) + " ms";
    $("#res-streak").textContent = stats.bestStreak;
  }
  renderChart($("#res-chart"), stats.samples);

  cleanupRun(false);
  showScreen("results-screen");
}

function cleanupRun(stopLoop = true) {
  if (stopLoop) {
    cancelAnimationFrame(rafId);
    running = false;
  }
  paused = false;
  $("#pause-overlay").classList.add("hidden");
  $("#click-overlay").classList.add("hidden");
  $("#fps-meter").textContent = "FPS: --";
  if (mode) { mode.destroy?.(); mode = null; }
  engine.clearTargets();
}