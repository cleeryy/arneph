import { beforeEach, describe, expect, test, vi } from "vitest";

const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }));

vi.mock("@/lib/db/server", () => ({
  supabase: { from: fromMock },
}));

import { createWebtoon, updateWebtoon } from "@/lib/db/queries";

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
    "select",
    "eq",
    "single",
    "maybeSingle",
  ]) {
    builder[method] = vi.fn(() => builder);
  }
  builder.then = (resolve: (value: QueryResult) => unknown) => resolve(result);
  return builder;
}

const webtoonRow = {
  id: "w1",
  title: "Titre",
  description: null,
  cover_path: null,
  visibility: "draft" as const,
  settings: {},
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
      id: "w1",
      title: "Titre",
      description: undefined,
      coverPath: undefined,
      visibility: "draft",
      settings: {},
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
  });
});

describe("updateWebtoon", () => {
  test("returns null when no row matches (caller treats it as not found)", async () => {
    fromMock.mockReturnValueOnce(queryChain({ data: null, error: null }));

    await expect(updateWebtoon("missing", { title: "Titre" })).resolves.toBeNull();
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

    await expect(updateWebtoon("w1", { title: "Doublon" })).rejects.toMatchObject({
      code: "23505",
    });
  });
});
