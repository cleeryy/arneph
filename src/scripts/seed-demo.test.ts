import { describe, expect, test, vi } from "vitest";

const mockMaybeSingle = vi.fn();

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: mockMaybeSingle,
        })),
      })),
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn().mockResolvedValue({ data: { id: "new-webtoon-id" }, error: null }),
        })),
      })),
      delete: vi.fn(() => ({
        eq: vi.fn(() => ({})),
      })),
    })),
    storage: {
      from: vi.fn(() => ({
        upload: vi.fn().mockResolvedValue({ data: { path: "uploaded/path" }, error: null }),
        list: vi.fn().mockResolvedValue({ data: [], error: null }),
        remove: vi.fn().mockResolvedValue({ data: null, error: null }),
      })),
    },
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
    },
  })),
}));

describe("seedDemo idempotence", () => {
  test("returns created:false when webtoon already exists", async () => {
    mockMaybeSingle.mockResolvedValueOnce({
      data: { id: "existing-demo-id" },
      error: null,
    });

    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";

    const { seedDemo } = await import("../../scripts/seed-demo");
    const result = await seedDemo();

    expect(result.created).toBe(false);
    expect(result.webtoonId).toBe("existing-demo-id");
  });
});