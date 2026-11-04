import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { uploadSectionAsset } from "../upload";

const { uploadSpy, fromSpy, createClientSpy } = vi.hoisted(() => ({
  uploadSpy: vi.fn(),
  fromSpy: vi.fn(),
  createClientSpy: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: createClientSpy,
}));

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://supabase.example.com");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");

  uploadSpy.mockResolvedValue({ data: { path: "webtoons/sections/s1/1-page.webp" }, error: null });
  fromSpy.mockReturnValue({ upload: uploadSpy });
  createClientSpy.mockReturnValue({ storage: { from: fromSpy } });
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("uploadSectionAsset", () => {
  test("upload vers le bucket webtoon-images sans upsert", async () => {
    const blob = new Blob(["page"], { type: "image/webp" });

    const path = await uploadSectionAsset(
      "webtoons/sections/s1/1-page.webp",
      blob,
      "image/webp",
    );

    expect(createClientSpy).toHaveBeenCalledWith(
      "https://supabase.example.com",
      "anon-key",
    );
    expect(fromSpy).toHaveBeenCalledWith("webtoon-images");
    expect(uploadSpy).toHaveBeenCalledWith(
      "webtoons/sections/s1/1-page.webp",
      blob,
      { contentType: "image/webp", upsert: false },
    );
    expect(path).toBe("webtoons/sections/s1/1-page.webp");
  });

  test("retourne le chemin renvoyé par le Storage (pas le chemin demandé)", async () => {
    uploadSpy.mockResolvedValue({ data: { path: "canonical/path.gif" }, error: null });

    await expect(
      uploadSectionAsset("requested/path.gif", new Blob(["gif"]), "image/gif"),
    ).resolves.toBe("canonical/path.gif");
  });

  test("propage l'erreur du Storage", async () => {
    const storageError = new Error("storage failure");
    uploadSpy.mockResolvedValue({ data: null, error: storageError });

    await expect(
      uploadSectionAsset("a.webp", new Blob(["x"]), "image/webp"),
    ).rejects.toBe(storageError);
  });

  test("échoue si l'environnement Supabase est incomplet", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");

    await expect(
      uploadSectionAsset("a.webp", new Blob(["x"]), "image/webp"),
    ).rejects.toThrow(/clé publique non configurée/);
    expect(createClientSpy).not.toHaveBeenCalled();
  });
});
