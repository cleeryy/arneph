import { describe, expect, test, vi, beforeEach } from "vitest";

import {
  createWebtoonAction,
  updateWebtoonMetadataAction,
  saveWebtoon,
  publishWebtoon,
  unpublishWebtoon,
  deleteWebtoonAction,
} from "@/app/editor/actions";

import { revalidatePath } from "next/cache";
import { supabase } from "@/lib/db/server";
import type { WebtoonWithSections } from "@/lib/db/queries";
import type { Webtoon } from "@/types/webtoon";
import {
  createWebtoon,
  deleteWebtoon,
  getWebtoon,
  createSection,
  reorderSections,
  updateWebtoon,
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
        resolve({ data: [{ id: "s1" }], error: null }),
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
  createWebtoon: vi.fn(),
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
  // Query chains are re-created per test: one-off implementations must not
  // leak into later tests (Vitest does not clear them via clearAllMocks).
  vi.mocked(supabase.from).mockReset();
  vi.mocked(supabase.from).mockImplementation(
    () =>
      ({
        select: vi.fn().mockReturnThis(),
        insert: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        delete: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockReturnThis(),
        then: vi.fn((resolve: (v: unknown) => unknown) =>
          resolve({ data: [{ id: "s1" }], error: null }),
        ),
      }) as never,
  );
  // Storage mocks are re-created per test: some tests set persistent
  // `mockReturnValue` implementations that must not leak into later tests.
  vi.mocked(supabase.storage.from).mockReset();
  vi.mocked(supabase.storage.from).mockImplementation(
    () =>
      ({
        list: vi.fn().mockResolvedValue({ data: [], error: null }),
        remove: vi.fn().mockResolvedValue({ data: null, error: null }),
      }) as unknown as ReturnType<typeof supabase.storage.from>,
  );
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

describe("saveWebtoon — server id mapping (duplicate-save guard)", () => {
  test("returns serializable client→server section id mapping", async () => {
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
        images: [],
      },
    ]);

    expect(result.ok).toBe(true);
    expect((result as { sectionIds?: unknown }).sectionIds).toEqual({
      "client-temp-id": "new-id",
    });
    // Must be plain JSON-serializable (Server Action return constraint).
    expect(JSON.parse(JSON.stringify((result as { sectionIds?: unknown }).sectionIds))).toEqual({
      "client-temp-id": "new-id",
    });
  });

  test("maps existing sections to themselves", async () => {
    vi.mocked(getWebtoon).mockResolvedValueOnce({
      id: "w1",
      title: "Test",
      sections: [
        {
          id: "s1",
          webtoonId: "w1",
          position: 0,
          type: "image",
          config: { type: "image", imagePath: "kept.webp", width: 800, height: 1200 },
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
        type: "image" as const,
        config: {
          type: "image" as const,
          imagePath: "kept.webp",
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
    expect((result as { sectionIds?: unknown }).sectionIds).toEqual({ s1: "s1" });
  });
});

describe("saveWebtoon — image-row delete failure", () => {
  const existingSection = {
    id: "s1",
    webtoonId: "w1",
    position: 0,
    type: "image" as const,
    config: {
      type: "image" as const,
      imagePath: "kept.webp",
      width: 800,
      height: 1200,
    },
    audioPath: undefined,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    images: [
      {
        id: "img-1",
        sectionId: "s1",
        webtoonId: "w1",
        storagePath: "webtoons/sections/s1/1.webp",
        width: 800,
        height: 1200,
        mimeType: "image/webp",
        position: 0,
      },
    ],
  };

  test("failed image-row deletion returns ok:false and skips reorder", async () => {
    vi.mocked(getWebtoon).mockResolvedValueOnce({
      id: "w1",
      title: "Test",
      sections: [
        {
          id: "s1",
          webtoonId: "w1",
          position: 0,
          type: "image",
          config: { type: "image", imagePath: "kept.webp", width: 800, height: 1200 },
          audioPath: undefined,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
          images: [],
        },
      ],
    } as unknown as WebtoonWithSections);

    const deleteEq = vi.fn().mockResolvedValue({ data: null, error: { message: "delete boom" } });
    const sectionsChain = {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      then: vi.fn((resolve: (v: unknown) => unknown) =>
        resolve({ data: [{ id: "s1" }], error: null }),
      ),
    };
    const imagesChain = {
      delete: vi.fn(() => ({ eq: deleteEq })),
      insert: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
    vi.mocked(supabase.from).mockImplementationOnce(() => sectionsChain as never);
    vi.mocked(supabase.from).mockImplementationOnce(() => imagesChain as never);

    const result = await saveWebtoon("w1", [existingSection]);

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/delete boom|syncImages/);
    expect(reorderSections).not.toHaveBeenCalled();
  });
});

describe("saveWebtoon — removed-section storage cleanup ordering", () => {
  const keptSection = {
    id: "s1",
    webtoonId: "w1",
    position: 0,
    type: "image" as const,
    config: {
      type: "image" as const,
      imagePath: "kept.webp",
      width: 800,
      height: 1200,
    },
    audioPath: undefined,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    images: [],
  };

  const currentWithRemovedSection = {
    id: "w1",
    title: "Test",
    sections: [
      {
        id: "s1",
        webtoonId: "w1",
        position: 0,
        type: "image",
        config: { type: "image", imagePath: "kept.webp", width: 800, height: 1200 },
        audioPath: undefined,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        images: [],
      },
      {
        id: "s2",
        webtoonId: "w1",
        position: 1,
        type: "image",
        config: { type: "image", imagePath: "removed.webp", width: 800, height: 1200 },
        audioPath: undefined,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        images: [
          {
            id: "img-2",
            sectionId: "s2",
            webtoonId: "w1",
            storagePath: "webtoons/sections/s2/1.webp",
            width: 800,
            height: 1200,
            mimeType: "image/webp",
            position: 0,
          },
        ],
      },
    ],
  } as unknown as WebtoonWithSections;

  test("does not delete removed-section Storage objects when reorder fails", async () => {
    vi.mocked(getWebtoon).mockResolvedValueOnce(currentWithRemovedSection);
    vi.mocked(reorderSections).mockRejectedValueOnce(new Error("reorder boom"));
    const removeMock = vi.fn().mockResolvedValue({ data: null, error: null });
    const listMock = vi.fn().mockResolvedValue({ data: [], error: null });
    vi.mocked(supabase.storage.from).mockReturnValue({
      list: listMock,
      remove: removeMock,
    } as unknown as ReturnType<typeof supabase.storage.from>);

    const result = await saveWebtoon("w1", [keptSection]);

    expect(result.ok).toBe(false);
    expect(removeMock).not.toHaveBeenCalled();
  });

  test("deletes removed-section Storage objects after successful save", async () => {
    vi.mocked(getWebtoon).mockResolvedValueOnce(currentWithRemovedSection);
    const removeMock = vi.fn().mockResolvedValue({ data: null, error: null });
    const listMock = vi.fn().mockResolvedValue({ data: [], error: null });
    vi.mocked(supabase.storage.from).mockReturnValue({
      list: listMock,
      remove: removeMock,
    } as unknown as ReturnType<typeof supabase.storage.from>);

    const result = await saveWebtoon("w1", [keptSection]);

    expect(result.ok).toBe(true);
    expect(removeMock).toHaveBeenCalledTimes(1);
    expect(removeMock).toHaveBeenCalledWith(
      expect.arrayContaining([
        "webtoons/sections/s2/1.webp",
        "removed.webp",
      ]),
    );
  });
});

describe("saveWebtoon — retained-section replaced-file storage cleanup", () => {
  const baseTimestamps = {
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };

  function mockStorage() {
    const removeMock = vi.fn().mockResolvedValue({ data: null, error: null });
    const listMock = vi.fn().mockResolvedValue({ data: [], error: null });
    vi.mocked(supabase.storage.from).mockReturnValue({
      list: listMock,
      remove: removeMock,
    } as unknown as ReturnType<typeof supabase.storage.from>);
    return { removeMock, listMock };
  }

  test("removes old image/audio/config paths no longer referenced, keeps newly uploaded paths", async () => {
    vi.mocked(getWebtoon).mockResolvedValueOnce({
      id: "w1",
      title: "Test",
      sections: [
        {
          id: "s1",
          webtoonId: "w1",
          position: 0,
          type: "image",
          config: {
            type: "image",
            imagePath: "old-image.webp",
            width: 800,
            height: 1200,
            fxPath: "old-fx.gif",
          },
          audioPath: "old-audio.mp3",
          ...baseTimestamps,
          images: [
            {
              id: "img-old",
              sectionId: "s1",
              webtoonId: "w1",
              storagePath: "webtoons/sections/s1/old.webp",
              width: 800,
              height: 1200,
              mimeType: "image/webp",
              position: 0,
            },
          ],
        },
        {
          id: "s2",
          webtoonId: "w1",
          position: 1,
          type: "animation",
          config: {
            type: "animation",
            spritePath: "old-sprite.webp",
            frameWidth: 100,
            frameHeight: 100,
            columns: 4,
            rows: 4,
            frameCount: 16,
          },
          audioPath: undefined,
          ...baseTimestamps,
          images: [],
        },
      ],
    } as unknown as WebtoonWithSections);
    const { removeMock, listMock } = mockStorage();

    const result = await saveWebtoon("w1", [
      {
        id: "s1",
        webtoonId: "w1",
        position: 0,
        type: "image" as const,
        config: {
          type: "image" as const,
          imagePath: "new-image.webp",
          width: 800,
          height: 1200,
          fxPath: "new-fx.gif",
        },
        audioPath: "new-audio.mp3",
        ...baseTimestamps,
        images: [
          {
            id: "img-new",
            sectionId: "s1",
            webtoonId: "w1",
            storagePath: "webtoons/sections/s1/new.webp",
            width: 800,
            height: 1200,
            mimeType: "image/webp",
            position: 0,
          },
        ],
      },
      {
        id: "s2",
        webtoonId: "w1",
        position: 1,
        type: "animation" as const,
        config: {
          type: "animation" as const,
          spritePath: "new-sprite.webp",
          frameWidth: 100,
          frameHeight: 100,
          columns: 4,
          rows: 4,
          frameCount: 16,
        },
        audioPath: undefined,
        ...baseTimestamps,
        images: [],
      },
    ]);

    expect(result.ok).toBe(true);
    expect(removeMock).toHaveBeenCalledTimes(1);
    const removedPaths: string[] = removeMock.mock.calls[0][0];
    expect(removedPaths).toEqual(
      expect.arrayContaining([
        "webtoons/sections/s1/old.webp",
        "old-audio.mp3",
        "old-image.webp",
        "old-fx.gif",
        "old-sprite.webp",
      ]),
    );
    for (const kept of [
      "webtoons/sections/s1/new.webp",
      "new-audio.mp3",
      "new-image.webp",
      "new-fx.gif",
      "new-sprite.webp",
    ]) {
      expect(removedPaths).not.toContain(kept);
    }
    // Retained-section cleanup must remove explicit paths only,
    // without listing/deleting the whole section folder.
    expect(listMock).not.toHaveBeenCalled();
  });

  test("does not remove old paths still referenced anywhere in incoming sections", async () => {
    vi.mocked(getWebtoon).mockResolvedValueOnce({
      id: "w1",
      title: "Test",
      sections: [
        {
          id: "s1",
          webtoonId: "w1",
          position: 0,
          type: "image",
          config: {
            type: "image",
            imagePath: "shared.webp",
            width: 800,
            height: 1200,
            fxPath: "old-fx.gif",
          },
          audioPath: "old-audio.mp3",
          ...baseTimestamps,
          images: [
            {
              id: "img-old",
              sectionId: "s1",
              webtoonId: "w1",
              storagePath: "webtoons/sections/s1/old.webp",
              width: 800,
              height: 1200,
              mimeType: "image/webp",
              position: 0,
            },
          ],
        },
      ],
    } as unknown as WebtoonWithSections);
    const { removeMock } = mockStorage();

    const result = await saveWebtoon("w1", [
      {
        id: "s1",
        webtoonId: "w1",
        position: 0,
        type: "image" as const,
        config: {
          type: "image" as const,
          imagePath: "new-image.webp",
          width: 800,
          height: 1200,
          fxPath: "new-fx.gif",
        },
        audioPath: "new-audio.mp3",
        ...baseTimestamps,
        images: [
          {
            id: "img-kept",
            sectionId: "s1",
            webtoonId: "w1",
            storagePath: "webtoons/sections/s1/old.webp",
            width: 800,
            height: 1200,
            mimeType: "image/webp",
            position: 0,
          },
        ],
      },
      {
        id: "s2",
        webtoonId: "w1",
        position: 1,
        type: "image" as const,
        config: {
          type: "image" as const,
          imagePath: "shared.webp",
          width: 800,
          height: 1200,
        },
        audioPath: undefined,
        ...baseTimestamps,
        images: [],
      },
    ]);

    expect(result.ok).toBe(true);
    expect(removeMock).toHaveBeenCalledTimes(1);
    const removedPaths: string[] = removeMock.mock.calls[0][0];
    expect(removedPaths).not.toContain("webtoons/sections/s1/old.webp");
    expect(removedPaths).not.toContain("shared.webp");
    // Unshared stale paths are still cleaned.
    expect(removedPaths).toEqual(
      expect.arrayContaining(["old-audio.mp3", "old-fx.gif"]),
    );
  });

  test("does not remove replaced-file paths when reorder fails", async () => {
    vi.mocked(getWebtoon).mockResolvedValueOnce({
      id: "w1",
      title: "Test",
      sections: [
        {
          id: "s1",
          webtoonId: "w1",
          position: 0,
          type: "image",
          config: { type: "image", imagePath: "old-image.webp", width: 800, height: 1200 },
          audioPath: "old-audio.mp3",
          ...baseTimestamps,
          images: [
            {
              id: "img-old",
              sectionId: "s1",
              webtoonId: "w1",
              storagePath: "webtoons/sections/s1/old.webp",
              width: 800,
              height: 1200,
              mimeType: "image/webp",
              position: 0,
            },
          ],
        },
      ],
    } as unknown as WebtoonWithSections);
    vi.mocked(reorderSections).mockRejectedValueOnce(new Error("reorder boom"));
    const { removeMock } = mockStorage();

    const result = await saveWebtoon("w1", [
      {
        id: "s1",
        webtoonId: "w1",
        position: 0,
        type: "image" as const,
        config: {
          type: "image" as const,
          imagePath: "new-image.webp",
          width: 800,
          height: 1200,
        },
        audioPath: "new-audio.mp3",
        ...baseTimestamps,
        images: [
          {
            id: "img-new",
            sectionId: "s1",
            webtoonId: "w1",
            storagePath: "webtoons/sections/s1/new.webp",
            width: 800,
            height: 1200,
            mimeType: "image/webp",
            position: 0,
          },
        ],
      },
    ]);

    expect(result.ok).toBe(false);
    expect(removeMock).not.toHaveBeenCalled();
  });
});

describe("fxPath storage cleanup", () => {
  test("removed section with fxPath includes fxPath in Storage remove list", async () => {
    vi.mocked(getWebtoon).mockResolvedValueOnce({
      id: "w1",
      title: "Test",
      sections: [
        {
          id: "s1",
          webtoonId: "w1",
          position: 0,
          type: "image",
          config: { type: "image", imagePath: "kept.webp", width: 800, height: 1200 },
          audioPath: undefined,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
          images: [],
        },
        {
          id: "s2",
          webtoonId: "w1",
          position: 1,
          type: "image",
          config: {
            type: "image",
            imagePath: "removed.webp",
            width: 800,
            height: 1200,
            fxPath: "fx/overlay.gif",
          },
          audioPath: undefined,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
          images: [],
        },
      ],
    } as unknown as WebtoonWithSections);
    const removeMock = vi.fn().mockResolvedValue({ data: null, error: null });
    const listMock = vi.fn().mockResolvedValue({ data: [], error: null });
    vi.mocked(supabase.storage.from).mockReturnValue({
      list: listMock,
      remove: removeMock,
    } as unknown as ReturnType<typeof supabase.storage.from>);

    const keptSection = {
      id: "s1",
      webtoonId: "w1",
      position: 0,
      type: "image" as const,
      config: {
        type: "image" as const,
        imagePath: "kept.webp",
        width: 800,
        height: 1200,
      },
      audioPath: undefined,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      images: [],
    };

    const result = await saveWebtoon("w1", [keptSection]);

    expect(result.ok).toBe(true);
    expect(removeMock).toHaveBeenCalledTimes(1);
    expect(removeMock).toHaveBeenCalledWith(
      expect.arrayContaining(["fx/overlay.gif"]),
    );
  });

  test("deleted webtoon with fxPath includes fxPath in Storage remove list", async () => {
    vi.mocked(getWebtoon).mockResolvedValueOnce({
      id: "w1",
      title: "Test",
      sections: [
        {
          id: "s1",
          webtoonId: "w1",
          position: 0,
          type: "image",
          config: {
            type: "image",
            imagePath: "cover.webp",
            width: 800,
            height: 1200,
            fxPath: "fx/overlay.gif",
          },
          audioPath: undefined,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
          images: [],
        },
      ],
    } as unknown as WebtoonWithSections);
    const removeMock = vi.fn().mockResolvedValue({ data: null, error: null });
    const listMock = vi.fn().mockResolvedValue({ data: [], error: null });
    vi.mocked(supabase.storage.from).mockReturnValue({
      list: listMock,
      remove: removeMock,
    } as unknown as ReturnType<typeof supabase.storage.from>);

    const result = await deleteWebtoonAction("w1");

    expect(result.ok).toBe(true);
    expect(removeMock).toHaveBeenCalledWith(
      expect.arrayContaining(["fx/overlay.gif"]),
    );
  });
});

// ---------------------------------------------------------------------------
// T12 — création, métadonnées, intégrité des ids, publication et resilience
// ---------------------------------------------------------------------------

function buildWebtoon(overrides: Partial<Webtoon> = {}): Webtoon {
  return {
    id: "w-new",
    title: "Nouveau webtoon",
    description: undefined,
    coverPath: undefined,
    visibility: "draft",
    settings: {},
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function buildWebtoonWithSections(
  sections: WebtoonWithSections["sections"],
): WebtoonWithSections {
  return { ...buildWebtoon({ id: "w1" }), sections };
}

const duplicateTitleError = () =>
  new Error(
    'db.createWebtoon failed: duplicate key value violates unique constraint "unique_webtoons_title"',
  );

describe("createWebtoonAction", () => {
  test("creates a draft with the localized default title", async () => {
    vi.mocked(createWebtoon).mockResolvedValueOnce(buildWebtoon());

    const result = await createWebtoonAction();

    expect(result).toEqual({ ok: true, webtoonId: "w-new" });
    expect(createWebtoon).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Nouveau webtoon",
        visibility: "draft",
      }),
    );
    expect(revalidatePath).toHaveBeenCalledWith("/editor");
  });

  test("retries with a numeric suffix when the title already exists", async () => {
    vi.mocked(createWebtoon)
      .mockRejectedValueOnce(duplicateTitleError())
      .mockRejectedValueOnce(duplicateTitleError())
      .mockResolvedValueOnce(buildWebtoon({ id: "w-retried", title: "Nouveau webtoon (3)" }));

    const result = await createWebtoonAction();

    expect(result).toEqual({ ok: true, webtoonId: "w-retried" });
    const titles = vi.mocked(createWebtoon).mock.calls.map((call) => call[0].title);
    expect(titles).toEqual([
      "Nouveau webtoon",
      "Nouveau webtoon (2)",
      "Nouveau webtoon (3)",
    ]);
  });

  test("does not mask non-duplicate database errors", async () => {
    vi.mocked(createWebtoon).mockRejectedValueOnce(
      new Error("db.createWebtoon failed: connection refused"),
    );

    const result = await createWebtoonAction();

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/connection refused/);
    expect(createWebtoon).toHaveBeenCalledTimes(1);
  });

  test("honours a caller-provided title", async () => {
    vi.mocked(createWebtoon).mockResolvedValueOnce(buildWebtoon({ title: "Mon webtoon" }));

    await createWebtoonAction({ title: "Mon webtoon" });

    expect(createWebtoon).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Mon webtoon" }),
    );
  });
});

