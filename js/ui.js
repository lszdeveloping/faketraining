// DOM/UI helpers: menu binding, HUD updates, crosshair rendering, results screen.

import { getCm360, getEdpi, convertSensitivity } from "./sensitivity.js";
import { state, setState } from "./store.js";

export const $ = (sel) => document.querySelector(sel);

export function showScreen(id) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
  document.getElementById(id).classList.add("active");
}

export function bindMenu(onStart, onCalibrate) {
  // hydrate inputs from state
  $("#game").value = state.game;
  $("#sens").value = state.sens;
  $("#dpi").value = state.dpi;
  $("#fov").value = state.fov;
  $("#browserFeelMult").value = state.browserFeelMult;
  $("#customYaw").value = state.customYaw;
  document.getElementById("customYaw-wrap").style.display = state.game === "custom" ? "" : "none";
  $("#duration").value = String(state.duration);
  $("#duration-custom").value = state.durationCustom;
  $("#targetSize").value = state.targetSize;
  $("#targetDistance").value = state.targetDistance;
  $("#spawnRangeDeg").value = state.spawnRangeDeg;
  $("#trackingTargetSize").value = state.trackingTargetSize;
  $("#trackingSpeed").value = state.trackingSpeed;
  $("#trackingRandomness").value = state.trackingRandomness;
  $("#targetColor").value = state.targetColor;
  $("#bgTheme").value = state.bgTheme;
  $("#pixelRatioCap").value = state.pixelRatioCap;
  $("#antialias").value = state.antialias ? "on" : "off";
  $("#difficulty").value = state.difficulty;
  $("#crossStyle").value = state.crossStyle;
  $("#crossColor").value = state.crossColor;
  $("#crossSize").value = state.crossSize;
  $("#crossThick").value = state.crossThick;

  // mode cards
  document.querySelectorAll(".mode-card").forEach((card) => {
    if (card.dataset.mode === state.mode) card.classList.add("selected");
    card.addEventListener("click", () => {
      document.querySelectorAll(".mode-card").forEach((c) => c.classList.remove("selected"));
      card.classList.add("selected");
      setState({ mode: card.dataset.mode });
      $("#start-btn").textContent = `Iniciar treino (${labelMode(state.mode)})`;
    });
  });

  // duration custom toggle
  $("#duration").addEventListener("change", () => {
    const v = $("#duration").value;
    if (v === "custom") {
      $("#duration-custom-wrap").style.display = "";
      setState({ duration: "custom" });
    } else {
      $("#duration-custom-wrap").style.display = "none";
      setState({ duration: parseInt(v, 10) });
    }
    updateReadouts();
  });
  if (state.duration === "custom") $("#duration-custom-wrap").style.display = "";

  const numericFields = [
    ["#sens", "sens", parseFloat],
    ["#dpi", "dpi", (v) => parseInt(v, 10)],
    ["#fov", "fov", (v) => parseInt(v, 10)],
    ["#browserFeelMult", "browserFeelMult", parseFloat],
    ["#customYaw", "customYaw", parseFloat],
    ["#duration-custom", "durationCustom", (v) => parseInt(v, 10)],
    ["#targetSize", "targetSize", parseFloat],
    ["#targetDistance", "targetDistance", parseFloat],
    ["#spawnRangeDeg", "spawnRangeDeg", parseFloat],
    ["#trackingTargetSize", "trackingTargetSize", parseFloat],
    ["#trackingSpeed", "trackingSpeed", parseFloat],
    ["#trackingRandomness", "trackingRandomness", (v) => parseInt(v, 10)],
    ["#pixelRatioCap", "pixelRatioCap", parseFloat],
    ["#crossSize", "crossSize", (v) => parseInt(v, 10)],
    ["#crossThick", "crossThick", (v) => parseInt(v, 10)],
  ];
  for (const [sel, key, parse] of numericFields) {
    $(sel).addEventListener("input", () => {
      const v = parse($(sel).value);
      if (!Number.isNaN(v)) setState({ [key]: v });
      updateReadouts();
      renderPreviews();
    });
  }

  $("#game").addEventListener("change", () => {
    setState({ game: $("#game").value });
    document.getElementById("customYaw-wrap").style.display = state.game === "custom" ? "" : "none";
    if (state.game === "valorant" && (state.fov === 90 || !state.fov)) {
      setState({ fov: 103 });
      $("#fov").value = 103;
    } else if (state.game === "cs2" && state.fov === 103) {
      setState({ fov: 90 });
      $("#fov").value = 90;
    }
    updateReadouts();
  });

  $("#crossStyle").addEventListener("change", () => {
    setState({ crossStyle: $("#crossStyle").value });
    renderPreviews();
  });
  $("#crossColor").addEventListener("input", () => {
    setState({ crossColor: $("#crossColor").value });
    renderPreviews();
  });
  $("#targetColor").addEventListener("input", () => {
    setState({ targetColor: $("#targetColor").value });
    renderPreviews();
  });
  $("#bgTheme").addEventListener("change", () => {
    setState({ bgTheme: $("#bgTheme").value });
    renderPreviews();
  });
  $("#difficulty").addEventListener("change", () => {
    setState({ difficulty: $("#difficulty").value });
    renderPreviews();
  });
  $("#antialias").addEventListener("change", () => {
    setState({ antialias: $("#antialias").value === "on" });
  });

  $("#start-btn").textContent = `Iniciar treino (${labelMode(state.mode)})`;
  $("#start-btn").addEventListener("click", onStart);
  $("#calibrate-btn").addEventListener("click", onCalibrate);
  $("#fullscreen-btn").addEventListener("click", () => {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
    else document.exitFullscreen?.();
  });

  updateReadouts();
  renderPreviews();
  window.addEventListener("resize", renderPreviews);
}

