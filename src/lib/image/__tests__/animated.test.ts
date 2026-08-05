import { describe, expect, test } from "vitest";

import { isAnimatedImage } from "@/lib/image/animated";

// ──────────────────────────────────────────────────────────────────────────
// Fixtures binaires construites en mémoire (aucun fichier réel).
// ──────────────────────────────────────────────────────────────────────────

// GIF89a + Logical Screen Descriptor (7 octets) + 2 image descriptors (0x2C)
// → GIF animé (≥2 descripteurs d'image)
const gifAnimatedBytes = new Uint8Array([
  0x47, 0x49, 0x46, 0x38, 0x39, 0x61, // GIF89a
  0x01, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, // Logical Screen Descriptor
  0x2c, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, // Image Descriptor 1
  0x2c, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, // Image Descriptor 2
]);

// GIF89a + Logical Screen Descriptor + 1 image descriptor
// → GIF statique
const gifStaticBytes = new Uint8Array([
  0x47, 0x49, 0x46, 0x38, 0x39, 0x61, // GIF89a
  0x01, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, // Logical Screen Descriptor
  0x2c, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, // Image Descriptor
]);

// RIFF + taille + WEBP + chunk ANIM → WebP animé
const webpAnimatedBytes = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, // RIFF
  0x14, 0x00, 0x00, 0x00, // taille = 20 (little-endian)
  0x57, 0x45, 0x42, 0x50, // WEBP
  0x08, 0x00, 0x00, 0x00, // chunk size = 8 (inclut ce champ)
  0x41, 0x4e, 0x49, 0x4d, // ANIM
  0x01, 0x00, 0x01, 0x00, // données ANIM (loop count=1, flags=0)
]);

// RIFF + taille + WEBP + chunk VP8  → WebP statique (pas de ANIM)
const webpStaticBytes = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, // RIFF
  0x14, 0x00, 0x00, 0x00, // taille = 20
  0x57, 0x45, 0x42, 0x50, // WEBP
  0x08, 0x00, 0x00, 0x00, // chunk size = 8
  0x56, 0x50, 0x38, 0x20, // VP8  (WebP statique)
  0x00, 0x00, 0x00, 0x00, // données VP8
]);

// Signature PNG + IHDR + IEND → PNG statique
const pngBytes = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // signature PNG
  0x00, 0x00, 0x00, 0x0d, // IHDR chunk size = 13
  0x49, 0x48, 0x44, 0x52, // IHDR
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x02, 0x00, 0x00, 0x00, // IHDR data
  0x90, 0x77, 0x53, 0xde, // IHDR CRC
  0x00, 0x00, 0x00, 0x00, // IEND chunk size = 0
  0x49, 0x45, 0x4e, 0x44, // IEND
  0xae, 0x42, 0x60, 0x82, // IEND CRC
]);

// Blob invalide (trop petit, moins de 12 octets)
const tinyBlob = new Blob([new Uint8Array([0x47, 0x49, 0x46])]);

// ──────────────────────────────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────────────────────────────

describe("isAnimatedImage", () => {
  test("GIF avec 2 image descriptors → true", async () => {
    const file = new File([gifAnimatedBytes], "animated.gif", {
      type: "image/gif",
    });
    await expect(isAnimatedImage(file)).resolves.toBe(true);
  });

  test("GIF avec 1 image descriptor → false", async () => {
    const file = new File([gifStaticBytes], "static.gif", {
      type: "image/gif",
    });
    await expect(isAnimatedImage(file)).resolves.toBe(false);
  });

  test("WebP avec chunk ANIM → true", async () => {
    const file = new File([webpAnimatedBytes], "animated.webp", {
      type: "image/webp",
    });
    await expect(isAnimatedImage(file)).resolves.toBe(true);
  });

  test("WebP sans chunk ANIM (VP8) → false", async () => {
    const file = new File([webpStaticBytes], "static.webp", {
      type: "image/webp",
    });
    await expect(isAnimatedImage(file)).resolves.toBe(false);
  });

  test("PNG → false", async () => {
    const file = new File([pngBytes], "image.png", { type: "image/png" });
    await expect(isAnimatedImage(file)).resolves.toBe(false);
  });

  test("Blob invalide (trop petit) → false sans erreur", async () => {
    await expect(isAnimatedImage(tinyBlob)).resolves.toBe(false);
  });
});