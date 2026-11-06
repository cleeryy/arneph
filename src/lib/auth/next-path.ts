/**
 * Normalise un paramètre `next` utilisé après connexion.
 *
 * Seuls les chemins relatifs internes sont acceptés : une URL absolue, un
 * `//host` ou un chemin contenant `\` permettraient une redirection ouverte
 * (`/login?next=https://evil.example`).
 *
 * - valeur absente → `fallback` (par défaut `/editor`) ;
 * - valeur fournie mais invalide → `/` (racine connue, jamais externe).
 */
export function normalizeNextPath(
  value: string | null | undefined,
  fallback: string = "/editor",
): string {
  if (value === null || value === undefined || value.trim() === "") {
    return fallback;
  }

  const candidate = value.trim();

  if (
    !candidate.startsWith("/") ||
    candidate.startsWith("//") ||
    candidate.includes("\\") ||
    // Caractères de contrôle : rejetés par les parseurs d'URL.
    /[\u0000-\u001f\u007f]/.test(candidate)
  ) {
    return "/";
  }

  return candidate;
}
