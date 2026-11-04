import { afterEach, describe, expect, test, vi } from "vitest";

import { buildReaderSteps } from "@/lib/reader/steps";
import type { SectionWithImages } from "@/lib/db/queries";
import type { SectionConfig, SectionType } from "@/types/webtoon";
import {
  preloadImages,
  resetPreloadCache,
  stepImageUrls,
} from "@/hooks/useStepPreload";

vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://supabase.example.com");

const created: string[] = [];

class FakeImage {
  decoding = "";
  set src(value: string) {
    created.push(value);
  }
}

vi.stubGlobal("Image", FakeImage);

afterEach(() => {
  created.length = 0;
  resetPreloadCache();
  vi.unstubAllEnvs();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://supabase.example.com");
});

function section(type: SectionType, config: SectionConfig): SectionWithImages {
  return {
    id: "s1",
    webtoonId: "w1",
    position: 1,
    type,
    config,
    images: [
      {
        id: "i1",
        sectionId: "s1",
        webtoonId: "w1",
        storagePath: "webtoons/s1/page.webp",
        width: 800,
        height: 1200,
        mimeType: "image/webp",
        position: 0,
      },
    ],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("stepImageUrls", () => {
  test("image : média de section + chemin de config, dédupliqués", () => {
    const steps = buildReaderSteps([
      section("image", { type: "image", imagePath: "webtoons/s1/page.webp", width: 800, height: 1200 }),
    ]);
    expect(stepImageUrls(steps[0])).toEqual([
      "https://supabase.example.com/storage/v1/object/public/webtoon-images/webtoons/s1/page.webp",
    ]);
  });

  test("animation en frames : précharge la première frame", () => {
    const steps = buildReaderSteps([
      section("animation", {
        type: "animation",
        spritePath: "sprite.webp",
        framePaths: ["frames/0.webp", "frames/1.webp"],
        frameWidth: 100,
        frameHeight: 100,
        columns: 2,
        rows: 1,
        frameCount: 2,
      }),
    ]);
    expect(
      stepImageUrls(steps[0]).some((url) => url.includes("/frames/0.webp")),
    ).toBe(true);
  });
});

describe("preloadImages", () => {
  test("charge chaque URL une seule fois", () => {
    preloadImages(["https://x/a.webp", "https://x/a.webp", "https://x/b.webp"]);
    expect(created).toEqual(["https://x/a.webp", "https://x/b.webp"]);
    preloadImages(["https://x/a.webp"]);
    expect(created).toEqual(["https://x/a.webp", "https://x/b.webp"]);
  });
});
