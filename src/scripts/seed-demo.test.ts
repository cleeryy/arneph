import { beforeEach, describe, expect, test, vi } from "vitest";

const { mockMaybeSingle, mockUpload, mockInsert } = vi.hoisted(() => ({
  mockMaybeSingle: vi.fn(),
  mockUpload: vi.fn(),
  mockInsert: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: mockMaybeSingle,
        })),
      })),
      insert: mockInsert,
      delete: vi.fn(() => ({
        eq: vi.fn(() => ({})),
      })),
    })),
    storage: {
      from: vi.fn(() => ({
        upload: mockUpload,
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

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  mockInsert.mockReturnValue({
    select: vi.fn(() => ({
      single: vi.fn().mockResolvedValue({ data: { id: "new-webtoon-id" }, error: null }),
    })),
  });
  mockUpload.mockResolvedValue({ data: { path: "uploaded/path" }, error: null });
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
});

describe("seed-demo — PNG encoder", () => {
  test("encodePng écrit des dimensions IHDR strictement positives et exactes", async () => {
    const { encodePng } = await import("../../scripts/seed-demo");

    const png = encodePng(Buffer.alloc(3 * 2 * 4, 255), 3, 2);

    expect(png.subarray(1, 4).toString("ascii")).toBe("PNG");
    expect(png.subarray(12, 16).toString("ascii")).toBe("IHDR");
    expect(png.readUInt32BE(16)).toBe(3);
    expect(png.readUInt32BE(20)).toBe(2);
  });
});

describe("seedDemo idempotence", () => {
  test("returns created:false when all webtoons already exist", async () => {
    mockMaybeSingle.mockResolvedValue({
      data: { id: "existing-demo-id" },
      error: null,
    });

    const { seedDemo } = await import("../../scripts/seed-demo");
    const result = await seedDemo();

    expect(result.created).toBe(false);
    expect(result.webtoonId).toBe("existing-demo-id");
  });

  test("répare les assets des webtoons existants sans dupliquer les lignes en base", async () => {
    mockMaybeSingle.mockResolvedValue({
      data: { id: "existing-demo-id" },
      error: null,
    });

    const { seedDemo } = await import("../../scripts/seed-demo");
    const result = await seedDemo();

    expect(result.created).toBe(false);
    expect(mockUpload).toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
  });
});
