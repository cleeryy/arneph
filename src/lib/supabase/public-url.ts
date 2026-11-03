/**
 * Fabrique unique des URLs publiques du bucket Storage `webtoon-images`.
 *
 * `NEXT_PUBLIC_ASSET_VERSION` ajoute un cache-buster (`?v=`) à toutes les URLs
 * d'assets : incrémenter cette valeur invalide les caches CDN (Cloudflare) et
 * navigateur pour les objets écrasés sur le même chemin Storage. Les uploads
 * utilisateur utilisent déjà des chemins horodatés ; ce levier couvre les
 * assets stables (seed, corrections) sans renommer de fichier en base.
 */
export function getSupabasePublicObjectUrl(storagePath: string): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;

  if (!base) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is not configured");
  }

  const normalizedBase = base.replace(/\/$/, "");
  const encodedPath = storagePath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");

  const url = `${normalizedBase}/storage/v1/object/public/webtoon-images/${encodedPath}`;
  const version = process.env.NEXT_PUBLIC_ASSET_VERSION?.trim();

  return version ? `${url}?v=${encodeURIComponent(version)}` : url;
}
