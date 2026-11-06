import { describe, expect, test } from "vitest";

import { GET } from "../route";

describe("GET /api/health", () => {
  test("returns a 200 JSON liveness payload", async () => {
    const response = GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  test("never exposes a secret or internal detail", async () => {
    const body = (await GET().json()) as Record<string, unknown>;

    expect(body).toEqual({
      ok: true,
      service: "arneph",
      timestamp: expect.any(String),
    });
    const serialized = JSON.stringify(body).toLowerCase();
    expect(serialized).not.toContain("key");
    expect(serialized).not.toContain("supabase");
    expect(serialized).not.toContain("password");
  });

  test("stamps an ISO 8601 server time", async () => {
    const body = (await GET().json()) as { timestamp: string };

    expect(Number.isNaN(Date.parse(body.timestamp))).toBe(false);
    expect(body.timestamp).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
    );
  });
});
