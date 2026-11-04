import { describe, expect, test } from "vitest";

import type { SectionWithImages } from "@/lib/db/queries";
import {
  ANIMATION_VH_PER_FRAME,
  DEFAULT_PAN_DISTANCE_VH,
  MAX_ANIMATION_VH,
  MAX_PAN_DISTANCE_VH,
  MIN_ANIMATION_VH,
  MIN_PAN_DISTANCE_VH,
  buildReaderSteps,
  globalProgress,
  resolveAnimationLengthVh,
  resolvePanDirection,
  resolvePanLengthVh,
} from "@/lib/reader/steps";
import type { SectionConfig, SectionType } from "@/types/webtoon";

function section(
  position: number,
  type: SectionType,
  config: SectionConfig,
  id = `s${position}`,
): SectionWithImages {
  return {
    id,
    webtoonId: "w1",
    position,
    type,
    config,
    audioPath: undefined,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    images: [],
  };
}

const image = (position = 1) =>
  section(position, "image", {
    type: "image",
    imagePath: "a.webp",
    width: 800,
    height: 1200,
  });

const panX = (config: Partial<Extract<SectionConfig, { type: "pan-x" }>> = {}) =>
  section(2, "pan-x", {
    type: "pan-x",
    imagePath: "b.webp",
    width: 2400,
    height: 800,
    ...config,
  });

const animation = (
  config: Partial<Extract<SectionConfig, { type: "animation" }>> = {},
) =>
  section(3, "animation", {
    type: "animation",
    spritePath: "c.webp",
    frameWidth: 100,
    frameHeight: 100,
    columns: 4,
    rows: 3,
    frameCount: 12,
    ...config,
  });

describe("resolvePanLengthVh", () => {
  test("défaut 150 vh quand absent ou invalide", () => {
    expect(resolvePanLengthVh(panX().config as never)).toBe(DEFAULT_PAN_DISTANCE_VH);
    expect(resolvePanLengthVh(panX({ panDistance: Number.NaN }).config as never)).toBe(
      DEFAULT_PAN_DISTANCE_VH,
    );
  });

  test("borne à [100, 400] vh", () => {
    expect(resolvePanLengthVh(panX({ panDistance: 50 }).config as never)).toBe(
      MIN_PAN_DISTANCE_VH,
    );
    expect(resolvePanLengthVh(panX({ panDistance: 900 }).config as never)).toBe(
      MAX_PAN_DISTANCE_VH,
    );
    expect(resolvePanLengthVh(panX({ panDistance: 220 }).config as never)).toBe(220);
  });
});

describe("resolvePanDirection", () => {
  test("ltr par défaut, rtl respecté", () => {
    expect(resolvePanDirection(panX().config as never)).toBe("ltr");
    expect(resolvePanDirection(panX({ direction: "rtl" }).config as never)).toBe("rtl");
  });
});

describe("resolveAnimationLengthVh", () => {
  test("20 vh par frame par défaut", () => {
    expect(resolveAnimationLengthVh(animation({ frameCount: 6 }).config as never)).toBe(
      6 * ANIMATION_VH_PER_FRAME,
    );
  });

  test("borne à [100, 600] vh", () => {
    expect(resolveAnimationLengthVh(animation({ frameCount: 1 }).config as never)).toBe(
      MIN_ANIMATION_VH,
    );
    expect(resolveAnimationLengthVh(animation({ frameCount: 80 }).config as never)).toBe(
      MAX_ANIMATION_VH,
    );
  });

  test("scrollHeight explicite prioritaire, borné", () => {
    expect(
      resolveAnimationLengthVh(animation({ scrollHeight: 300 }).config as never),
    ).toBe(300);
    expect(
      resolveAnimationLengthVh(animation({ scrollHeight: 20 }).config as never),
    ).toBe(MIN_ANIMATION_VH);
  });
});

describe("buildReaderSteps", () => {
  test("trie par position et mappe chaque type", () => {
    const steps = buildReaderSteps([
      section(3, "long-y", { type: "long-y", imagePath: "c.webp", width: 800, height: 4000 }),
      image(1),
      panX(),
      animation(),
    ]);

    expect(steps.map((s) => s.kind)).toEqual(["image", "pan-x", "long-y", "animation"]);
    expect(steps[0]).toMatchObject({ kind: "image", lengthVh: 100 });
    expect(steps[1]).toMatchObject({ kind: "pan-x", lengthVh: 150, direction: "ltr" });
    expect(steps[3]).toMatchObject({ kind: "animation", lengthVh: 12 * 20, frameCount: 12 });
  });

  test("liste vide → aucune étape", () => {
    expect(buildReaderSteps([])).toEqual([]);
  });
});

describe("globalProgress", () => {
  const steps = buildReaderSteps([image(1), panX(), animation()]);

  test("début et fin", () => {
    expect(globalProgress(steps, 0, 0)).toBe(0);
    expect(globalProgress(steps, 2, 1)).toBe(1);
  });

  test("inclut la progression interne d'une étape épinglée", () => {
    // pan-x = 150 vh = 1.5 écran ; total = 1 + 1.5 + 2.4 = 4.9
    expect(globalProgress(steps, 1, 0.5)).toBeCloseTo((1 + 0.75) / 4.9, 3);
  });

  test("une image longue pèse sa hauteur réelle et compte sa progression", () => {
    const withLong = buildReaderSteps([
      section(1, "long-y", { type: "long-y", imagePath: "c.webp", width: 800, height: 4000 }),
      image(2),
    ]);
    // 4000 px pour un écran de 800 → poids 5 ; total 6.
    expect(globalProgress(withLong, 0, 0.5, 800)).toBeCloseTo(2.5 / 6, 3);
    expect(globalProgress(withLong, 1, 0, 800)).toBeCloseTo(5 / 6, 3);
  });

  test("borne les index et la progression", () => {
    expect(globalProgress(steps, -5, 2)).toBe(0);
    expect(globalProgress(steps, 99, 2)).toBe(1);
    expect(globalProgress([], 0, 0)).toBe(0);
  });
});
