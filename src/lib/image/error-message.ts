import type { ImageProcessingErrorCode } from "./process";

/**
 * Clés i18n des erreurs de traitement d'image.
 *
 * Les codes de `ImageProcessingErrorCode` décrivent des pannes techniques
 * (canvas absent, encodage WebP refusé, lot vide…). Ils ne doivent jamais
 * atteindre l'écran tels quels : chaque code est projeté sur une phrase
 * utilisateur, traduite dans `editor.imageErrors.<code>`.
 *
 * Les clés sont complètes (`editor.*`) : les composants les résolvent avec le
 * traducteur racine, pas avec `useTranslations("editor")`.
 */
const IMAGE_ERROR_KEYS = {
  NOT_IMAGE: "editor.imageErrors.NOT_IMAGE",
  UNSUPPORTED_TYPE: "editor.imageErrors.UNSUPPORTED_TYPE",
  INVALID_IMAGE: "editor.imageErrors.INVALID_IMAGE",
  INVALID_TARGET: "editor.imageErrors.INVALID_TARGET",
  IMAGE_TOO_LARGE: "editor.imageErrors.IMAGE_TOO_LARGE",
  SPRITE_TOO_LARGE: "editor.imageErrors.SPRITE_TOO_LARGE",
  TOO_MANY_FRAMES: "editor.imageErrors.TOO_MANY_FRAMES",
  EMPTY_BATCH: "editor.imageErrors.EMPTY_BATCH",
  CANVAS_UNAVAILABLE: "editor.imageErrors.CANVAS_UNAVAILABLE",
  ENCODE_FAILED: "editor.imageErrors.ENCODE_FAILED",
} as const satisfies Record<ImageProcessingErrorCode, string>;

/** Repli pour un code inconnu (données anciennes ou sérialisées). */
export const IMAGE_ERROR_FALLBACK_KEY = "editor.imageErrors.generic";

export type ImageErrorKey =
  | (typeof IMAGE_ERROR_KEYS)[ImageProcessingErrorCode]
  | typeof IMAGE_ERROR_FALLBACK_KEY;

/** Clé i18n à afficher pour une erreur de traitement d'image. */
export function imageErrorKey(code: ImageProcessingErrorCode): ImageErrorKey {
  if (Object.prototype.hasOwnProperty.call(IMAGE_ERROR_KEYS, code)) {
    return IMAGE_ERROR_KEYS[code];
  }
  return IMAGE_ERROR_FALLBACK_KEY;
}
