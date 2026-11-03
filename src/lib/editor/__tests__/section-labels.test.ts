import { describe, expect, test } from "vitest";

import { sectionTypeLabel } from "../section-labels";
import type { SectionType } from "@/types/webtoon";

const labels: Record<string, string> = {
  sectionTypeImage: "Image",
  sectionTypeLongY: "Longue (Y)",
  sectionTypePanX: "Panoramique (X)",
  sectionTypeAnimation: "Animation",
};

function fakeTranslator(key: string): string {
  return labels[key] ?? key;
}

describe("sectionTypeLabel", () => {
  test.each([
    ["image", "Image"],
    ["long-y", "Longue (Y)"],
    ["pan-x", "Panoramique (X)"],
    ["animation", "Animation"],
  ] as Array<[SectionType, string]>)("%s → clé i18n dédiée", (type, expected) => {
    expect(sectionTypeLabel(fakeTranslator, type)).toBe(expected);
  });

  test("passe par le traducteur fourni (pas de libellé en dur)", () => {
    const seen: string[] = [];
    const translator = (key: string) => {
      seen.push(key);
      return key;
    };

    sectionTypeLabel(translator, "pan-x");
    sectionTypeLabel(translator, "animation");

    expect(seen).toEqual(["sectionTypePanX", "sectionTypeAnimation"]);
  });
});
