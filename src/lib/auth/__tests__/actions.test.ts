import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const signInWithOtp = vi.hoisted(() => vi.fn());
const signOut = vi.hoisted(() => vi.fn());
const signUp = vi.hoisted(() => vi.fn());
const signInWithPassword = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { signInWithOtp, signOut, signUp, signInWithPassword },
  })),
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(
    async () => new Headers({ origin: "https://preview.arneph.test" }),
  ),
}));

import {
  sendMagicLink,
  signInWithPasswordAction,
  signOut as signOutAction,
  signUpAction,
} from "@/lib/auth/actions";

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
  signUp.mockReset();
  signUp.mockResolvedValue({
    data: { user: null, session: null },
    error: null,
  });
  signInWithPassword.mockReset();
  signInWithPassword.mockResolvedValue({
    data: { user: null, session: null },
    error: null,
  });
  process.env.NEXT_PUBLIC_SITE_URL = "https://arneph.example";
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  delete process.env.NEXT_PUBLIC_SITE_URL;
  vi.restoreAllMocks();
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

describe("signUpAction", () => {
  test("creates the account and redirects to /editor when a session is returned", async () => {
    signUp.mockResolvedValueOnce({
      data: { user: { id: "user-1" }, session: { access_token: "token" } },
      error: null,
    });

    await expect(
      signUpAction(
        { status: "idle" },
        buildFormData({
          displayName: "  Clery  ",
          email: "owner@example.com",
          password: "supersecret",
          confirmPassword: "supersecret",
        }),
      ),
    ).rejects.toThrow("NEXT_REDIRECT:/editor");

    expect(signUp).toHaveBeenCalledWith({
      email: "owner@example.com",
      password: "supersecret",
      options: {
        data: { display_name: "Clery" },
        emailRedirectTo: "https://arneph.example/auth/confirm?next=%2Feditor",
      },
    });
  });

  test("sends an empty display_name when the field is omitted", async () => {
    signUp.mockResolvedValueOnce({
      data: { user: { id: "user-1" }, session: { access_token: "token" } },
      error: null,
    });

    await expect(
      signUpAction(
        { status: "idle" },
        buildFormData({
          email: "owner@example.com",
          password: "supersecret",
          confirmPassword: "supersecret",
        }),
      ),
    ).rejects.toThrow("NEXT_REDIRECT:/editor");

    expect(signUp).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({ data: { display_name: "" } }),
      }),
    );
  });

  test("preserves a valid internal next path", async () => {
    signUp.mockResolvedValueOnce({
      data: { user: { id: "user-1" }, session: { access_token: "token" } },
      error: null,
    });

    await expect(
      signUpAction(
        { status: "idle" },
        buildFormData({
          email: "owner@example.com",
          password: "supersecret",
          confirmPassword: "supersecret",
          next: "/account",
        }),
      ),
    ).rejects.toThrow("NEXT_REDIRECT:/account");

    expect(signUp).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          emailRedirectTo: "https://arneph.example/auth/confirm?next=%2Faccount",
        }),
      }),
    );
  });

  test("rejects an invalid email without calling Supabase", async () => {
    const result = await signUpAction(
      { status: "idle" },
      buildFormData({
        email: "not-an-email",
        password: "supersecret",
        confirmPassword: "supersecret",
      }),
    );

    expect(result.status).toBe("error");
    expect(result.message).toMatch(/invalide/i);
    expect(signUp).not.toHaveBeenCalled();
  });

  test("rejects mismatched passwords without calling Supabase", async () => {
    const result = await signUpAction(
      { status: "idle" },
      buildFormData({
        email: "owner@example.com",
        password: "supersecret",
        confirmPassword: "another-secret",
      }),
    );

    expect(result.status).toBe("error");
    expect(result.message).toBe("Les mots de passe ne correspondent pas.");
    expect(signUp).not.toHaveBeenCalled();
  });

  test("rejects a password shorter than 8 characters", async () => {
    const result = await signUpAction(
      { status: "idle" },
      buildFormData({
        email: "owner@example.com",
        password: "short",
        confirmPassword: "short",
      }),
    );

    expect(result.status).toBe("error");
    expect(result.message).toMatch(/8 caractères/);
    expect(signUp).not.toHaveBeenCalled();
  });

  test("maps an already-registered account to an explicit message", async () => {
    signUp.mockResolvedValueOnce({
      data: { user: null, session: null },
      error: { message: "User already registered" },
    });

    const result = await signUpAction(
      { status: "idle" },
      buildFormData({
        email: "owner@example.com",
        password: "supersecret",
        confirmPassword: "supersecret",
      }),
    );

    expect(result.status).toBe("error");
    expect(result.message).toBe("Un compte existe déjà avec cette adresse.");
  });

  test("never leaks a raw Supabase error to the client", async () => {
    signUp.mockResolvedValueOnce({
      data: { user: null, session: null },
      error: { message: "connection reset by peer" },
    });

    const result = await signUpAction(
      { status: "idle" },
      buildFormData({
        email: "owner@example.com",
        password: "supersecret",
        confirmPassword: "supersecret",
      }),
    );

    expect(result.status).toBe("error");
    expect(result.message).not.toMatch(/connection|reset|peer/i);
    expect(result.message).toMatch(/impossible/i);
  });

  test("returns a success state when email confirmation is required", async () => {
    signUp.mockResolvedValueOnce({
      data: { user: { id: "user-1" }, session: null },
      error: null,
    });

    const result = await signUpAction(
      { status: "idle" },
      buildFormData({
        email: "owner@example.com",
        password: "supersecret",
        confirmPassword: "supersecret",
      }),
    );

    expect(result.status).toBe("success");
    expect(result.message).toMatch(/vérifiez votre boîte mail/i);
  });
});

