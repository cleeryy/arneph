/**
 * Budget mémoire d'une sprite sheet, en pixels. Au-delà, le navigateur décode
 * des centaines de Mo (16k×14k ≈ 900 Mo) et peut fermer l'onglet.
 */
export const MAX_SPRITE_PIXELS = 16_000_000;
