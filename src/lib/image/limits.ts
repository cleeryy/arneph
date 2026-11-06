/**
 * Budget mémoire d'une sprite sheet, en pixels. Au-delà, le navigateur décode
 * des centaines de Mo (16k×14k ≈ 900 Mo) et peut fermer l'onglet.
 */
export const MAX_SPRITE_PIXELS = 16_000_000;

/**
 * Budget mémoire d'une image unitaire, en pixels (40 Mpx ≈ 160 Mo en RGBA
 * décodé). Au-delà, `canvas.toBlob` peut renvoyer `null` ou faire tomber
 * l'onglet, notamment sur Safari. Une planche `long-y` `1200×30000` (36 Mpx
 * mais 30000 px de haut) est rejetée par la limite de dimension canvas.
 */
export const MAX_IMAGE_PIXELS = 40_000_000;

/**
 * Taille maximale d'un fichier accepté par l'éditeur avant tout décodage.
 * Évite de lire en mémoire un fichier de plusieurs dizaines de Mo sur le
 * main thread. La limite Storage du bucket est de 50 MiB.
 */
export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
