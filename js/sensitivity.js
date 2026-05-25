// Sensitivity module — pure math, no arbitrary multipliers.
// yaw values are degrees rotated per mouse count at sensitivity = 1.

export const GAME_YAW = {
  valorant: 0.07,
  cs2: 0.022,
};

export function getDegreesPerCount(game, sensitivity) {
  const yaw = GAME_YAW[game] || GAME_YAW.valorant;
  return sensitivity * yaw;
}

export function getCm360(game, sensitivity, dpi) {
  if (!dpi || !sensitivity) return 0;
  const dpc = getDegreesPerCount(game, sensitivity);
  if (!dpc) return 0;
  return (360 / dpc) / dpi * 2.54;
}

export function getEdpi(dpi, sens) {
  return Math.round(dpi * sens);
}

// Auxiliary converter: keeps the same cm/360 across games.
// targetSens = sourceSens * sourceYaw / targetYaw
export function convertSensitivity(sens, fromGame, toGame) {
  const fromYaw = GAME_YAW[fromGame];
  const toYaw = GAME_YAW[toGame];
  if (!fromYaw || !toYaw || fromYaw === toYaw) return sens;
  return sens * fromYaw / toYaw;
}

// Pointer Lock delta -> camera rotation in DEGREES.
export function deltaToDegrees(delta, sens, game) {
  return delta * getDegreesPerCount(game, sens);
}