export function labelMode(m) {
  return { flick: "Flick", microflick: "Microflick", tracking: "Tracking" }[m] || m;
}

export function updateReadouts() {
  const edpi = getEdpi(state.dpi, state.sens);
  const cm360 = getCm360(state.dpi, state.sens, state.game, state.browserFeelMult, state.customYaw);

  let equivLabel, equivVal;
  if (state.game === "custom") {
    equivLabel = "Valorant equiv.";
    equivVal = convertSensitivity(state.sens, state.game, "valorant", state.customYaw).toFixed(3);
  } else {
    const other = state.game === "valorant" ? "cs2" : "valorant";
    equivLabel = `${other === "cs2" ? "CS2" : "Valorant"} equivalente`;
    equivVal = convertSensitivity(state.sens, state.game, other).toFixed(3);
  }

  $("#r-edpi").textContent = edpi || "-";
  $("#r-cm360").textContent = cm360 ? cm360.toFixed(2) + " cm" : "-";
  $("#r-equiv-label").textContent = equivLabel;
  $("#r-equiv").textContent = equivVal;
}

export function renderCrosshair() {
  const el = document.getElementById("crosshair");
  const { crossStyle, crossColor, crossSize, crossThick } = state;
  const c = crossColor;
  const s = crossSize;
  const t = crossThick;

  let html = "";
  if (crossStyle === "dot" || crossStyle === "both") {
    html += `<div style="position:absolute;left:-${t}px;top:-${t}px;width:${t * 2}px;height:${t * 2}px;background:${c};border-radius:50%;"></div>`;
  }
  if (crossStyle === "cross" || crossStyle === "both") {
    html += `<div style="position:absolute;left:-${s}px;top:-${t / 2}px;width:${s * 2}px;height:${t}px;background:${c};"></div>`;
    html += `<div style="position:absolute;left:-${t / 2}px;top:-${s}px;width:${t}px;height:${s * 2}px;background:${c};"></div>`;
  }
  el.innerHTML = html;
}

export function setHud(fields) {
  for (const [k, v] of Object.entries(fields)) {
    const el = document.getElementById("hud-" + k);
    if (el) el.textContent = v;
  }
}

export function durationSeconds() {
  return state.duration === "custom" ? state.durationCustom : state.duration;
}

/**
 * Render menu previews:
 *  - crosshair preview (uses current crosshair settings)
 *  - target preview (shows target size in apparent screen size at current
 *    distance + FOV, plus the circular spawn range ring)
 */
export function renderPreviews() {
  renderCrosshairPreview();
  renderTargetPreview();
}

function setupHiDpi(canvas) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const cssW = canvas.clientWidth || canvas.width;
  const cssH = canvas.clientHeight || canvas.height;
  if (canvas.width !== Math.round(cssW * dpr)) {
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
  }
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w: cssW, h: cssH };
}

function previewTheme() {
  if (state.bgTheme === "light") {
    return { center: "#6a7384", edge: "#3b4251", label: "rgba(245,248,255,0.8)" };
  }
  if (state.bgTheme === "black") {
    return { center: "#0d0f12", edge: "#010102", label: "rgba(220,228,238,0.72)" };
  }
  return { center: "#22283a", edge: "#070a10", label: "rgba(225,233,245,0.72)" };
}

