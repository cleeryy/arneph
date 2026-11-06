import { describe, expect, test } from "vitest";

import {
  animationSectionConfigSchema,
  imageSectionConfigSchema,
  longYSectionConfigSchema,
  sectionConfigSchema,
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
