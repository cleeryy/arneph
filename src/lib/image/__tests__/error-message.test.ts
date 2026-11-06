import { describe, expect, test } from "vitest";

import {
  IMAGE_ERROR_FALLBACK_KEY,
  imageErrorKey,
} from "../error-message";
import type { ImageProcessingErrorCode } from "../process";
import enMessages from "../../../../messages/en.json";
import frMessages from "../../../../messages/fr.json";

const ALL_CODES: ImageProcessingErrorCode[] = [
  "NOT_IMAGE",
  "UNSUPPORTED_TYPE",
  "INVALID_IMAGE",
  "INVALID_TARGET",
  "IMAGE_TOO_LARGE",
  "SPRITE_TOO_LARGE",
  "TOO_MANY_FRAMES",
  "EMPTY_BATCH",
  "CANVAS_UNAVAILABLE",
  "ENCODE_FAILED",
];

describe("imageErrorKey", () => {
  test.each(ALL_CODES)("maps %s to a dedicated editor key", (code) => {
    expect(imageErrorKey(code)).toBe(`editor.imageErrors.${code}`);
  });

  test("every code has a distinct key", () => {
    const keys = ALL_CODES.map(imageErrorKey);
    expect(new Set(keys).size).toBe(ALL_CODES.length);
    expect(keys).not.toContain(IMAGE_ERROR_FALLBACK_KEY);
  });

  test("falls back to the generic key for an unknown code", () => {
    const unknown = "SOMETHING_NEW" as ImageProcessingErrorCode;
    expect(imageErrorKey(unknown)).toBe(IMAGE_ERROR_FALLBACK_KEY);
    expect(IMAGE_ERROR_FALLBACK_KEY).toBe("editor.imageErrors.generic");
  });

  test("does not leak the technical code in the fallback key", () => {
    const unknown = "SOMETHING_NEW" as ImageProcessingErrorCode;
    expect(imageErrorKey(unknown).toLowerCase()).not.toContain(
      "something_new",
    );
  });

  test("every mapped key exists in the fr and en catalogs", () => {
    const errors = frMessages.editor.imageErrors as Record<string, string>;
    const errorsEn = enMessages.editor.imageErrors as Record<string, string>;

    for (const code of ALL_CODES) {
      const key = imageErrorKey(code).replace("editor.imageErrors.", "");
      expect(errors[key]?.trim().length ?? 0).toBeGreaterThan(0);
      expect(errorsEn[key]?.trim().length ?? 0).toBeGreaterThan(0);
    }
    expect(errors.generic?.trim().length ?? 0).toBeGreaterThan(0);
    expect(errorsEn.generic?.trim().length ?? 0).toBeGreaterThan(0);
  });
});