function hexToRgb(hex) {
  const clean = (hex || "").replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return { r: 255, g: 77, b: 109 };
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

function scaleRgb(rgb, k) {
  return {
    r: Math.max(0, Math.min(255, Math.round(rgb.r * k))),
    g: Math.max(0, Math.min(255, Math.round(rgb.g * k))),
    b: Math.max(0, Math.min(255, Math.round(rgb.b * k))),
  };
}

function rgbStr(rgb, a = 1) {
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${a})`;
}

function renderCrosshairPreview() {
  const canvas = document.getElementById("crosshair-preview");
  if (!canvas) return;
  const { ctx, w, h } = setupHiDpi(canvas);
  ctx.clearRect(0, 0, w, h);

  const theme = previewTheme();
  const g = ctx.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, Math.max(w, h) / 1.5);
  g.addColorStop(0, theme.center);
  g.addColorStop(1, theme.edge);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  const cx = w / 2;
  const cy = h / 2;
  const { crossStyle, crossColor, crossSize, crossThick } = state;
  ctx.fillStyle = crossColor;
  if (crossStyle === "dot" || crossStyle === "both") {
    ctx.beginPath();
    ctx.arc(cx, cy, crossThick, 0, Math.PI * 2);
    ctx.fill();
  }
  if (crossStyle === "cross" || crossStyle === "both") {
    ctx.fillRect(cx - crossSize, cy - crossThick / 2, crossSize * 2, crossThick);
    ctx.fillRect(cx - crossThick / 2, cy - crossSize, crossThick, crossSize * 2);
  }

  ctx.fillStyle = theme.label;
  ctx.font = "10px sans-serif";
  ctx.fillText(`${crossStyle} - size ${crossSize} - thick ${crossThick}`, 8, h - 8);
}

/**
 * Target preview: simulate apparent target size and spawn ring radius
 * using the current FOV, target size, distance and spawnRangeDeg.
 */
function renderTargetPreview() {
  const canvas = document.getElementById("target-preview");
  if (!canvas) return;
  const { ctx, w, h } = setupHiDpi(canvas);
  ctx.clearRect(0, 0, w, h);

  const theme = previewTheme();
  const g = ctx.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, Math.max(w, h) / 1.4);
  g.addColorStop(0, theme.center);
  g.addColorStop(1, theme.edge);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  const cx = w / 2;
  const cy = h / 2;
  const fov = state.fov;
  const tanHalfFov = Math.tan((fov / 2) * Math.PI / 180);

  // spawn ring in pixels
  const tanSpawn = Math.tan(state.spawnRangeDeg * Math.PI / 180);
  let ringPx = (tanSpawn / tanHalfFov) * (w / 2);
  ringPx = Math.min(ringPx, Math.min(w, h) / 2 - 6);

  // apparent target radius in pixels
  const angularRadiusRad = Math.atan(state.targetSize / state.targetDistance);
  let targetPx = (Math.tan(angularRadiusRad) / tanHalfFov) * (w / 2);
  targetPx = Math.max(2, Math.min(targetPx, Math.min(w, h) / 2 - 4));

  // ring (dashed circle for spawn area)
  ctx.strokeStyle = "rgba(54, 209, 255, 0.8)";
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 4]);
  ctx.beginPath();
  ctx.arc(cx, cy, ringPx, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  // dots: scatter sample spawn positions
  ctx.fillStyle = "rgba(54, 209, 255, 0.45)";
  for (let i = 0; i < 14; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * ringPx;
    ctx.beginPath();
    ctx.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 2, 0, Math.PI * 2);
    ctx.fill();
  }

  // central target sample (uses selected target color)
  const base = hexToRgb(state.targetColor);
  const highlight = scaleRgb(base, 1.35);
  const shadow = scaleRgb(base, 0.55);
  const grad = ctx.createRadialGradient(cx - targetPx * 0.3, cy - targetPx * 0.3, 1, cx, cy, targetPx);
  grad.addColorStop(0, rgbStr(highlight));
  grad.addColorStop(1, rgbStr(shadow));
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, targetPx, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.18)";
  ctx.lineWidth = 1;
  ctx.stroke();

  // crosshair overlay (small) so the user sees scale
  const cs = state.crossSize;
  const ct = state.crossThick;
  ctx.fillStyle = state.crossColor;
  if (state.crossStyle === "dot" || state.crossStyle === "both") {
    ctx.beginPath();
    ctx.arc(cx, cy, ct, 0, Math.PI * 2);
    ctx.fill();
  }
  if (state.crossStyle === "cross" || state.crossStyle === "both") {
    ctx.fillRect(cx - cs, cy - ct / 2, cs * 2, ct);
    ctx.fillRect(cx - ct / 2, cy - cs, ct, cs * 2);
  }

  // labels
  ctx.fillStyle = theme.label;
  ctx.font = "10px sans-serif";
  ctx.fillText(`FOV ${fov}deg - target ${state.targetSize}u @ ${state.targetDistance}u`, 8, 16);
  ctx.fillText(`spawn ring ${state.spawnRangeDeg}deg`, 8, h - 8);
}

export function renderChart(canvas, samples) {
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  ctx.fillStyle = "#161a24";
  ctx.fillRect(0, 0, w, h);

  if (!samples.length) return;
  const max = Math.max(...samples, 1);

  ctx.strokeStyle = "#2a3245";
  ctx.lineWidth = 1;
  for (let i = 1; i < 4; i++) {
    const y = (h / 4) * i;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }

  ctx.strokeStyle = "#00ff88";
  ctx.lineWidth = 2;
  ctx.beginPath();
  samples.forEach((v, i) => {
    const x = (i / Math.max(1, samples.length - 1)) * w;
    const y = h - (v / max) * (h - 10) - 4;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  ctx.fillStyle = "#8a93a6";
  ctx.font = "10px sans-serif";
  ctx.fillText("Score over time", 8, 14);
  ctx.fillText("max " + Math.round(max), w - 60, 14);
}
