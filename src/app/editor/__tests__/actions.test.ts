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
import { requireUser } from "@/lib/auth/require-user";
import {
  createWebtoon,
  deleteWebtoon,
  getWebtoon,
  getWebtoonCoverPath,
  updateWebtoon,
} from "@/lib/db/queries";

const TEST_USER_ID = "11111111-1111-4111-8111-111111111111";

vi.mock("@/lib/auth/require-user", () => ({
  requireUser: vi.fn(async () => ({
    ok: true,
    user: {
      id: "11111111-1111-4111-8111-111111111111",
      email: "test@example.com",
    },
  })),
}));

vi.mock("@/lib/db/server", () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      upsert: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      single: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockReturnThis(),
      then: vi.fn((resolve: (v: unknown) => unknown) =>
        resolve({ data: [{ id: "s1" }], error: null }),
      ),
    })),
    rpc: vi.fn(),
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
  getWebtoon: vi.fn().mockResolvedValue({
    id: "w1",
    title: "Test",
    description: undefined,
    coverPath: undefined,
    visibility: "draft",
    settings: {},
    revision: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    sections: [],
  }),
  createWebtoon: vi.fn(),
  deleteWebtoon: vi.fn().mockResolvedValue(true),
  getWebtoonCoverPath: vi.fn().mockResolvedValue(null),
  updateWebtoon: vi.fn().mockResolvedValue(null),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(supabase.from).mockReset();
  vi.mocked(supabase.from).mockImplementation(
    () =>
      ({
        select: vi.fn().mockReturnThis(),
        insert: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        upsert: vi.fn().mockReturnThis(),
        delete: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
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
  // Le RPC transactionnel réussit par défaut (revision 1) ; les tests de
  // conflit ou d'échec surchargent explicitement la réponse.
  vi.mocked(supabase.rpc).mockReset();
  vi.mocked(supabase.rpc).mockResolvedValue({
    data: { revision: 1 },
    error: null,
  } as never);
  vi.mocked(deleteWebtoon).mockReset();
  vi.mocked(deleteWebtoon).mockResolvedValue(true);
  vi.mocked(getWebtoonCoverPath).mockReset();
  vi.mocked(getWebtoonCoverPath).mockResolvedValue(null);
  vi.mocked(requireUser).mockReset();
  vi.mocked(requireUser).mockResolvedValue({
    ok: true,
    user: { id: TEST_USER_ID, email: "test@example.com" },
  });
});

describe("saveWebtoon — zod validation", () => {
  const timestamps = {
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };

  function buildSection(id: string) {
    return {
      id,
      webtoonId: "w1",
      position: 0,
      type: "image" as const,
      config: {
        type: "image" as const,
        imagePath: "test.webp",
        width: 800,
        height: 1200,
      },
      audioPath: undefined,
      ...timestamps,
      images: [],
    };
  }

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

  test("rejects duplicate section ids", async () => {
    const result = await saveWebtoon("w1", [
      buildSection("s1"),
      { ...buildSection("s1"), position: 1 },
    ]);

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/identifiants de section/i);
  });

  test("rejects duplicate image ids within a section", async () => {
    const image = {
      id: "img-1",
      sectionId: "s1",
      webtoonId: "w1",
      storagePath: "webtoons/sections/s1/1.webp",
      width: 800,
      height: 1200,
      mimeType: "image/webp",
      position: 0,
    };
    const result = await saveWebtoon("w1", [
      {
        ...buildSection("s1"),
        images: [image, { ...image, position: 1 }],
      },
    ]);

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/identifiants d'image/i);
  });

  test("rejects more than 20 images in a section", async () => {
    const images = Array.from({ length: 21 }, (_, index) => ({
      id: `img-${index}`,
      sectionId: "s1",
      webtoonId: "w1",
      storagePath: `webtoons/sections/s1/${index}.webp`,
      width: 800,
      height: 1200,
      mimeType: "image/webp",
      position: index,
    }));
    const result = await saveWebtoon("w1", [
      { ...buildSection("s1"), images },
    ]);

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/20 images/i);
  });

  test("rejects more than 500 sections", async () => {
    const sections = Array.from({ length: 501 }, (_, index) => ({
      ...buildSection(`s-${index}`),
      position: index,
    }));

    const result = await saveWebtoon("w1", sections);

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/500 sections/i);
  });

  test("rejects non-integer image dimensions", async () => {
    const result = await saveWebtoon("w1", [
      {
        ...buildSection("s1"),
        images: [
          {
            id: "img-1",
            sectionId: "s1",
            webtoonId: "w1",
            storagePath: "webtoons/sections/s1/1.webp",
            width: 800.5,
            height: 1200,
            mimeType: "image/webp",
            position: 0,
          },
        ],
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
  test("saveWebtoon with fxPath/fxConfig on image section sends the full config to the RPC", async () => {
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
    expect(supabase.rpc).toHaveBeenCalledWith(
      "save_webtoon",
      expect.objectContaining({
        p_sections: [
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
        ],
      }),
    );
  });

  test("sends client section and image ids to the RPC (idempotent server ids)", async () => {
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
    expect(supabase.rpc).toHaveBeenCalledWith(
      "save_webtoon",
      expect.objectContaining({
        p_sections: [
          expect.objectContaining({
            id: "client-temp-id",
            images: [
              expect.objectContaining({
                id: "img-1",
                sectionId: "client-temp-id",
                storagePath: "webtoons/sections/client-temp-id/1.webp",
              }),
            ],
          }),
        ],
      }),
    );
  });

    test("saveWebtoon with existing section sends the full fx config to the RPC", async () => {
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

      expect(supabase.rpc).toHaveBeenCalledWith(
        "save_webtoon",
        expect.objectContaining({
          p_sections: [
            expect.objectContaining({
              id: "s1",
              config: expect.objectContaining({
                fxPath: "fx/overlay.gif",
                fxConfig: {
                  position: { x: "center", y: "center" },
                  size: { mode: "px", width: 100, height: 100 },
                  opacity: 0.5,
                },
              }),
            }),
          ],
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
    expect(supabase.rpc).toHaveBeenCalledWith(
      "save_webtoon",
      expect.objectContaining({
        p_sections: [
          expect.objectContaining({
            config: expect.objectContaining({
              type: "image",
              imagePath: "test.webp",
              width: 800,
              height: 1200,
            }),
          }),
        ],
      }),
    );
  });
});

describe("saveWebtoon — revision and transactional RPC contract", () => {
  test("passes webtoon id, owner id and expected revision to save_webtoon", async () => {
    const result = await saveWebtoon("w1", [], 7);

    expect(result).toEqual({ ok: true, revision: 1 });
    expect(supabase.rpc).toHaveBeenCalledWith("save_webtoon", {
      p_webtoon_id: "w1",
      p_owner_id: TEST_USER_ID,
      p_expected_revision: 7,
      p_sections: [],
    });
    expect(revalidatePath).toHaveBeenCalledWith("/editor/w1");
    expect(revalidatePath).toHaveBeenCalledWith("/read");
  });

  test("sends a null expected revision when the caller omits it", async () => {
    await saveWebtoon("w1", []);

    expect(supabase.rpc).toHaveBeenCalledWith(
      "save_webtoon",
      expect.objectContaining({ p_expected_revision: null }),
    );
  });

  test("returns the revision produced by the RPC", async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: { revision: 42 },
      error: null,
    } as never);

    const result = await saveWebtoon("w1", []);

    expect(result).toEqual({ ok: true, revision: 42 });
  });

  test("maps REVISION_CONFLICT to a conflict result without touching Storage", async () => {
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
    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: null,
      error: { message: "REVISION_CONFLICT", code: "40001" },
    } as never);
    const removeMock = vi.fn().mockResolvedValue({ data: null, error: null });
    vi.mocked(supabase.storage.from).mockReturnValue({
      list: vi.fn().mockResolvedValue({ data: [], error: null }),
      remove: removeMock,
    } as unknown as ReturnType<typeof supabase.storage.from>);

    const result = await saveWebtoon("w1", [], 2);

    expect(result).toEqual({
      ok: false,
      conflict: true,
      error: expect.stringMatching(/autre session/),
    });
    expect(removeMock).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  test("treats SQLSTATE 40001 as a conflict even without the message", async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: null,
      error: { message: "could not serialize access", code: "40001" },
    } as never);

    const result = await saveWebtoon("w1", [], 0);

    expect(result).toMatchObject({ ok: false, conflict: true });
  });

  test("surfaces WEBTOON_NOT_FOUND when the row disappears before the RPC", async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: null,
      error: { message: "WEBTOON_NOT_FOUND", code: "P0002" },
    } as never);

    const result = await saveWebtoon("w1", []);

    expect(result).toEqual({ ok: false, error: "Webtoon introuvable." });
  });

  test("does not issue direct section or image writes (all in the RPC)", async () => {
    await saveWebtoon("w1", [
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

    const tables = vi.mocked(supabase.from).mock.calls.map((call) => call[0]);
    expect(tables).not.toContain("sections");
    expect(tables).not.toContain("images");
    expect(supabase.rpc).toHaveBeenCalledTimes(1);
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

  test("does not delete removed-section Storage objects when the RPC fails", async () => {
    vi.mocked(getWebtoon).mockResolvedValueOnce(currentWithRemovedSection);
    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: null,
      error: { message: "save boom" },
    } as never);
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

  test("deletes removed-section Storage objects after a successful RPC", async () => {
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
    // La transaction d'abord : aucun fichier supprimé avant le RPC.
    expect(
      vi.mocked(supabase.rpc).mock.invocationCallOrder[0],
    ).toBeLessThan(removeMock.mock.invocationCallOrder[0]);
  });
});

describe("saveWebtoon — removed sections handled by the RPC (P0-1)", () => {
  const timestamps = {
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };

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
    ...timestamps,
    images: [],
  };

  const removedSection = {
    id: "s2",
    webtoonId: "w1",
    position: 1,
    type: "image" as const,
    config: {
      type: "image" as const,
      imagePath: "removed.webp",
      width: 800,
      height: 1200,
    },
    audioPath: "removed-audio.mp3",
    ...timestamps,
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
  };

  test("sends only the retained sections to the RPC before Storage cleanup", async () => {
    vi.mocked(getWebtoon).mockResolvedValueOnce(
      buildWebtoonWithSections([keptSection, removedSection]),
    );
    const removeMock = vi.fn().mockResolvedValue({ data: null, error: null });
    vi.mocked(supabase.storage.from).mockReturnValue({
      list: vi.fn().mockResolvedValue({ data: [], error: null }),
      remove: removeMock,
    } as unknown as ReturnType<typeof supabase.storage.from>);

    const result = await saveWebtoon("w1", [keptSection]);

    expect(result.ok).toBe(true);
    expect(supabase.rpc).toHaveBeenCalledWith(
      "save_webtoon",
      expect.objectContaining({
        p_sections: [expect.objectContaining({ id: "s1" })],
      }),
    );
    const rpcPayload = vi.mocked(supabase.rpc).mock.calls[0][1] as {
      p_sections: { id: string }[];
    };
    expect(rpcPayload.p_sections.map((section) => section.id)).toEqual(["s1"]);

    const rpcOrder = vi.mocked(supabase.rpc).mock.invocationCallOrder[0];
    const storageOrder = removeMock.mock.invocationCallOrder[0];
    // La base d'abord : aucun fichier supprimé avant la transaction.
    expect(rpcOrder).toBeLessThan(storageOrder);
  });

  test("sections: [] sends an empty payload and cleans every asset", async () => {
    vi.mocked(getWebtoon).mockResolvedValueOnce(
      buildWebtoonWithSections([keptSection, removedSection]),
    );
    const removeMock = vi.fn().mockResolvedValue({ data: null, error: null });
    vi.mocked(supabase.storage.from).mockReturnValue({
      list: vi.fn().mockResolvedValue({ data: [], error: null }),
      remove: removeMock,
    } as unknown as ReturnType<typeof supabase.storage.from>);

    const result = await saveWebtoon("w1", []);

    expect(result).toEqual({ ok: true, revision: 1 });
    expect(supabase.rpc).toHaveBeenCalledWith(
      "save_webtoon",
      expect.objectContaining({ p_sections: [] }),
    );
    expect(removeMock).toHaveBeenCalledWith(
      expect.arrayContaining([
        "webtoons/sections/s2/1.webp",
        "removed.webp",
        "removed-audio.mp3",
      ]),
    );
  });

  test("returns Webtoon introuvable before calling the RPC when the webtoon is missing", async () => {
    vi.mocked(getWebtoon).mockResolvedValueOnce(null);
    const removeMock = vi.fn().mockResolvedValue({ data: null, error: null });
    vi.mocked(supabase.storage.from).mockReturnValue({
      list: vi.fn().mockResolvedValue({ data: [], error: null }),
      remove: removeMock,
    } as unknown as ReturnType<typeof supabase.storage.from>);

    const result = await saveWebtoon("w1", [
      {
        id: "s-new",
        webtoonId: "w1",
        position: 0,
        type: "image" as const,
        config: {
          type: "image" as const,
          imagePath: "new.webp",
          width: 800,
          height: 1200,
        },
        audioPath: undefined,
        ...timestamps,
        images: [],
      },
    ]);

    expect(result).toEqual({ ok: false, error: "Webtoon introuvable." });
    expect(supabase.rpc).not.toHaveBeenCalled();
    expect(removeMock).not.toHaveBeenCalled();
  });
});

describe("collectSectionStoragePaths — framePaths and keepPaths (DATA-6/7/8)", () => {
  test("removing an animation section deletes its framePaths and config audio", async () => {
    const timestamps = {
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    vi.mocked(getWebtoon).mockResolvedValueOnce(
      buildWebtoonWithSections([
        {
          id: "s1",
          webtoonId: "w1",
          position: 0,
          type: "image",
          config: { type: "image", imagePath: "kept.webp", width: 800, height: 1200 },
          audioPath: undefined,
          ...timestamps,
          images: [],
        },
        {
          id: "s2",
          webtoonId: "w1",
          position: 1,
          type: "animation",
          config: {
            type: "animation",
            spritePath: "sprite.webp",
            framePaths: [
              "webtoons/sections/s2/frames/1700000000000/0.webp",
              "webtoons/sections/s2/frames/1700000000000/1.webp",
            ],
            frameWidth: 100,
            frameHeight: 100,
            columns: 2,
            rows: 1,
            frameCount: 2,
            audioPath: "config-audio.mp3",
          },
          audioPath: "section-audio.mp3",
          ...timestamps,
          images: [],
        },
      ]),
    );
    const removeMock = vi.fn().mockResolvedValue({ data: null, error: null });
    vi.mocked(supabase.storage.from).mockReturnValue({
      list: vi.fn().mockResolvedValue({ data: [], error: null }),
      remove: removeMock,
    } as unknown as ReturnType<typeof supabase.storage.from>);

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
        ...timestamps,
        images: [],
      },
    ]);

    expect(result.ok).toBe(true);
    expect(removeMock).toHaveBeenCalledWith(
      expect.arrayContaining([
        "sprite.webp",
        "webtoons/sections/s2/frames/1700000000000/0.webp",
        "webtoons/sections/s2/frames/1700000000000/1.webp",
        "config-audio.mp3",
        "section-audio.mp3",
      ]),
    );
  });

  test("never deletes a path still referenced by an incoming section (keepPaths)", async () => {
    const timestamps = {
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    vi.mocked(getWebtoon).mockResolvedValueOnce(
      buildWebtoonWithSections([
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
          },
          audioPath: undefined,
          ...timestamps,
          images: [],
        },
        {
          id: "s2",
          webtoonId: "w1",
          position: 1,
          type: "image",
          config: {
            type: "image",
            imagePath: "shared.webp",
            width: 800,
            height: 1200,
          },
          audioPath: undefined,
          ...timestamps,
          images: [],
        },
      ]),
    );
    const removeMock = vi.fn().mockResolvedValue({ data: null, error: null });
    vi.mocked(supabase.storage.from).mockReturnValue({
      list: vi.fn().mockResolvedValue({ data: [], error: null }),
      remove: removeMock,
    } as unknown as ReturnType<typeof supabase.storage.from>);

    const result = await saveWebtoon("w1", [
      {
        id: "s1",
        webtoonId: "w1",
        position: 0,
        type: "image" as const,
        config: {
          type: "image" as const,
          imagePath: "shared.webp",
          width: 800,
          height: 1200,
        },
        audioPath: undefined,
        ...timestamps,
        images: [],
      },
    ]);

    expect(result.ok).toBe(true);
    for (const call of removeMock.mock.calls) {
      expect(call[0]).not.toContain("shared.webp");
    }
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

  test("does not remove replaced-file paths when the RPC fails", async () => {
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
    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: null,
      error: { message: "save boom" },
    } as never);
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
    revision: 0,
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
        ownerId: TEST_USER_ID,
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

  test("does not leak raw database errors to the client", async () => {
    vi.mocked(createWebtoon).mockRejectedValueOnce(
      new Error("db.createWebtoon failed: connection refused"),
    );

    const result = await createWebtoonAction();

    expect(result.ok).toBe(false);
    expect(result.error).not.toMatch(/connection refused/);
    expect(result.error).toMatch(/erreur est survenue/i);
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
    expect(updateWebtoon).toHaveBeenCalledWith(
      "w1",
      {
        title: "Titre renommé",
        description: "Nouvelle description",
      },
      TEST_USER_ID,
    );
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
    expect(updateWebtoon).toHaveBeenCalledWith(
      "w1",
      {
        title: "Titre",
        description: "Desc",
        coverPath: COVER_PATH,
      },
      TEST_USER_ID,
    );
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
      TEST_USER_ID,
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

  test("removes the previous cover object after a successful replacement", async () => {
    const NEW_COVER = "webtoons/covers/w1/new-cover.webp";
    vi.mocked(getWebtoonCoverPath).mockResolvedValueOnce(COVER_PATH);
    vi.mocked(updateWebtoon).mockResolvedValueOnce(
      buildWebtoon({ id: "w1", coverPath: NEW_COVER }),
    );
    const removeMock = vi.fn().mockResolvedValue({ data: null, error: null });
    vi.mocked(supabase.storage.from).mockReturnValue({
      list: vi.fn().mockResolvedValue({ data: [], error: null }),
      remove: removeMock,
    } as unknown as ReturnType<typeof supabase.storage.from>);

    const result = await updateWebtoonMetadataAction("w1", {
      title: "Titre",
      coverPath: NEW_COVER,
    });

    expect(result).toEqual({ ok: true });
    expect(removeMock).toHaveBeenCalledWith([COVER_PATH]);
  });

  test("removes the previous cover object when the cover is cleared", async () => {
    vi.mocked(getWebtoonCoverPath).mockResolvedValueOnce(COVER_PATH);
    vi.mocked(updateWebtoon).mockResolvedValueOnce(buildWebtoon({ id: "w1" }));
    const removeMock = vi.fn().mockResolvedValue({ data: null, error: null });
    vi.mocked(supabase.storage.from).mockReturnValue({
      list: vi.fn().mockResolvedValue({ data: [], error: null }),
      remove: removeMock,
    } as unknown as ReturnType<typeof supabase.storage.from>);

    const result = await updateWebtoonMetadataAction("w1", {
      title: "Titre",
      coverPath: "",
    });

    expect(result).toEqual({ ok: true });
    expect(removeMock).toHaveBeenCalledWith([COVER_PATH]);
  });

  test("keeps the previous cover when the update fails", async () => {
    vi.mocked(getWebtoonCoverPath).mockResolvedValueOnce(COVER_PATH);
    vi.mocked(updateWebtoon).mockResolvedValueOnce(null);
    const removeMock = vi.fn().mockResolvedValue({ data: null, error: null });
    vi.mocked(supabase.storage.from).mockReturnValue({
      list: vi.fn().mockResolvedValue({ data: [], error: null }),
      remove: removeMock,
    } as unknown as ReturnType<typeof supabase.storage.from>);

    const result = await updateWebtoonMetadataAction("w1", {
      title: "Titre",
      coverPath: "",
    });

    expect(result.ok).toBe(false);
    expect(removeMock).not.toHaveBeenCalled();
  });

  test("does not remove a cover that is still referenced", async () => {
    vi.mocked(getWebtoonCoverPath).mockResolvedValueOnce(COVER_PATH);
    vi.mocked(updateWebtoon).mockResolvedValueOnce(
      buildWebtoon({ id: "w1", coverPath: COVER_PATH }),
    );
    const removeMock = vi.fn().mockResolvedValue({ data: null, error: null });
    vi.mocked(supabase.storage.from).mockReturnValue({
      list: vi.fn().mockResolvedValue({ data: [], error: null }),
      remove: removeMock,
    } as unknown as ReturnType<typeof supabase.storage.from>);

    const result = await updateWebtoonMetadataAction("w1", {
      title: "Titre",
      coverPath: COVER_PATH,
    });

    expect(result).toEqual({ ok: true });
    expect(removeMock).not.toHaveBeenCalled();
  });

  test("normalizes an empty description to null", async () => {
    vi.mocked(updateWebtoon).mockResolvedValueOnce(buildWebtoon({ id: "w1" }));

    const result = await updateWebtoonMetadataAction("w1", {
      title: "Titre",
      description: "   ",
    });

    expect(result).toEqual({ ok: true });
    expect(updateWebtoon).toHaveBeenCalledWith(
      "w1",
      expect.objectContaining({ description: null }),
      TEST_USER_ID,
    );
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

  test("sends the validated webtoon and owner ids to the RPC", async () => {
    const result = await saveWebtoon("w1", [baseSection]);

    expect(result.ok).toBe(true);
    expect(supabase.rpc).toHaveBeenCalledWith(
      "save_webtoon",
      expect.objectContaining({
        p_webtoon_id: "w1",
        p_owner_id: TEST_USER_ID,
        p_sections: [expect.objectContaining({ id: "s-new" })],
      }),
    );
    // Le payload client ne pilote jamais le webtoon_id : la fonction le force.
    const payload = (
      vi.mocked(supabase.rpc).mock.calls[0][1] as {
        p_sections: { webtoonId?: string }[];
      }
    ).p_sections;
    expect(payload[0]?.webtoonId).toBe("attacker-webtoon");
  });

  test("surfaces a SECTION_NOT_OWNED error from the RPC", async () => {
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
    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: null,
      error: { message: "SECTION_NOT_OWNED", code: "42501" },
    } as never);

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
    expect(result.error).toMatch(/autre webtoon/);
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
    expect(updateWebtoon).toHaveBeenCalledWith(
      "w1",
      { visibility: "published" },
      TEST_USER_ID,
    );
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
    expect(deleteWebtoon).toHaveBeenCalledWith("w1", TEST_USER_ID);
    expect(revalidatePath).toHaveBeenCalledWith("/editor");
    expect(revalidatePath).toHaveBeenCalledWith("/read");
  });
});

describe("deleteWebtoonAction — DB before Storage (DATA-4) and cover cleanup", () => {
  const timestamps = {
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };

  function buildCurrent(overrides: { coverPath?: string } = {}) {
    return {
      ...buildWebtoon({ id: "w1", ...overrides }),
      sections: [
        {
          id: "s1",
          webtoonId: "w1",
          position: 0,
          type: "image" as const,
          config: {
            type: "image" as const,
            imagePath: "image.webp",
            width: 800,
            height: 1200,
          },
          audioPath: undefined,
          ...timestamps,
          images: [],
        },
      ],
    };
  }

  function mockStorage() {
    const removeMock = vi.fn().mockResolvedValue({ data: null, error: null });
    vi.mocked(supabase.storage.from).mockReturnValue({
      list: vi.fn().mockResolvedValue({ data: [], error: null }),
      remove: removeMock,
    } as unknown as ReturnType<typeof supabase.storage.from>);
    return { removeMock };
  }

  test("deletes the database row before removing any Storage object", async () => {
    vi.mocked(getWebtoon).mockResolvedValueOnce(buildCurrent());
    const { removeMock } = mockStorage();

    const result = await deleteWebtoonAction("w1");

    expect(result).toEqual({ ok: true });
    const dbOrder = vi.mocked(deleteWebtoon).mock.invocationCallOrder[0];
    const storageOrder = removeMock.mock.invocationCallOrder[0];
    expect(dbOrder).toBeLessThan(storageOrder);
  });

  test("does not remove any file when the database delete fails", async () => {
    vi.mocked(getWebtoon).mockResolvedValueOnce(buildCurrent());
    vi.mocked(deleteWebtoon).mockRejectedValueOnce(
      new Error("db.deleteWebtoon failed: boom"),
    );
    const { removeMock } = mockStorage();

    const result = await deleteWebtoonAction("w1");

    expect(result.ok).toBe(false);
    expect(removeMock).not.toHaveBeenCalled();
  });

  test("reports a missing webtoon without deleting Storage", async () => {
    vi.mocked(getWebtoon).mockResolvedValueOnce(null);
    vi.mocked(deleteWebtoon).mockResolvedValueOnce(false);
    const { removeMock } = mockStorage();

    const result = await deleteWebtoonAction("w1");

    expect(result).toEqual({ ok: false, error: "Webtoon introuvable." });
    expect(removeMock).not.toHaveBeenCalled();
  });

  test("removes the cover object in addition to section assets", async () => {
    vi.mocked(getWebtoon).mockResolvedValueOnce(
      buildCurrent({ coverPath: "webtoons/covers/w1/cover.webp" }),
    );
    const { removeMock } = mockStorage();

    const result = await deleteWebtoonAction("w1");

    expect(result).toEqual({ ok: true });
    expect(removeMock).toHaveBeenCalledWith(
      expect.arrayContaining(["webtoons/covers/w1/cover.webp"]),
    );
  });
});

describe("editor actions — authentication guard (P0-2)", () => {
  test("createWebtoonAction refuses an unauthenticated caller", async () => {
    vi.mocked(requireUser).mockResolvedValueOnce({
      ok: false,
      error: "unauthenticated",
    });

    const result = await createWebtoonAction();

    expect(result).toEqual({ ok: false, error: "unauthenticated" });
    expect(createWebtoon).not.toHaveBeenCalled();
  });

  test("saveWebtoon refuses an unauthenticated caller before reading the webtoon", async () => {
    vi.mocked(requireUser).mockResolvedValueOnce({
      ok: false,
      error: "unauthenticated",
    });

    const result = await saveWebtoon("w1", []);

    expect(result).toEqual({ ok: false, error: "unauthenticated" });
    expect(getWebtoon).not.toHaveBeenCalled();
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  test("deleteWebtoonAction refuses an unauthenticated caller", async () => {
    vi.mocked(requireUser).mockResolvedValueOnce({
      ok: false,
      error: "unauthenticated",
    });

    const result = await deleteWebtoonAction("w1");

    expect(result).toEqual({ ok: false, error: "unauthenticated" });
    expect(deleteWebtoon).not.toHaveBeenCalled();
  });

  test("publishWebtoon refuses an unauthenticated caller", async () => {
    vi.mocked(requireUser).mockResolvedValueOnce({
      ok: false,
      error: "unauthenticated",
    });

    const result = await publishWebtoon("w1");

    expect(result).toEqual({ ok: false, error: "unauthenticated" });
    expect(updateWebtoon).not.toHaveBeenCalled();
  });
});
