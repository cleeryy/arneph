import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const signInWithOtp = vi.hoisted(() => vi.fn());
const signOut = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { signInWithOtp, signOut },
  })),
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(
    async () => new Headers({ origin: "https://preview.arneph.test" }),
  ),
}));

import { sendMagicLink, signOut as signOutAction } from "@/lib/auth/actions";

function buildFormData(fields: Record<string, string>): FormData {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    formData.set(key, value);
  }
  return formData;
}

beforeEach(() => {
  signInWithOtp.mockReset();
  signInWithOtp.mockResolvedValue({ data: {}, error: null });
  signOut.mockReset();
  signOut.mockResolvedValue({ error: null });
  process.env.NEXT_PUBLIC_SITE_URL = "https://arneph.example";
});

afterEach(() => {
  delete process.env.NEXT_PUBLIC_SITE_URL;
});

describe("sendMagicLink", () => {
  test("rejects an invalid email without calling Supabase", async () => {
    const result = await sendMagicLink(
      { status: "idle" },
      buildFormData({ email: "not-an-email" }),
    );

    expect(result.status).toBe("error");
    expect(result.message).toMatch(/invalide/i);
    expect(signInWithOtp).not.toHaveBeenCalled();
  });

  test("sends a magic link with the site URL and shouldCreateUser", async () => {
    const result = await sendMagicLink(
      { status: "idle" },
      buildFormData({ email: "owner@example.com" }),
    );

    expect(result.status).toBe("success");
    expect(signInWithOtp).toHaveBeenCalledTimes(1);
    expect(signInWithOtp).toHaveBeenCalledWith({
      email: "owner@example.com",
      options: {
        emailRedirectTo:
          "https://arneph.example/auth/confirm?next=%2Feditor",
        shouldCreateUser: true,
      },
    });
  });

  test("preserves a valid internal next path", async () => {
    await sendMagicLink(
      { status: "idle" },
      buildFormData({ email: "owner@example.com", next: "/editor/abc" }),
    );

    expect(signInWithOtp).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          emailRedirectTo:
            "https://arneph.example/auth/confirm?next=%2Feditor%2Fabc",
        }),
      }),
    );
  });

  test("falls back to the request origin when NEXT_PUBLIC_SITE_URL is unset", async () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;

    await sendMagicLink(
      { status: "idle" },
      buildFormData({ email: "owner@example.com" }),
    );

    expect(signInWithOtp).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          emailRedirectTo:
            "https://preview.arneph.test/auth/confirm?next=%2Feditor",
        }),
      }),
    );
  });

  test("never leaks a raw Supabase error to the client", async () => {
    signInWithOtp.mockResolvedValueOnce({
      data: null,
      error: { message: "smtp connection refused: gmail smtp 587" },
    });

    const result = await sendMagicLink(
      { status: "idle" },
      buildFormData({ email: "owner@example.com" }),
    );

    expect(result.status).toBe("error");
    expect(result.message).not.toMatch(/smtp|gmail|587/i);
    expect(result.message).toMatch(/impossible/i);
  });
});

describe("signOut", () => {
  test("signs out and redirects to the home page", async () => {
    await expect(signOutAction()).rejects.toThrow("NEXT_REDIRECT:/");
    expect(signOut).toHaveBeenCalledTimes(1);
  });
});
