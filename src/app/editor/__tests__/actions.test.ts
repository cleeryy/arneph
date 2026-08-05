import { describe, expect, test, vi, beforeEach } from "vitest";

import {
  saveWebtoon,
  publishWebtoon,
  unpublishWebtoon,
  deleteWebtoonAction,
} from "@/app/editor/actions";

import { supabase } from "@/lib/db/server";
import type { WebtoonWithSections } from "@/lib/db/queries";
import {
  getWebtoon,
  createSection,
} from "@/lib/db/queries";

vi.mock("@/lib/db/server", () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockReturnThis(),
      then: vi.fn((resolve: (v: unknown) => unknown) =>
        resolve({ data: null, error: null }),
      ),
    })),
    storage: {
      from: vi.fn(() => ({
        list: vi.fn().mockResolvedValue({ data: [], error: null }),
        remove: vi.fn().mockResolvedValue({ data: null, error: null }),
      })),
    },
  },
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/db/queries", () => ({
  getWebtoon: vi.fn().mockResolvedValue(null),
  createSection: vi.fn().mockResolvedValue({
    id: "new-id",
    type: "image",
    config: {},
    position: 0,
    webtoonId: "w1",
  }),
  upsertSection: vi.fn().mockResolvedValue(undefined),
  reorderSections: vi.fn().mockResolvedValue(undefined),
  deleteWebtoon: vi.fn().mockResolvedValue(true),
  updateWebtoon: vi.fn().mockResolvedValue(null),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("saveWebtoon — zod validation", () => {
  test("rejects empty webtoonId", async () => {
    const result = await saveWebtoon("", []);
    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
  });

  test("rejects sections with mismatched type", async () => {
    const result = await saveWebtoon("w1", [
      {
        id: "s1",
        webtoonId: "w1",
        position: 1,
        type: "image" as const,
        config: { type: "pan-x" as const, imagePath: "test.webp", width: 800, height: 1200 },
        audioPath: undefined,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        images: [],
      },
    ]);
    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
  });
});

describe("publishWebtoon", () => {
  test("rejects invalid webtoonId", async () => {
    const result = await publishWebtoon("");
    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
  });
});

describe("unpublishWebtoon", () => {
  test("rejects invalid webtoonId", async () => {
    const result = await unpublishWebtoon("");
    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
  });
});

describe("deleteWebtoonAction", () => {
  test("rejects invalid webtoonId", async () => {
    const result = await deleteWebtoonAction("");
    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
  });
});

describe("saveWebtoon — FX config persistence", () => {
  test("saveWebtoon with fxPath/fxConfig on image section persists full config via createSection", async () => {
    const result = await saveWebtoon("w1", [
      {
        id: "s1",
        webtoonId: "w1",
        position: 0,
        type: "image",
        config: {
          type: "image",
          imagePath: "test.webp",
          width: 800,
          height: 1200,
          fxPath: "fx/overlay.gif",
          fxConfig: {
            position: { x: "center", y: "center" },
            size: { mode: "px", width: 100, height: 100 },
            opacity: 0.5,
          },
        },
        audioPath: undefined,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        images: [],
      },
    ]);

    expect(result.ok).toBe(true);
    expect(createSection).toHaveBeenCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({
          fxPath: "fx/overlay.gif",
          fxConfig: {
            position: { x: "center", y: "center" },
            size: { mode: "px", width: 100, height: 100 },
            opacity: 0.5,
          },
        }),
      }),
    );
  });

  test("saveWebtoon remaps images to server-created section id (AGENTS.md rule)", async () => {
    const result = await saveWebtoon("w1", [
      {
        id: "client-temp-id",
        webtoonId: "w1",
        position: 0,
        type: "image",
        config: {
          type: "image",
          imagePath: "test.webp",
          width: 800,
          height: 1200,
        },
        audioPath: undefined,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        images: [
          {
            id: "img-1",
            sectionId: "client-temp-id",
            webtoonId: "w1",
            storagePath: "webtoons/sections/client-temp-id/1.webp",
            width: 800,
            height: 1200,
            mimeType: "image/webp",
            position: 0,
          },
        ],
      },
    ]);

    expect(result.ok).toBe(true);

    const fromCalls = vi.mocked(supabase.from).mock.calls;
    const imagesIndex = fromCalls.map((call) => call[0]).lastIndexOf("images");
    expect(imagesIndex).toBeGreaterThanOrEqual(0);
    const chain = vi.mocked(supabase.from).mock.results[imagesIndex].value;
    expect(chain.insert).toHaveBeenCalledWith([
      expect.objectContaining({
        section_id: "new-id",
        storage_path: "webtoons/sections/client-temp-id/1.webp",
      }),
    ]);
  });

    test("saveWebtoon with existing section persists full fx config via supabase update", async () => {
      vi.mocked(getWebtoon).mockResolvedValueOnce({
        id: "w1",
        title: "Test",
        sections: [
          {
            id: "s1",
            webtoonId: "w1",
            position: 0,
            type: "image",
            config: { type: "image", imagePath: "old.webp", width: 800, height: 1200 },
            audioPath: undefined,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
            images: [],
          },
        ],
      } as unknown as WebtoonWithSections);

      const result = await saveWebtoon("w1", [
        {
          id: "s1",
          webtoonId: "w1",
          position: 0,
          type: "image",
          config: {
            type: "image",
            imagePath: "test.webp",
            width: 800,
            height: 1200,
            fxPath: "fx/overlay.gif",
            fxConfig: {
              position: { x: "center", y: "center" },
              size: { mode: "px", width: 100, height: 100 },
              opacity: 0.5,
            },
          },
          audioPath: undefined,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
          images: [],
        },
      ]);

      expect(result.ok).toBe(true);
      expect(createSection).not.toHaveBeenCalled();

      const fromCalls = vi.mocked(supabase.from).mock.calls;
      const sectionsIndex = fromCalls.findIndex(
        (call) => call[0] === "sections",
      );
      expect(sectionsIndex).toBeGreaterThanOrEqual(0);
      const chain = vi.mocked(supabase.from).mock.results[sectionsIndex].value;
      expect(chain.update).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({
            fxPath: "fx/overlay.gif",
            fxConfig: {
              position: { x: "center", y: "center" },
              size: { mode: "px", width: 100, height: 100 },
              opacity: 0.5,
            },
          }),
        }),
      );
    });

  test("saveWebtoon with invalid fxConfig (opacity 1.5) rejected by Zod", async () => {
    const result = await saveWebtoon("w1", [
      {
        id: "s1",
        webtoonId: "w1",
        position: 0,
        type: "image",
        config: {
          type: "image",
          imagePath: "test.webp",
          width: 800,
          height: 1200,
          fxPath: "fx/overlay.gif",
          fxConfig: {
            position: { x: "center", y: "center" },
            size: { mode: "px", width: 100, height: 100 },
            opacity: 1.5,
          },
        },
        audioPath: undefined,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        images: [],
      },
    ]);

    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
  });

  test("saveWebtoon with image section without fx is still saveable (backward compat)", async () => {
    const result = await saveWebtoon("w1", [
      {
        id: "s1",
        webtoonId: "w1",
        position: 0,
        type: "image",
        config: {
          type: "image",
          imagePath: "test.webp",
          width: 800,
          height: 1200,
        },
        audioPath: undefined,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        images: [],
      },
    ]);

    expect(result.ok).toBe(true);
    expect(createSection).toHaveBeenCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({
          type: "image",
          imagePath: "test.webp",
          width: 800,
          height: 1200,
        }),
      }),
    );
  });
});