describe("signInWithPasswordAction", () => {
  test("signs in and redirects to /editor by default", async () => {
    signInWithPassword.mockResolvedValueOnce({
      data: { user: { id: "user-1" }, session: { access_token: "token" } },
      error: null,
    });

    await expect(
      signInWithPasswordAction(
        { status: "idle" },
        buildFormData({ email: "owner@example.com", password: "supersecret" }),
      ),
    ).rejects.toThrow("NEXT_REDIRECT:/editor");

    expect(signInWithPassword).toHaveBeenCalledWith({
      email: "owner@example.com",
      password: "supersecret",
    });
  });

  test("redirects to a valid internal next path", async () => {
    signInWithPassword.mockResolvedValueOnce({
      data: { user: { id: "user-1" }, session: { access_token: "token" } },
      error: null,
    });

    await expect(
      signInWithPasswordAction(
        { status: "idle" },
        buildFormData({
          email: "owner@example.com",
          password: "supersecret",
          next: "/account",
        }),
      ),
    ).rejects.toThrow("NEXT_REDIRECT:/account");
  });

  test("normalizes a hostile next path to the site root", async () => {
    signInWithPassword.mockResolvedValueOnce({
      data: { user: { id: "user-1" }, session: { access_token: "token" } },
      error: null,
    });

    await expect(
      signInWithPasswordAction(
        { status: "idle" },
        buildFormData({
          email: "owner@example.com",
          password: "supersecret",
          next: "//evil.example/phishing",
        }),
      ),
    ).rejects.toThrow("NEXT_REDIRECT:/");
  });

  test("returns a generic message for bad credentials", async () => {
    signInWithPassword.mockResolvedValueOnce({
      data: { user: null, session: null },
      error: { message: "Invalid login credentials" },
    });

    const result = await signInWithPasswordAction(
      { status: "idle" },
      buildFormData({ email: "owner@example.com", password: "wrong-password" }),
    );

    expect(result.status).toBe("error");
    expect(result.message).toBe("Email ou mot de passe incorrect.");
  });

  test("asks the user to confirm their email when it is not confirmed", async () => {
    signInWithPassword.mockResolvedValueOnce({
      data: { user: null, session: null },
      error: { message: "Email not confirmed" },
    });

    const result = await signInWithPasswordAction(
      { status: "idle" },
      buildFormData({ email: "owner@example.com", password: "supersecret" }),
    );

    expect(result.status).toBe("error");
    expect(result.message).toMatch(/confirmez votre email/i);
  });

  test("rejects an invalid email without calling Supabase", async () => {
    const result = await signInWithPasswordAction(
      { status: "idle" },
      buildFormData({ email: "not-an-email", password: "supersecret" }),
    );

    expect(result.status).toBe("error");
    expect(result.message).toMatch(/invalide/i);
    expect(signInWithPassword).not.toHaveBeenCalled();
  });
});

describe("signOut", () => {
  test("signs out and redirects to the home page", async () => {
    await expect(signOutAction()).rejects.toThrow("NEXT_REDIRECT:/");
    expect(signOut).toHaveBeenCalledTimes(1);
  });
});
