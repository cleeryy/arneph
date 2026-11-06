import { NextRequest } from "next/server";
import { beforeEach, describe, expect, test, vi } from "vitest";

const verifyOtp = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { verifyOtp },
  })),
}));

import { GET } from "@/app/auth/confirm/route";

function confirmRequest(query: string): NextRequest {
  return new NextRequest(
    new URL(`https://arneph.test/auth/confirm?${query}`),
  );
}

function locationPath(response: Response): string {
  const location = response.headers.get("location");
  expect(location).toBeTruthy();
  return new URL(location as string).pathname;
}

beforeEach(() => {
  verifyOtp.mockReset();
  verifyOtp.mockResolvedValue({ data: { session: null }, error: null });
});

describe("GET /auth/confirm", () => {
  test("verifies a token_hash and redirects to the editor by default", async () => {
    const response = await GET(
      confirmRequest("token_hash=abc123&type=email"),
    );

    expect(verifyOtp).toHaveBeenCalledWith({
      type: "email",
      token_hash: "abc123",
    });
    expect(locationPath(response)).toBe("/editor");
    // Le token ne doit jamais être recopié dans l'URL finale.
    expect(response.headers.get("location")).not.toContain("token_hash");
  });

  test("honours a valid internal next path", async () => {
    const response = await GET(
      confirmRequest(
        "token_hash=abc123&type=email&next=%2Feditor%2F11111111-2222-4333-8444-555555555555",
      ),
    );

    expect(locationPath(response)).toBe(
      "/editor/11111111-2222-4333-8444-555555555555",
    );
  });

  test("rejects an absolute next URL and falls back to the root", async () => {
    const response = await GET(
      confirmRequest(
        "token_hash=abc123&type=email&next=https%3A%2F%2Fevil.test%2Fphish",
      ),
    );

    expect(locationPath(response)).toBe("/");
    expect(response.headers.get("location")).not.toContain("evil.test");
  });

  test("redirects to the error page when verifyOtp fails", async () => {
    verifyOtp.mockResolvedValueOnce({
      data: null,
      error: { message: "Token has expired or is invalid" },
    });

    const response = await GET(
      confirmRequest("token_hash=expired&type=email"),
    );

    expect(locationPath(response)).toBe("/auth/auth-code-error");
  });

  test("redirects to the error page without calling Supabase when token_hash is missing", async () => {
    const response = await GET(confirmRequest("type=email"));

    expect(verifyOtp).not.toHaveBeenCalled();
    expect(locationPath(response)).toBe("/auth/auth-code-error");
  });

  test("rejects an unknown OTP type", async () => {
    const response = await GET(
      confirmRequest("token_hash=abc123&type=superadmin"),
    );

    expect(verifyOtp).not.toHaveBeenCalled();
    expect(locationPath(response)).toBe("/auth/auth-code-error");
  });
});
