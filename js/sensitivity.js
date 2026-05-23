// Sensitivity module
// Valorant yaw = 0.07 deg per (mouse count * sens)
// CS2     yaw = 0.022 deg per (mouse count * sens)
// Conversion factor: CS2 = Valorant * 3.18182

export const GAME_YAW = {
  valorant: 0.07,
  cs2: 0.022,
};

export const VAL_TO_CS2 = 3.18182;

/**
 * cm/360 = 360 / (DPI * sens * yaw) * 2.54
 */
export function getCm360(dpi, sens, game) {
  const yaw = GAME_YAW[game];
  if (!yaw || !dpi || !sens) return 0;
  return (360 / (dpi * sens * yaw)) * 2.54;
}

export function getEdpi(dpi, sens) {
  return Math.round(dpi * sens);
}

export function convertSensitivity(sens, fromGame, toGame) {
  if (fromGame === toGame) return sens;
  if (fromGame === "valorant" && toGame === "cs2") return sens * VAL_TO_CS2;
  if (fromGame === "cs2" && toGame === "valorant") return sens / VAL_TO_CS2;
  return sens;
}

/**
 * Convert a raw mouse delta (pixels reported by Pointer Lock) into
 * camera rotation in DEGREES, using the selected game's yaw.
 *
 * formula: deg = mouseDelta * sens * yaw
 *
 * Note: browsers expose pointerlock movementX/Y as raw mouse counts
 * (the same counts the game would read). DPI is NOT applied here —
 * DPI only affects cm/360 display, since the OS already factors DPI
 * into how many counts a physical cm produces.
 */
export function deltaToDegrees(delta, sens, game) {
  return delta * sens * GAME_YAW[game];
}
