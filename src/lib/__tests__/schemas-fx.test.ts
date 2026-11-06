import { describe, expect, test } from "vitest";

import {
  animationSectionConfigSchema,
  imageSectionConfigSchema,
  longYSectionConfigSchema,
  sectionConfigSchema,
  sectionSchema,
} from "@/lib/schemas";

describe("fxPath / fxConfig optional fields — imageSectionConfigSchema", () => {
  test("valid config WITH fxPath and fxConfig passes", () => {
    const result = imageSectionConfigSchema.safeParse({
      type: "image",
      imagePath: "frame1.webp",
      width: 800,
      height: 1200,
      fxPath: "overlay.gif",
      fxConfig: {
        position: { x: "center", y: "bottom" },
        size: { mode: "percent", width: 50, height: 30 },
        opacity: 0.8,
      },
    });
    expect(result.success).toBe(true);
  });

  test("valid config WITHOUT fxPath and fxConfig passes (backward compat)", () => {
    const result = imageSectionConfigSchema.safeParse({
      type: "image",
      imagePath: "frame1.webp",
      width: 800,
      height: 1200,
    });
    expect(result.success).toBe(true);
  });

  test("opacity 1.5 fails validation", () => {
    const result = imageSectionConfigSchema.safeParse({
      type: "image",
      imagePath: "frame1.webp",
      width: 800,
      height: 1200,
      fxPath: "overlay.gif",
      fxConfig: {
        position: { x: "left", y: "top" },
        size: { mode: "px", width: 100 },
        opacity: 1.5,
      },
    });
    expect(result.success).toBe(false);
  });

  test("invalid position.x \"diagonal\" fails validation", () => {
    const result = imageSectionConfigSchema.safeParse({
      type: "image",
      imagePath: "frame1.webp",
      width: 800,
      height: 1200,
      fxPath: "overlay.gif",
      fxConfig: {
        position: { x: "diagonal" as unknown as "left", y: "top" },
        size: { mode: "px", width: 100 },
        opacity: 0.5,
      },
    });
    expect(result.success).toBe(false);
  });
});

describe("fxPath / fxConfig optional fields — longYSectionConfigSchema", () => {
  test("valid config WITH fxPath and fxConfig passes", () => {
    const result = longYSectionConfigSchema.safeParse({
      type: "long-y",
      imagePath: "strip.webp",
      width: 600,
      height: 3000,
      fxPath: "overlay.gif",
      fxConfig: {
        position: { x: "right", y: "center" },
        size: { mode: "px", width: 200, height: 400 },
        opacity: 0.6,
      },
    });
    expect(result.success).toBe(true);
  });

  test("valid config WITHOUT fxPath and fxConfig passes (backward compat)", () => {
    const result = longYSectionConfigSchema.safeParse({
      type: "long-y",
      imagePath: "strip.webp",
      width: 600,
      height: 3000,
    });
    expect(result.success).toBe(true);
  });
});

describe("animationSectionConfigSchema — framePaths bounds (DATA-13)", () => {
  test("accepts up to 500 frame paths", () => {
    const result = animationSectionConfigSchema.safeParse({
      type: "animation",
      spritePath: "sprite.webp",
      framePaths: Array.from({ length: 500 }, (_, index) => `frames/${index}.webp`),
      frameWidth: 100,
      frameHeight: 100,
      columns: 20,
      rows: 25,
      frameCount: 500,
    });

    expect(result.success).toBe(true);
  });

  test("rejects more than 500 frame paths", () => {
    const result = animationSectionConfigSchema.safeParse({
      type: "animation",
      spritePath: "sprite.webp",
      framePaths: Array.from({ length: 501 }, (_, index) => `frames/${index}.webp`),
      frameWidth: 100,
      frameHeight: 100,
      columns: 20,
      rows: 25,
      frameCount: 500,
    });

    expect(result.success).toBe(false);
  });
});

