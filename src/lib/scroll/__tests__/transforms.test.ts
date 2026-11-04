import { describe, expect, test } from "vitest";

import {
  clamp01,
  frameIndexFromProgress,
  normalizeProgress,
  panDistance,
  panXFromProgress,
  spritePositionFromFrame,
} from "@/lib/scroll/transforms";

describe("panXFromProgress(progress, imageWidth, viewportWidth)", () => {
  test("progress 0 → 0", () => {
    expect(panXFromProgress(0, 2000, 400)).toBe(0);
  });

  test("progress 1 → imageWidth - viewportWidth", () => {
    expect(panXFromProgress(1, 2000, 400)).toBe(1600);
  });

  test("progress 0.5 → moitié linéaire de la distance de pan (0.5×1600=800)", () => {
    expect(panXFromProgress(0.5, 2000, 400)).toBe(800);
  });

  test("progress 0.25 → quart linéaire", () => {
    expect(panXFromProgress(0.25, 2000, 400)).toBe(400);
  });

  test("valeurs intermédiaires strictement linéaires (1px par 1/1600e)", () => {
    expect(panXFromProgress(0.125, 2000, 400)).toBe(200);
    expect(panXFromProgress(0.75, 2000, 400)).toBe(1200);
  });

  test("image plus étroite que le viewport → toujours 0", () => {
    expect(panXFromProgress(0, 800, 1000)).toBe(0);
    expect(panXFromProgress(0.5, 800, 1000)).toBe(0);
    expect(panXFromProgress(1, 800, 1000)).toBe(0);
  });

  test("image exactement de la largeur du viewport → toujours 0", () => {
    expect(panXFromProgress(0, 1000, 1000)).toBe(0);
    expect(panXFromProgress(1, 1000, 1000)).toBe(0);
  });

  test("progress hors bornes → clampé à [0, 1]", () => {
    expect(panXFromProgress(-0.5, 2000, 400)).toBe(0);
    expect(panXFromProgress(1.5, 2000, 400)).toBe(1600);
  });
});

describe("frameIndexFromProgress(progress, frameCount)", () => {
  test("progress 0 → 0", () => {
    expect(frameIndexFromProgress(0, 10)).toBe(0);
  });

  test("progress 1 → frameCount - 1", () => {
    expect(frameIndexFromProgress(1, 10)).toBe(9);
  });

  test("progress 0.5 sur 10 frames → Math.round(4.5)=5 (arrondi JS, pas demi-pair)", () => {
    expect(frameIndexFromProgress(0.5, 10)).toBe(5);
  });

  test("frameCount 1 → toujours 0", () => {
    expect(frameIndexFromProgress(0, 1)).toBe(0);
    expect(frameIndexFromProgress(0.5, 1)).toBe(0);
    expect(frameIndexFromProgress(1, 1)).toBe(0);
  });

  test("valeurs intermédiaires arrondies (0.25×4=1, 0.75×4=3)", () => {
    expect(frameIndexFromProgress(0.25, 5)).toBe(1);
    expect(frameIndexFromProgress(0.75, 5)).toBe(3);
  });

  test("progress hors bornes → clampé à [0, 1]", () => {
    expect(frameIndexFromProgress(-1, 10)).toBe(0);
    expect(frameIndexFromProgress(2, 10)).toBe(9);
  });
});

describe("spritePositionFromFrame(frameIndex, columns, frameWidth, frameHeight)", () => {
  test("frame 0 → { x: 0, y: 0 }", () => {
    expect(spritePositionFromFrame(0, 3, 100, 50)).toEqual({ x: 0, y: 0 });
  });

  test("frame dans la première colonne → première rangée", () => {
    expect(spritePositionFromFrame(1, 3, 100, 50)).toEqual({ x: 100, y: 0 });
    expect(spritePositionFromFrame(2, 3, 100, 50)).toEqual({ x: 200, y: 0 });
  });

  test("frame au-delà d'une colonne → wrap sur la rangée suivante", () => {
    expect(spritePositionFromFrame(3, 3, 100, 50)).toEqual({ x: 0, y: 50 });
    expect(spritePositionFromFrame(4, 3, 100, 50)).toEqual({ x: 100, y: 50 });
    expect(spritePositionFromFrame(5, 3, 100, 50)).toEqual({ x: 200, y: 50 });
  });

  test("frame sur plusieurs rangées (grille 3×2 : frame 7 → rangée 2, colonne 1)", () => {
    expect(spritePositionFromFrame(7, 3, 100, 50)).toEqual({ x: 100, y: 100 });
  });

  test("columns 1 → x toujours 0, y = frameIndex * frameHeight", () => {
    expect(spritePositionFromFrame(0, 1, 100, 50)).toEqual({ x: 0, y: 0 });
    expect(spritePositionFromFrame(2, 1, 100, 50)).toEqual({ x: 0, y: 100 });
  });

  test("frameIndex négatif → clampé à 0", () => {
    expect(spritePositionFromFrame(-3, 3, 100, 50)).toEqual({ x: 0, y: 0 });
  });
});

describe("clamp01(progress)", () => {
  test("bornes inférieures et supérieures", () => {
    expect(clamp01(0)).toBe(0);
    expect(clamp01(1)).toBe(1);
  });

  test("valeurs internes inchangées", () => {
    expect(clamp01(0.5)).toBe(0.5);
  });

  test("hors bornes → borné", () => {
    expect(clamp01(-0.5)).toBe(0);
    expect(clamp01(1.5)).toBe(1);
  });
});

describe("normalizeProgress(value, min, max)", () => {
  test("bords de l'intervalle", () => {
    expect(normalizeProgress(0, 0, 100)).toBe(0);
    expect(normalizeProgress(100, 0, 100)).toBe(1);
  });

  test("valeur intermédiaire linéaire", () => {
    expect(normalizeProgress(50, 0, 100)).toBe(0.5);
    expect(normalizeProgress(25, 0, 100)).toBe(0.25);
  });

  test("hors bornes → clampé à [0, 1]", () => {
    expect(normalizeProgress(-50, 0, 100)).toBe(0);
    expect(normalizeProgress(150, 0, 100)).toBe(1);
  });

  test("intervalle dégénéré (min === max) → 0, pas de division par zéro", () => {
    expect(normalizeProgress(0, 0, 0)).toBe(0);
    expect(normalizeProgress(5, 5, 5)).toBe(0);
  });
});

describe("panDistance(imageWidth, viewportWidth, speed)", () => {
  test("distance requise = panPx ÷ vitesse px·vh⁻¹, bornée à [100, 600] vh", () => {
    expect(panDistance(2000, 400, 8)).toBe(200);
    // 16 vh serait plus court que le contenu sticky (100 vh) : plancher.
    expect(panDistance(2000, 400, 100)).toBe(100);
    // Image très large : plafond pour éviter une section interminable.
    expect(panDistance(10000, 400, 5)).toBe(600);
  });

  test("image pas plus large que le viewport → 0 vh", () => {
    expect(panDistance(800, 800, 100)).toBe(0);
    expect(panDistance(800, 1000, 100)).toBe(0);
  });

  test("vitesse invalide (≤ 0) → 0 vh (pas d'Infinity)", () => {
    expect(panDistance(2000, 400, 0)).toBe(0);
    expect(panDistance(2000, 400, -10)).toBe(0);
  });
});
