import { beforeEach, describe, expect, test, vi } from "vitest";

const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }));

vi.mock("@/lib/db/server", () => ({
  supabase: { from: fromMock },
}));

import {
  createWebtoon,
  deleteSection,
  deleteSectionsByIds,
  deleteWebtoon,
  getWebtoon,
  getWebtoonCoverPath,
  updateWebtoon,
} from "@/lib/db/queries";

const WEBTOON_ID = "11111111-1111-4111-8111-111111111111";
const SECTION_ID = "22222222-2222-4222-8222-222222222222";

interface QueryResult {
  data: unknown;
  error: { message?: string; code?: string } | null;
}

/** Chaîne PostgREST minimale et thenable, comme le vrai client Supabase. */
function queryChain(result: QueryResult) {
  const builder: Record<string, unknown> = {};
  for (const method of [
    "insert",
    "update",
    "delete",
    "select",
    "eq",
    "in",
    "single",
    "maybeSingle",
  ]) {
    builder[method] = vi.fn(() => builder);
  }
  builder.then = (resolve: (value: QueryResult) => unknown) => resolve(result);
  return builder;
}

const webtoonRow = {
  id: WEBTOON_ID,
  title: "Titre",
  description: null,
  cover_path: null,
  visibility: "draft" as const,
  settings: {},
  revision: 2,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

beforeEach(() => {
  fromMock.mockReset();
});

describe("createWebtoon", () => {
  test("preserves the Postgres error code so callers can detect duplicate titles", async () => {
    fromMock.mockReturnValueOnce(
      queryChain({
        data: null,
        error: {
          message:
            'duplicate key value violates unique constraint "unique_webtoons_title"',
          code: "23505",
        },
      }),
    );

    await expect(createWebtoon({ title: "Nouveau webtoon" })).rejects.toMatchObject({
      code: "23505",
      message: expect.stringContaining("unique_webtoons_title"),
    });
  });

  test("maps a created row to the camelCase domain shape", async () => {
    fromMock.mockReturnValueOnce(queryChain({ data: webtoonRow, error: null }));

    const webtoon = await createWebtoon({ title: "Titre" });

    expect(webtoon).toEqual({
      id: WEBTOON_ID,
      title: "Titre",
      description: undefined,
      coverPath: undefined,
      visibility: "draft",
      settings: {},
      revision: 2,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
  });

  test("falls back to revision 0 for rows predating the revision column", async () => {
    const legacyRow = { ...webtoonRow, revision: undefined };
    fromMock.mockReturnValueOnce(queryChain({ data: legacyRow, error: null }));

    const webtoon = await createWebtoon({ title: "Titre" });

    expect(webtoon.revision).toBe(0);
  });
});

describe("updateWebtoon", () => {
  test("returns null when no row matches (caller treats it as not found)", async () => {
    fromMock.mockReturnValueOnce(queryChain({ data: null, error: null }));

    await expect(
      updateWebtoon(WEBTOON_ID, { title: "Titre" }),
    ).resolves.toBeNull();
  });

  test("propagates duplicate-title errors with their Postgres code", async () => {
    fromMock.mockReturnValueOnce(
      queryChain({
        data: null,
        error: {
          message:
            'duplicate key value violates unique constraint "unique_webtoons_title"',
          code: "23505",
        },
      }),
    );

    await expect(
      updateWebtoon(WEBTOON_ID, { title: "Doublon" }),
    ).rejects.toMatchObject({
      code: "23505",
    });
  });

  test("maps null description/coverPath to SQL NULL instead of dropping the field", async () => {
    const chain = queryChain({ data: webtoonRow, error: null });
    fromMock.mockReturnValueOnce(chain);

    await updateWebtoon(WEBTOON_ID, { description: null, coverPath: null });

    expect(chain.update).toHaveBeenCalledWith({
      description: null,
      cover_path: null,
    });
  });

  test("does not query the database for a non-UUID id", async () => {
    await expect(updateWebtoon("w1", { title: "Titre" })).resolves.toBeNull();
    expect(fromMock).not.toHaveBeenCalled();
  });
});

describe("deleteWebtoon", () => {
  test("returns true when a row was deleted", async () => {
    fromMock.mockReturnValueOnce(
      queryChain({ data: { id: WEBTOON_ID }, error: null }),
    );

    await expect(deleteWebtoon(WEBTOON_ID)).resolves.toBe(true);
  });

  test("returns false when no row matched", async () => {
    fromMock.mockReturnValueOnce(queryChain({ data: null, error: null }));

    await expect(deleteWebtoon(WEBTOON_ID)).resolves.toBe(false);
  });

  test("returns false without querying for a non-UUID id", async () => {
    await expect(deleteWebtoon("w1")).resolves.toBe(false);
    expect(fromMock).not.toHaveBeenCalled();
  });
});

describe("deleteSection", () => {
  test("returns false when no row matched", async () => {
    fromMock.mockReturnValueOnce(queryChain({ data: null, error: null }));

    await expect(deleteSection(SECTION_ID)).resolves.toBe(false);
  });

  test("returns true when the row was deleted", async () => {
    fromMock.mockReturnValueOnce(
      queryChain({ data: { id: SECTION_ID }, error: null }),
    );

    await expect(deleteSection(SECTION_ID)).resolves.toBe(true);
  });

  test("returns false without querying for a non-UUID id", async () => {
    await expect(deleteSection("s1")).resolves.toBe(false);
    expect(fromMock).not.toHaveBeenCalled();
  });
});

describe("deleteSectionsByIds", () => {
  test("deletes only valid ids for the given webtoon and returns the row count", async () => {
    const chain = queryChain({
      data: [{ id: SECTION_ID }, { id: "33333333-3333-4333-8333-333333333333" }],
      error: null,
    });
    fromMock.mockReturnValueOnce(chain);

    const deleted = await deleteSectionsByIds(WEBTOON_ID, [
      SECTION_ID,
      "not-a-uuid",
      "33333333-3333-4333-8333-333333333333",
    ]);

    expect(deleted).toBe(2);
    expect(chain.in).toHaveBeenCalledWith("id", [
      SECTION_ID,
      "33333333-3333-4333-8333-333333333333",
    ]);
    expect(chain.eq).toHaveBeenCalledWith("webtoon_id", WEBTOON_ID);
  });

  test("returns 0 without querying when the webtoon id is invalid", async () => {
    await expect(deleteSectionsByIds("w1", [SECTION_ID])).resolves.toBe(0);
    expect(fromMock).not.toHaveBeenCalled();
  });

  test("returns 0 when no id is a valid UUID", async () => {
    await expect(
      deleteSectionsByIds(WEBTOON_ID, ["s1", "s2"]),
    ).resolves.toBe(0);
    expect(fromMock).not.toHaveBeenCalled();
  });
});

describe("getWebtoon / getWebtoonCoverPath — UUID guards", () => {
  test("getWebtoon returns null without querying for a non-UUID id", async () => {
    await expect(getWebtoon("foo")).resolves.toBeNull();
    expect(fromMock).not.toHaveBeenCalled();
  });

  test("getWebtoonCoverPath returns the stored path", async () => {
    fromMock.mockReturnValueOnce(
      queryChain({
        data: { cover_path: "webtoons/covers/w1/cover.webp" },
        error: null,
      }),
    );

    await expect(getWebtoonCoverPath(WEBTOON_ID)).resolves.toBe(
      "webtoons/covers/w1/cover.webp",
    );
  });

  test("getWebtoonCoverPath returns null without querying for a non-UUID id", async () => {
    await expect(getWebtoonCoverPath("w1")).resolves.toBeNull();
    expect(fromMock).not.toHaveBeenCalled();
  });
});
