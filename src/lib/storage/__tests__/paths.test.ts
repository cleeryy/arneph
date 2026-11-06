import { describe, expect, test } from "vitest";

import {
  SEED_STORAGE_PREFIX,
  assertSafeStoragePath,
  coverStoragePrefix,
  isPathUnder,
  isSafeStoragePath,
  sectionStoragePrefix,
} from "../paths";

describe("isSafeStoragePath", () => {
  test.each([
    "a.webp",
    "webtoons/sections/s1/1-page.webp",
    "webtoons/sections/s1/frames/1700000000000/0.webp",
    "webtoons/covers/w1/cover.webp",
    "webtoons/seed/demo/long-y.png",
    "webtoons/démo/image 1.png",
  ])("accepte %s", (path) => {
    expect(isSafeStoragePath(path)).toBe(true);
  });

  test.each([
    ["chemin vide", ""],
    ["chemin absolu", "/webtoons/sections/s1/1.webp"],
    ["antislash", "webtoons\\sections\\s1\\1.webp"],
    ["segment vide", "webtoons//sections/s1/1.webp"],
    ["traversée simple", "../secret.webp"],
    ["traversée interne", "webtoons/sections/s1/../../covers/w2/cover.webp"],
    ["segment courant", "webtoons/sections/s1/./1.webp"],
    ["dossier seul", "webtoons/sections/s1/"],
    ["point", "."],
    ["double point", ".."],
  ])("refuse un %s", (_label, path) => {
    expect(isSafeStoragePath(path)).toBe(false);
  });
});

describe("isPathUnder", () => {
  const prefix = sectionStoragePrefix("s1");

  test("accepte un fichier sous le préfixe", () => {
    expect(isPathUnder("webtoons/sections/s1/1.webp", prefix)).toBe(true);
    expect(
      isPathUnder("webtoons/sections/s1/frames/1700000000000/0.webp", prefix),
    ).toBe(true);
  });

  test("accepte le préfixe exact sans slash final", () => {
    expect(isPathUnder("webtoons/sections/s1", "webtoons/sections/s1")).toBe(
      true,
    );
  });

  test("refuse un préfixe voisin (s1 vs s10)", () => {
    expect(isPathUnder("webtoons/sections/s10/1.webp", prefix)).toBe(false);
  });

  test("refuse un autre préfixe", () => {
    expect(isPathUnder("webtoons/covers/w1/cover.webp", prefix)).toBe(false);
    expect(isPathUnder("webtoons/seed/demo/image.png", prefix)).toBe(false);
  });

  test("refuse un chemin invalide même sous le bon préfixe", () => {
    expect(
      isPathUnder("webtoons/sections/s1/../../../secret.webp", prefix),
    ).toBe(false);
  });

  test("refuse un préfixe vide", () => {
    expect(isPathUnder("webtoons/sections/s1/1.webp", "")).toBe(false);
  });
});

describe("préfixes Storage", () => {
  test("construit le préfixe d'une section", () => {
    expect(sectionStoragePrefix("abc")).toBe("webtoons/sections/abc/");
  });

  test("construit le préfixe d'une couverture", () => {
    expect(coverStoragePrefix("w1")).toBe("webtoons/covers/w1/");
  });

  test("le préfixe seed couvre les assets du seed", () => {
    expect(SEED_STORAGE_PREFIX).toBe("webtoons/seed/");
    expect(isPathUnder("webtoons/seed/demo/image.png", SEED_STORAGE_PREFIX)).toBe(
      true,
    );
    expect(
      isPathUnder("webtoons/sections/s1/image.png", SEED_STORAGE_PREFIX),
    ).toBe(false);
  });
});

describe("assertSafeStoragePath", () => {
  test("ne lève pas pour un chemin sûr", () => {
    expect(() =>
      assertSafeStoragePath("webtoons/sections/s1/1.webp"),
    ).not.toThrow();
  });

  test("lève une erreur explicite avec le libellé fourni", () => {
    expect(() => assertSafeStoragePath("../secret.webp", "Image de section")).toThrow(
      /Image de section invalide : "\.\.\/secret\.webp"/,
    );
  });

  test("lève une erreur avec le libellé par défaut", () => {
    expect(() => assertSafeStoragePath("/abs.webp")).toThrow(
      /Chemin Storage invalide/,
    );
  });
});
