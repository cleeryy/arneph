/**
 * Fonctions pures de transform du moteur scroll — source unique partagée
 * lecteur ET éditeur. Aucune dépendance DOM/React : testables sans jsdom.
 */

/** Clampe une valeur dans [0, 1]. NaN est propagé. */
export function clamp01(progress: number): number {
  return Math.min(1, Math.max(0, progress));
}

export function normalizeProgress(value: number, min: number, max: number): number {
  if (max <= min) return 0;
  return clamp01((value - min) / (max - min));
}

export function panXFromProgress(
  progress: number,
  imageWidth: number,
  viewportWidth: number,
): number {
  const maxPan = Math.max(0, imageWidth - viewportWidth);
  return clamp01(progress) * maxPan;
}

export function frameIndexFromProgress(progress: number, frameCount: number): number {
  const count = Math.max(1, Math.floor(frameCount));
  return Math.round(clamp01(progress) * (count - 1));
}

/**
 * Coordonnées { x, y } (px) d'une frame dans la grille 2D de la sprite sheet.
 * frameHeight est requis : la rangée y = rangée × frameHeight.
 */
export function spritePositionFromFrame(
  frameIndex: number,
  columns: number,
  frameWidth: number,
  frameHeight: number,
): { x: number; y: number } {
  const index = Math.max(0, Math.floor(frameIndex));
  const cols = Math.max(1, Math.floor(columns));
  return {
    x: (index % cols) * frameWidth,
    y: Math.floor(index / cols) * frameHeight,
  };
}

/**
 * Distance de scroll (vh) pour parcourir toute la distance de pan au taux
 * `speed` (px de pan par vh). 0 si rien à panner ou vitesse invalide.
 */
export function panDistance(
  imageWidth: number,
  viewportWidth: number,
  speed: number,
): number {
  const panPx = Math.max(0, imageWidth - viewportWidth);
  if (panPx === 0 || speed <= 0) return 0;
  return panPx / speed;
}
