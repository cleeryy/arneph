import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { getSupabasePublicObjectUrl } from "../public-url";

describe("getSupabasePublicObjectUrl", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://supabase.example.com/");
    vi.stubEnv("NEXT_PUBLIC_ASSET_VERSION", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test("construit une URL publique encodée sans slash final", () => {
    expect(getSupabasePublicObjectUrl("webtoons/démo/image 1.png")).toBe(
      "https://supabase.example.com/storage/v1/object/public/webtoon-images/webtoons/d%C3%A9mo/image%201.png",
    );
  });

  test("ajoute un cache-buster quand NEXT_PUBLIC_ASSET_VERSION est défini", () => {
    vi.stubEnv("NEXT_PUBLIC_ASSET_VERSION", "2");
    expect(getSupabasePublicObjectUrl("webtoons/seed/demo/image.png")).toBe(
      "https://supabase.example.com/storage/v1/object/public/webtoon-images/webtoons/seed/demo/image.png?v=2",
    );
  });

  test("échoue clairement si l'URL Supabase n'est pas configurée", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    expect(() => getSupabasePublicObjectUrl("a.png")).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
  });

  test("rejette une traversée de répertoire avant de construire l'URL", () => {
    expect(() =>
      getSupabasePublicObjectUrl("webtoons/sections/s1/../../../secret.webp"),
    ).toThrow("Chemin Storage invalide.");
  });

  test("rejette un chemin absolu", () => {
    expect(() => getSupabasePublicObjectUrl("/etc/passwd")).toThrow(
      "Chemin Storage invalide.",
    );
  });
});

describe("getSupabaseRenderUrl", () => {
  test("construit une URL imgproxy avec largeur, qualité et version", async () => {
    const { getSupabaseRenderUrl } = await import("../public-url");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://supabase.example.com");
    vi.stubEnv("NEXT_PUBLIC_ASSET_VERSION", "3");

    const url = new URL(getSupabaseRenderUrl("webtoons/a b/é.webp", { width: 640 }));
    expect(url.pathname).toBe(
      "/storage/v1/render/image/public/webtoon-images/webtoons/a%20b/%C3%A9.webp",
    );
    expect(url.searchParams.get("width")).toBe("640");
    expect(url.searchParams.get("quality")).toBe("75");
    expect(url.searchParams.get("v")).toBe("3");
  });

  test("rejette une traversée de répertoire", async () => {
    const { getSupabaseRenderUrl } = await import("../public-url");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://supabase.example.com");

    expect(() =>
      getSupabaseRenderUrl("../secret.webp", { width: 640 }),
    ).toThrow("Chemin Storage invalide.");
  });

  test("accepte les assets seed", async () => {
    const { getSupabaseRenderUrl } = await import("../public-url");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://supabase.example.com");
    vi.stubEnv("NEXT_PUBLIC_ASSET_VERSION", "");

    const url = new URL(
      getSupabaseRenderUrl("webtoons/seed/demo/image.png", { width: 320 }),
    );
    expect(url.pathname).toBe(
      "/storage/v1/render/image/public/webtoon-images/webtoons/seed/demo/image.png",
    );
  });
});