describe("longYSectionConfigSchema — tiles / tileHeight (Phase 2C-1)", () => {
  const TILES = ["tiles-1/0.webp", "tiles-1/1.webp", "tiles-1/2.webp"];

  function section(config: Record<string, unknown>) {
    return {
      id: "s1",
      webtoonId: "w1",
      position: 0,
      type: "long-y",
      config,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
  }

  test("accepte tiles + tileHeight cohérents", () => {
    const result = sectionSchema.safeParse(
      section({
        type: "long-y",
        imagePath: TILES[0],
        width: 600,
        height: 2500,
        tiles: TILES,
        tileHeight: 1000,
      }),
    );

    expect(result.success).toBe(true);
  });

  test("accepte une section sans tuiles (rétrocompatibilité)", () => {
    const result = sectionSchema.safeParse(
      section({
        type: "long-y",
        imagePath: "strip.webp",
        width: 600,
        height: 3000,
      }),
    );

    expect(result.success).toBe(true);
  });

  test("refuse tiles sans tileHeight", () => {
    const result = sectionSchema.safeParse(
      section({
        type: "long-y",
        imagePath: TILES[0],
        width: 600,
        height: 2500,
        tiles: TILES,
      }),
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.includes("tileHeight"))).toBe(true);
    }
  });

  test("refuse tileHeight sans tiles", () => {
    const result = sectionSchema.safeParse(
      section({
        type: "long-y",
        imagePath: "strip.webp",
        width: 600,
        height: 3000,
        tileHeight: 1000,
      }),
    );

    expect(result.success).toBe(false);
  });

  test("refuse des tuiles dupliquées", () => {
    const result = sectionSchema.safeParse(
      section({
        type: "long-y",
        imagePath: TILES[0],
        width: 600,
        height: 2500,
        tiles: [TILES[0], TILES[0], TILES[1]],
        tileHeight: 1000,
      }),
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.includes("tiles"))).toBe(true);
    }
  });

  test("refuse une hauteur incohérente avec le nombre de tuiles", () => {
    const tooTall = sectionSchema.safeParse(
      section({
        type: "long-y",
        imagePath: TILES[0],
        width: 600,
        height: 5000,
        tiles: TILES,
        tileHeight: 1000,
      }),
    );
    const tooShort = sectionSchema.safeParse(
      section({
        type: "long-y",
        imagePath: TILES[0],
        width: 600,
        height: 1500,
        tiles: TILES,
        tileHeight: 1000,
      }),
    );

    expect(tooTall.success).toBe(false);
    expect(tooShort.success).toBe(false);
  });

  test("tolère 1 px d'arrondi aux bornes de hauteur", () => {
    const upperEdge = sectionSchema.safeParse(
      section({
        type: "long-y",
        imagePath: TILES[0],
        width: 600,
        height: 3001,
        tiles: TILES,
        tileHeight: 1000,
      }),
    );
    const lowerEdge = sectionSchema.safeParse(
      section({
        type: "long-y",
        imagePath: TILES[0],
        width: 600,
        height: 1999,
        tiles: TILES,
        tileHeight: 1000,
      }),
    );

    expect(upperEdge.success).toBe(true);
    expect(lowerEdge.success).toBe(true);
  });

  test("borne tiles entre 2 et 32 entrées", () => {
    const single = sectionSchema.safeParse(
      section({
        type: "long-y",
        imagePath: "tiles-1/0.webp",
        width: 600,
        height: 1000,
        tiles: ["tiles-1/0.webp"],
        tileHeight: 1000,
      }),
    );
    const tooMany = sectionSchema.safeParse(
      section({
        type: "long-y",
        imagePath: "tiles-1/0.webp",
        width: 600,
        height: 33000,
        tiles: Array.from({ length: 33 }, (_, index) => `tiles-1/${index}.webp`),
        tileHeight: 1000,
      }),
    );

    expect(single.success).toBe(false);
    expect(tooMany.success).toBe(false);
  });

  test("longYSectionConfigSchema seul accepte les champs tuiles", () => {
    const result = longYSectionConfigSchema.safeParse({
      type: "long-y",
      imagePath: TILES[0],
      width: 600,
      height: 2500,
      tiles: TILES,
      tileHeight: 1000,
    });

    expect(result.success).toBe(true);
  });
});

describe("sectionConfigSchema discriminated union still works", () => {
  test("image type with fx still discriminated correctly", () => {
    const result = sectionConfigSchema.safeParse({
      type: "image",
      imagePath: "frame1.webp",
      width: 800,
      height: 1200,
      fxPath: "overlay.gif",
      fxConfig: {
        position: { x: "center", y: "bottom" },
        size: { mode: "percent", width: 50 },
        opacity: 0.8,
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.type).toBe("image");
    }
  });

  test("long-y type without fx still discriminated correctly", () => {
    const result = sectionConfigSchema.safeParse({
      type: "long-y",
      imagePath: "strip.webp",
      width: 600,
      height: 3000,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.type).toBe("long-y");
    }
  });
});
