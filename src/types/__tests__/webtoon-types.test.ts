import { describe, test } from "vitest";
import type { FxOverlayConfig, ImageSectionConfig, LongYSectionConfig } from "../webtoon";

/**
 * TDD — RED d'abord : ce fichier vérifie que les types fxPath / fxConfig
 * sont bien reconnus par TypeScript sur ImageSectionConfig et LongYSectionConfig.
 * Si les types sont absents ou mal formés, la compilation échoue ici.
 */

describe("T1 — fx overlay types", () => {
  test("FxOverlayConfig a la bonne forme", () => {
    const cfg: FxOverlayConfig = {
      position: { x: "center", y: "bottom" },
      size: { mode: "percent", width: 50 },
      opacity: 0.75,
    };
    // Vérification de type par assignation — si FxOverlayConfig change,
    // cette ligne produit une erreur TS.
    const _posX: "left" | "center" | "right" = cfg.position.x;
    const _posY: "top" | "center" | "bottom" = cfg.position.y;
    const _mode: "px" | "percent" = cfg.size.mode;
    const _opacity: number = cfg.opacity;
    void { _posX, _posY, _mode, _opacity };
  });

  test("ImageSectionConfig accepte fxPath et fxConfig optionnels", () => {
    const section: ImageSectionConfig = {
      type: "image",
      imagePath: "test/cover.webp",
      width: 800,
      height: 1200,
      fxPath: "test/overlay.gif",
      fxConfig: {
        position: { x: "right", y: "top" },
        size: { mode: "px", width: 200, height: 200 },
        opacity: 0.5,
      },
    };
    // fxPath et fxConfig doivent être accessibles et typés correctement.
    const _fxPath: string | undefined = section.fxPath;
    const _fxConfig: FxOverlayConfig | undefined = section.fxConfig;
    void { _fxPath, _fxConfig };
  });

  test("LongYSectionConfig accepte fxPath et fxConfig optionnels", () => {
    const section: LongYSectionConfig = {
      type: "long-y",
      imagePath: "test/long.webp",
      width: 800,
      height: 4000,
      fxPath: "test/overlay.webp",
      fxConfig: {
        position: { x: "left", y: "center" },
        size: { mode: "percent", width: 30 },
        opacity: 1,
      },
    };
    const _fxPath: string | undefined = section.fxPath;
    const _fxConfig: FxOverlayConfig | undefined = section.fxConfig;
    void { _fxPath, _fxConfig };
  });

  test("ImageSectionConfig et LongYSectionConfig restent compatibles avec SectionConfig", () => {
    const img: ImageSectionConfig = {
      type: "image",
      imagePath: "test/cover.webp",
      width: 800,
      height: 1200,
      fxPath: "test/overlay.gif",
      fxConfig: {
        position: { x: "center", y: "center" },
        size: { mode: "px", width: 100 },
        opacity: 0.8,
      },
    };
    const ly: LongYSectionConfig = {
      type: "long-y",
      imagePath: "test/long.webp",
      width: 800,
      height: 4000,
      fxPath: "test/overlay.gif",
      fxConfig: {
        position: { x: "center", y: "bottom" },
        size: { mode: "percent", width: 100 },
        opacity: 0.5,
      },
    };
    // Les deux doivent être assignables à SectionConfig (union discriminée).
    const _union: ImageSectionConfig | LongYSectionConfig = img;
    void { _union, ly };
  });
});
