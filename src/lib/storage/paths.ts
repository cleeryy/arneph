/**
 * Règles de validation des chemins Storage du bucket `webtoon-images`.
 *
 * Tous les chemins manipulés par l'application sont relatifs au bucket et
 * normalisés (`webtoons/...`). Cette couche centrale empêche les traversées
 * (`..`), les chemins absolus et les préfixes croisés avant tout accès
 * Storage, en particulier avant une suppression avec la clé service role.
 */

/** Racine de tous les objets applicatifs du bucket. */
export const STORAGE_ROOT_PREFIX = "webtoons/";

/** Assets statiques du seed de démonstration, partagés entre webtoons. */
export const SEED_STORAGE_PREFIX = "webtoons/seed/";

/**
 * Un chemin Storage sûr est relatif, non vide, sans antislash, sans segment
 * vide (`//`) et sans segment `.`/`..`.
 */
export function isSafeStoragePath(path: string): boolean {
  if (typeof path !== "string" || path.length === 0) return false;
  if (path.startsWith("/")) return false;
  if (path.includes("\\")) return false;
  if (path.includes("//")) return false;

  return path
    .split("/")
    .every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
}

/**
 * Vrai si `path` est un chemin sûr situé sous `prefix`.
 * Le préfixe est comparé segment par segment : `.../s1` ne couvre pas
 * `.../s10`.
 */
export function isPathUnder(path: string, prefix: string): boolean {
  if (!isSafeStoragePath(path) || typeof prefix !== "string" || prefix.length === 0) {
    return false;
  }

  const normalizedPrefix = prefix.endsWith("/") ? prefix : `${prefix}/`;
  return path === prefix || path.startsWith(normalizedPrefix);
}

/** Préfixe des assets d'une section : `webtoons/sections/<sectionId>/`. */
export function sectionStoragePrefix(sectionId: string): string {
  return `webtoons/sections/${sectionId}/`;
}

/** Préfixe des couvertures d'un webtoon : `webtoons/covers/<webtoonId>/`. */
export function coverStoragePrefix(webtoonId: string): string {
  return `webtoons/covers/${webtoonId}/`;
}

/** Lève une erreur explicite si le chemin Storage est invalide. */
export function assertSafeStoragePath(
  path: string,
  label = "Chemin Storage",
): void {
  if (!isSafeStoragePath(path)) {
    throw new Error(`${label} invalide : "${path}"`);
  }
}
