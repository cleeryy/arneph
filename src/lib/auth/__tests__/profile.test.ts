import { beforeEach, describe, expect, test, vi } from "vitest";

const getUser = vi.hoisted(() => vi.fn());
const from = vi.hoisted(() => vi.fn());

// `server-only` lève une erreur hors du runtime React Server ; ce module est
// volontairement serveur, on neutralise donc uniquement le marqueur de build.
vi.mock("server-only", () => ({}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ auth: { getUser }, from })),
}));

type QueryBuilder = {
  select: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  maybeSingle: ReturnType<typeof vi.fn>;
};

function mockProfileQuery(result: { data: unknown; error: unknown }): QueryBuilder {
  const builder = {} as QueryBuilder;
  builder.select = vi.fn(() => builder);
  builder.eq = vi.fn(() => builder);
  builder.maybeSingle = vi.fn().mockResolvedValue(result);
  from.mockReturnValue(builder);
  return builder;
}

beforeEach(() => {
  vi.resetModules();
  getUser.mockReset();
  from.mockReset();
});

describe("getCurrentProfile", () => {
  test("returns null when there is no authenticated user", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });

    const { getCurrentProfile } = await import("@/lib/auth/profile");

    await expect(getCurrentProfile()).resolves.toBeNull();
    expect(from).not.toHaveBeenCalled();
  });

  test("returns null when the auth server rejects the token", async () => {
    getUser.mockResolvedValue({
      data: { user: null },
      error: { message: "invalid JWT" },
    });

    const { getCurrentProfile } = await import("@/lib/auth/profile");

    await expect(getCurrentProfile()).resolves.toBeNull();
    expect(from).not.toHaveBeenCalled();
  });

  test("maps the profile row to camelCase", async () => {
    getUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    const builder = mockProfileQuery({
      data: {
        id: "user-1",
        email: "owner@example.com",
        display_name: "Clery",
        created_at: "2026-11-08T10:00:00.000Z",
        updated_at: "2026-11-08T11:00:00.000Z",
      },
      error: null,
    });

    const { getCurrentProfile } = await import("@/lib/auth/profile");

    await expect(getCurrentProfile()).resolves.toEqual({
      id: "user-1",
      email: "owner@example.com",
      displayName: "Clery",
      createdAt: "2026-11-08T10:00:00.000Z",
      updatedAt: "2026-11-08T11:00:00.000Z",
    });

    expect(from).toHaveBeenCalledWith("profiles");
    expect(builder.select).toHaveBeenCalledWith(
      "id, email, display_name, created_at, updated_at",
    );
    expect(builder.eq).toHaveBeenCalledWith("id", "user-1");
  });

  test("keeps a null display_name when the profile has none", async () => {
    getUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    mockProfileQuery({
      data: {
        id: "user-1",
        email: "owner@example.com",
        display_name: null,
        created_at: "2026-11-08T10:00:00.000Z",
        updated_at: "2026-11-08T10:00:00.000Z",
      },
      error: null,
    });

    const { getCurrentProfile } = await import("@/lib/auth/profile");

    await expect(getCurrentProfile()).resolves.toMatchObject({
      displayName: null,
    });
  });

  test("returns null when the profile row is missing", async () => {
    getUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    mockProfileQuery({ data: null, error: null });

    const { getCurrentProfile } = await import("@/lib/auth/profile");

    await expect(getCurrentProfile()).resolves.toBeNull();
  });

  test("returns null when the profile query fails", async () => {
    getUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    mockProfileQuery({
      data: null,
      error: { message: "permission denied for table profiles" },
    });

    const { getCurrentProfile } = await import("@/lib/auth/profile");

    await expect(getCurrentProfile()).resolves.toBeNull();
  });
});
