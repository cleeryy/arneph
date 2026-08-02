import { describe, expect, test, vi, beforeEach } from "vitest";

import {
  saveWebtoon,
  publishWebtoon,
  unpublishWebtoon,
  deleteWebtoonAction,
} from "@/app/editor/actions";

vi.mock("@/lib/db/server", () => ({
  supabase: vi.fn(() => ({
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
  })),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
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