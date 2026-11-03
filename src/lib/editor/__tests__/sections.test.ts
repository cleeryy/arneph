import { describe, expect, test } from "vitest";

import { isSectionType, renumberSections } from "../sections";
import type { SectionWithImages } from "@/lib/db/queries";
import type { SectionType } from "@/types/webtoon";

function makeSection(id: string, position: number, type: SectionType = "image"): SectionWithImages {
  const now = "2026-01-01T00:00:00.000Z";
  return {
    id,
    webtoonId: "webtoon-1",
    position,
    type,
    config: { type: "image", imagePath: "", width: 0, height: 0 },
    images: [],
    audioPath: undefined,
    createdAt: now,
    updatedAt: now,
  } as SectionWithImages;
}

describe("renumberSections", () => {
  test("réassigne des positions contiguës 1-based dans l'ordre reçu", () => {
    const input = [makeSection("c", 7), makeSection("a", 3), makeSection("b", 5)];

    const output = renumberSections(input);

    expect(output.map((section) => section.id)).toEqual(["c", "a", "b"]);
    expect(output.map((section) => section.position)).toEqual([1, 2, 3]);
  });

  test("couvre le trou laissé par une suppression", () => {
    const output = renumberSections([makeSection("a", 1), makeSection("c", 3)]);

    expect(output.map((section) => section.position)).toEqual([1, 2]);
  });

  test("ne mute pas l'entrée et retourne de nouveaux objets", () => {
    const input = [makeSection("a", 4), makeSection("b", 9)];
    const snapshot = input.map((section) => ({ ...section }));

    const output = renumberSections(input);

    expect(input).toEqual(snapshot);
    expect(output[0]).not.toBe(input[0]);
  });

  test("retourne un tableau vide pour un tableau vide", () => {
    expect(renumberSections([])).toEqual([]);
  });
});

describe("isSectionType", () => {
  test("accepte les quatre types supportés", () => {
    for (const type of ["image", "long-y", "pan-x", "animation"] as const) {
      expect(isSectionType(type)).toBe(true);
    }
  });

  test("rejette les valeurs inconnues", () => {
    expect(isSectionType("video")).toBe(false);
    expect(isSectionType(undefined)).toBe(false);
    expect(isSectionType(null)).toBe(false);
    expect(isSectionType(42)).toBe(false);
  });
});
