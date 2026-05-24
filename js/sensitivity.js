// Sensitivity module
// Valorant yaw = 0.07 deg per (mouse count * sens)
// CS2     yaw = 0.022 deg per (mouse count * sens)

export const GAME_YAW = {
  valorant: 0.07,
  cs2: 0.022,
};

export const VAL_TO_CS2 = 3.18182;

// Browser feels "heavier" than native game due to RAF cap (60-144Hz)
// vs native polling (1000Hz+). Aiming.pro applies ~1.22x boost to compensate.
export const BROWSER_FEEL_MULT = 1.22173;

/** Returns the yaw value for a game. For "custom", uses customYaw param. */
export function getGameYaw(game, customYaw) {
  if (game === "custom") return Number(customYaw) || 0.022;
  return GAME_YAW[game] || GAME_YAW.valorant;
}

/**
 * cm/360 = 360 / (DPI * sens * yaw * mult) * 2.54
 * Includes browser feel multiplier so displayed cm/360 reflects actual rotation.
 */
export function getCm360(dpi, sens, game, mult = BROWSER_FEEL_MULT, customYaw) {
  const yaw = getGameYaw(game, customYaw);
  if (!yaw || !dpi || !sens) return 0;
  return (360 / (dpi * sens * yaw * mult)) * 2.54;
}

export function getEdpi(dpi, sens) {
  return Math.round(dpi * sens);
}

export function convertSensitivity(sens, fromGame, toGame, fromCustomYaw, toCustomYaw) {
  const fromYaw = getGameYaw(fromGame, fromCustomYaw);
  const toYaw = getGameYaw(toGame, toCustomYaw);
  if (fromYaw === toYaw) return sens;
  return sens * fromYaw / toYaw;
}

/**
 * Convert a raw mouse delta (pixels reported by Pointer Lock) into
 * camera rotation in DEGREES, using the selected game's yaw.
 *
 * formula: deg = mouseDelta * sens * yaw * browserFeelMult
 */
export function deltaToDegrees(delta, sens, game, mult = BROWSER_FEEL_MULT, customYaw) {
  return delta * sens * getGameYaw(game, customYaw) * mult;
}
