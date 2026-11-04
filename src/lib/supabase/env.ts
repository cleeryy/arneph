/**
 * Résolution des clés Supabase, tolérante aux deux conventions.
 *
 * Supabase expose historiquement `ANON_KEY` / `SERVICE_ROLE_KEY` (JWT) et
 * propose désormais `PUBLISHABLE_KEY` / `SECRET_KEY` (`sb_*`). Les deux
 * fonctionnent côté API ; on accepte donc l'une ou l'autre pour ne pas casser
 * un déploiement mal nommé.
 */
export function resolveAnonKey(
  env: Record<string, string | undefined> = process.env,
): string | null {
  return env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? null;
}

export function resolveServiceRoleKey(
  env: Record<string, string | undefined> = process.env,
): string | null {
  return env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_SECRET_KEY ?? null;
}

export function resolveSupabaseUrl(
  env: Record<string, string | undefined> = process.env,
): string | null {
  return env.NEXT_PUBLIC_SUPABASE_URL ?? null;
}

export function resolveAssetVersion(
  env: Record<string, string | undefined> = process.env,
): string | null {
  const value = env.NEXT_PUBLIC_ASSET_VERSION?.trim();
  return value ? value : null;
}