describe("updateWebtoonMetadataAction", () => {
  test("rejects an empty title without touching the database", async () => {
    const result = await updateWebtoonMetadataAction("w1", {
      title: "  ",
      description: "desc",
    });

    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
    expect(updateWebtoon).not.toHaveBeenCalled();
  });

  test("rejects a description longer than 2000 characters", async () => {
    const result = await updateWebtoonMetadataAction("w1", {
      title: "Titre",
      description: "a".repeat(2001),
    });

    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
    expect(updateWebtoon).not.toHaveBeenCalled();
  });

  test("updates metadata and revalidates /editor and /read", async () => {
    vi.mocked(updateWebtoon).mockResolvedValueOnce(buildWebtoon({ id: "w1" }));

    const result = await updateWebtoonMetadataAction("w1", {
      title: "Titre renommé",
      description: "Nouvelle description",
    });

    expect(result).toEqual({ ok: true });
    expect(updateWebtoon).toHaveBeenCalledWith("w1", {
      title: "Titre renommé",
      description: "Nouvelle description",
    });
    expect(revalidatePath).toHaveBeenCalledWith("/editor");
    expect(revalidatePath).toHaveBeenCalledWith("/read");
  });

  test("surfaces a duplicate title as a friendly error instead of throwing", async () => {
    vi.mocked(updateWebtoon).mockRejectedValueOnce(
      new Error(
        'db.updateWebtoon failed: duplicate key value violates unique constraint "unique_webtoons_title"',
      ),
    );

    await expect(
      updateWebtoonMetadataAction("w1", { title: "Doublon" }),
    ).resolves.toEqual(
      expect.objectContaining({
        ok: false,
        error: expect.stringMatching(/déjà ce titre/),
      }),
    );
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  test("returns ok:false when the webtoon does not exist", async () => {
    vi.mocked(updateWebtoon).mockResolvedValueOnce(null);

    const result = await updateWebtoonMetadataAction("w1", { title: "Titre" });

    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
  });
});

describe("updateWebtoonMetadataAction — coverPath", () => {
  const COVER_PATH = "webtoons/covers/w1/1700000000000-cover.webp";

  test("persists a cover path and revalidates /read", async () => {
    vi.mocked(updateWebtoon).mockResolvedValueOnce(
      buildWebtoon({ id: "w1", coverPath: COVER_PATH }),
    );

    const result = await updateWebtoonMetadataAction("w1", {
      title: "Titre",
      description: "Desc",
      coverPath: COVER_PATH,
    });

    expect(result).toEqual({ ok: true });
    expect(updateWebtoon).toHaveBeenCalledWith("w1", {
      title: "Titre",
      description: "Desc",
      coverPath: COVER_PATH,
    });
    expect(revalidatePath).toHaveBeenCalledWith("/read");
  });

  test("clears the cover when coverPath is an empty string", async () => {
    vi.mocked(updateWebtoon).mockResolvedValueOnce(buildWebtoon({ id: "w1" }));

    const result = await updateWebtoonMetadataAction("w1", {
      title: "Titre",
      coverPath: "",
    });

    expect(result).toEqual({ ok: true });
    expect(updateWebtoon).toHaveBeenCalledWith(
      "w1",
      expect.objectContaining({ title: "Titre", coverPath: null }),
    );
    expect(revalidatePath).toHaveBeenCalledWith("/read");
  });

  test("leaves the cover untouched when coverPath is omitted", async () => {
    vi.mocked(updateWebtoon).mockResolvedValueOnce(buildWebtoon({ id: "w1" }));

    const result = await updateWebtoonMetadataAction("w1", {
      title: "Titre",
      description: "Desc",
    });

    expect(result).toEqual({ ok: true });
    expect(vi.mocked(updateWebtoon).mock.calls[0][1]).not.toHaveProperty(
      "coverPath",
    );
  });

  test("rejects a cover path longer than 512 characters", async () => {
    const result = await updateWebtoonMetadataAction("w1", {
      title: "Titre",
      coverPath: `webtoons/covers/w1/${"a".repeat(513)}.webp`,
    });

    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
    expect(updateWebtoon).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  test("rejects a whitespace-only cover path", async () => {
    const result = await updateWebtoonMetadataAction("w1", {
      title: "Titre",
      coverPath: "   ",
    });

    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
    expect(updateWebtoon).not.toHaveBeenCalled();
  });
});

describe("saveWebtoon — defensive webtoonId", () => {
  const baseSection = {
    id: "s-new",
    webtoonId: "attacker-webtoon",
    position: 0,
    type: "image" as const,
    config: {
      type: "image" as const,
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
        sectionId: "s-new",
        webtoonId: "attacker-webtoon",
        storagePath: "webtoons/sections/s-new/1.webp",
        width: 800,
        height: 1200,
        mimeType: "image/webp",
        position: 0,
      },
    ],
  };

  test("creates sections and images under the validated webtoonId", async () => {
    const result = await saveWebtoon("w1", [baseSection]);

    expect(result.ok).toBe(true);
    expect(createSection).toHaveBeenCalledWith(
      expect.objectContaining({ webtoonId: "w1" }),
    );

    const fromCalls = vi.mocked(supabase.from).mock.calls;
    const imagesIndex = fromCalls.map((call) => call[0]).lastIndexOf("images");
    const chain = vi.mocked(supabase.from).mock.results[imagesIndex].value;
    expect(chain.insert).toHaveBeenCalledWith([
      expect.objectContaining({ webtoon_id: "w1", section_id: "new-id" }),
    ]);
  });

  test("scopes existing-section updates to the validated webtoonId", async () => {
    vi.mocked(getWebtoon).mockResolvedValueOnce(
      buildWebtoonWithSections([
        {
          id: "s1",
          webtoonId: "w1",
          position: 0,
          type: "image",
          config: { type: "image", imagePath: "kept.webp", width: 800, height: 1200 },
          audioPath: undefined,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
          images: [],
        },
      ]),
    );

    const select = vi.fn().mockResolvedValue({ data: [{ id: "s1" }], error: null });
    const eqWebtoon = vi.fn(() => ({ select }));
    const eqId = vi.fn(() => ({ eq: eqWebtoon }));
    const update = vi.fn(() => ({ eq: eqId }));
    vi.mocked(supabase.from).mockImplementationOnce(() => ({ update }) as never);

    const result = await saveWebtoon("w1", [
      {
        id: "s1",
        webtoonId: "attacker-webtoon",
        position: 0,
        type: "image",
        config: { type: "image", imagePath: "kept.webp", width: 800, height: 1200 },
        audioPath: undefined,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        images: [],
      },
    ]);

    expect(result.ok).toBe(true);
    expect(eqWebtoon).toHaveBeenCalledWith("webtoon_id", "w1");
  });

  test("fails when the section update affects zero rows", async () => {
    vi.mocked(getWebtoon).mockResolvedValueOnce(
      buildWebtoonWithSections([
        {
          id: "s1",
          webtoonId: "w1",
          position: 0,
          type: "image",
          config: { type: "image", imagePath: "kept.webp", width: 800, height: 1200 },
          audioPath: undefined,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
          images: [],
        },
      ]),
    );

    const select = vi.fn().mockResolvedValue({ data: [], error: null });
    const eqWebtoon = vi.fn(() => ({ select }));
    const eqId = vi.fn(() => ({ eq: eqWebtoon }));
    const update = vi.fn(() => ({ eq: eqId }));
    vi.mocked(supabase.from).mockImplementationOnce(() => ({ update }) as never);

    const result = await saveWebtoon("w1", [
      {
        id: "s1",
        webtoonId: "w1",
        position: 0,
        type: "image",
        config: { type: "image", imagePath: "kept.webp", width: 800, height: 1200 },
        audioPath: undefined,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        images: [],
      },
    ]);

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/introuvable|aucune section/i);
    expect(reorderSections).not.toHaveBeenCalled();
  });
});

describe("publishWebtoon — publication guards", () => {
  test("refuses to publish a webtoon with zero sections", async () => {
    vi.mocked(getWebtoon).mockResolvedValueOnce(buildWebtoonWithSections([]));

    const result = await publishWebtoon("w1");

    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
    expect(updateWebtoon).not.toHaveBeenCalled();
  });

  test("refuses to publish a missing webtoon", async () => {
    vi.mocked(getWebtoon).mockResolvedValueOnce(null);

    const result = await publishWebtoon("w1");

    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
    expect(updateWebtoon).not.toHaveBeenCalled();
  });

  test("publishes and revalidates the reader and editor routes", async () => {
    vi.mocked(getWebtoon).mockResolvedValueOnce(
      buildWebtoonWithSections([
        {
          id: "s1",
          webtoonId: "w1",
          position: 0,
          type: "image",
          config: { type: "image", imagePath: "a.webp", width: 800, height: 1200 },
          audioPath: undefined,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
          images: [],
        },
      ]),
    );
    vi.mocked(updateWebtoon).mockResolvedValueOnce(buildWebtoon({ id: "w1" }));

    const result = await publishWebtoon("w1");

    expect(result).toEqual({ ok: true });
    expect(updateWebtoon).toHaveBeenCalledWith("w1", { visibility: "published" });
    expect(revalidatePath).toHaveBeenCalledWith("/read");
    expect(revalidatePath).toHaveBeenCalledWith("/read/w1");
    expect(revalidatePath).toHaveBeenCalledWith("/editor/w1");
  });
});

describe("deleteWebtoonAction — storage cleanup resilience", () => {
  test("still deletes the database row and returns ok when Storage cleanup throws", async () => {
    vi.mocked(getWebtoon).mockResolvedValueOnce(
      buildWebtoonWithSections([
        {
          id: "s1",
          webtoonId: "w1",
          position: 0,
          type: "image",
          config: { type: "image", imagePath: "cover.webp", width: 800, height: 1200 },
          audioPath: undefined,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
          images: [
            {
              id: "img-1",
              sectionId: "s1",
              webtoonId: "w1",
              storagePath: "webtoons/sections/s1/1.webp",
              width: 800,
              height: 1200,
              mimeType: "image/webp",
              position: 0,
            },
          ],
        },
      ]),
    );
    vi.mocked(supabase.storage.from).mockImplementationOnce(() => {
      throw new Error("storage down");
    });

    const result = await deleteWebtoonAction("w1");

    expect(result).toEqual({ ok: true });
    expect(deleteWebtoon).toHaveBeenCalledWith("w1");
    expect(revalidatePath).toHaveBeenCalledWith("/editor");
    expect(revalidatePath).toHaveBeenCalledWith("/read");
  });
});
