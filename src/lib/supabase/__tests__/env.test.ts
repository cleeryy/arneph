import { describe, expect, test } from "vitest";

import {
  resolveAnonKey,
  resolveAssetVersion,
  resolveServiceRoleKey,
  resolveSupabaseUrl,
} from "../env";

describe("résolution des variables Supabase", () => {
  test("préfère ANON_KEY puis PUBLISHABLE_KEY", () => {
    expect(
      resolveAnonKey({ NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "pub" }),
    ).toBe("anon");
    expect(resolveAnonKey({ NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "pub" })).toBe("pub");
    expect(resolveAnonKey({})).toBeNull();
  });

  test("préfère SERVICE_ROLE_KEY puis SECRET_KEY", () => {
    expect(
      resolveServiceRoleKey({ SUPABASE_SERVICE_ROLE_KEY: "service", SUPABASE_SECRET_KEY: "secret" }),
    ).toBe("service");
    expect(resolveServiceRoleKey({ SUPABASE_SECRET_KEY: "secret" })).toBe("secret");
    expect(resolveServiceRoleKey({})).toBeNull();
  });

  test("URL et version d'assets", () => {
    expect(resolveSupabaseUrl({ NEXT_PUBLIC_SUPABASE_URL: "https://x" })).toBe("https://x");
    expect(resolveSupabaseUrl({})).toBeNull();
    expect(resolveAssetVersion({ NEXT_PUBLIC_ASSET_VERSION: " 2 " })).toBe("2");
    expect(resolveAssetVersion({ NEXT_PUBLIC_ASSET_VERSION: "   " })).toBeNull();
  });
});
