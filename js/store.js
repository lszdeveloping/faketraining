// Lightweight global state + LocalStorage persistence

const KEY = "aimforge.settings.v1";

const defaults = {
  game: "valorant",
  sens: 0.4,
  dpi: 800,
  fov: 103,
  duration: 60,
  durationCustom: 45,
  targetSize: 0.6,
  targetDistance: 15,
  spawnRangeDeg: 30,
  targetColor: "#ff4d6d",
  bgTheme: "dark",
  difficulty: "medium",
  mode: "flick",
  crossStyle: "cross",
  crossColor: "#00ff88",
  crossSize: 10,
  crossThick: 2,
  pixelRatioCap: 1.25,
  antialias: false,
  smoothing: false,
  invertY: false,
};

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...defaults };
    return { ...defaults, ...JSON.parse(raw) };
  } catch {
    return { ...defaults };
  }
}

export const state = load();

export function saveState() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {}
}

export function setState(patch) {
  Object.assign(state, patch);
  saveState();
}