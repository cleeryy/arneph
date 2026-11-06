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

/**
 * Hauteur source d'une tuile `long-y`, en pixels. Les planches plus hautes que
 * `MAX_CANVAS_DIMENSION` sont découpées en tranches de cette taille pour
 * rester dans les limites de canvas du navigateur.
 */
export const LONG_Y_TILE_HEIGHT = 4096;

/** Nombre maximal de tuiles acceptées pour une section `long-y`. */
export const MAX_LONG_Y_TILES = 32;

/**
 * Budget mémoire d'une planche `long-y` avant découpage, en pixels
 * (60 Mpx ≈ 240 Mo en RGBA décodé). Au-delà, le décodage navigateur devient
 * risqué même découpé : la section doit être ré-uploadée en tuiles.
 */
export const MAX_LONG_Y_PIXELS = 60_000_000;
