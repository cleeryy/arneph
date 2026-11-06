import { beforeEach, describe, expect, test, vi } from "vitest";

const getUser = vi.hoisted(() => vi.fn());
const getSession = vi.hoisted(() => vi.fn());

// `server-only` lève une erreur hors du runtime React Server ; ce module est
// volontairement serveur, on neutralise donc uniquement le marqueur de build.
vi.mock("server-only", () => ({}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser, getSession },
  })),
}));

beforeEach(() => {
  vi.resetModules();
  getUser.mockReset();
  getSession.mockReset();
  getSession.mockResolvedValue({ data: { session: null }, error: null });
});

describe("getCurrentUser", () => {
  test("returns null when there is no authenticated user", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });

    const { getCurrentUser } = await import("@/lib/auth/require-user");

    await expect(getCurrentUser()).resolves.toBeNull();
    expect(getSession).not.toHaveBeenCalled();
  });

  test("returns null when the auth server rejects the token", async () => {
    getUser.mockResolvedValue({
      data: { user: null },
      error: { message: "invalid JWT" },
    });

    const { getCurrentUser } = await import("@/lib/auth/require-user");

    await expect(getCurrentUser()).resolves.toBeNull();
    expect(getSession).not.toHaveBeenCalled();
  });

  test("returns the id and email of a valid user", async () => {
    getUser.mockResolvedValue({
      data: {
        user: {
          id: "11111111-1111-4111-8111-111111111111",
          email: "owner@example.com",
        },
      },
      error: null,
    });

    const { getCurrentUser } = await import("@/lib/auth/require-user");

    await expect(getCurrentUser()).resolves.toEqual({
      id: "11111111-1111-4111-8111-111111111111",
      email: "owner@example.com",
    });
    expect(getSession).not.toHaveBeenCalled();
  });
});

describe("requireUser", () => {
  test("refuses an unauthenticated caller with a serializable result", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });

    const { requireUser } = await import("@/lib/auth/require-user");

    await expect(requireUser()).resolves.toEqual({
      ok: false,
      error: "unauthenticated",
    });
  });

  test("returns the user when authenticated", async () => {
    getUser.mockResolvedValue({
      data: {
        user: {
          id: "11111111-1111-4111-8111-111111111111",
          email: null,
        },
      },
      error: null,
    });

    const { requireUser } = await import("@/lib/auth/require-user");

    await expect(requireUser()).resolves.toEqual({
      ok: true,
      user: {
        id: "11111111-1111-4111-8111-111111111111",
        email: null,
      },
    });
  });
});

describe("requireUserOrRedirect", () => {
  test("redirects to /login with the encoded internal path", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });

    const { requireUserOrRedirect } = await import("@/lib/auth/require-user");

    await expect(
      requireUserOrRedirect("/editor/11111111-2222-4333-8444-555555555555"),
    ).rejects.toThrow(
      "NEXT_REDIRECT:/login?next=%2Feditor%2F11111111-2222-4333-8444-555555555555",
    );
  });

  test("does not redirect an authenticated user", async () => {
    getUser.mockResolvedValue({
      data: {
        user: {
          id: "11111111-1111-4111-8111-111111111111",
          email: "owner@example.com",
        },
      },
      error: null,
    });

    const { requireUserOrRedirect } = await import("@/lib/auth/require-user");

    await expect(requireUserOrRedirect("/editor")).resolves.toEqual({
      id: "11111111-1111-4111-8111-111111111111",
      email: "owner@example.com",
    });
  });
});
