/** Sonde de disponibilité : liveness process, sans dépendance externe. */

/**
 * Aucun cache : la sonde doit refléter l'état du process à chaque appel et ne
 * jamais être servie depuis le cache du routeur (`force-dynamic` désactive
 * aussi la génération statique au build).
 */
export const dynamic = "force-dynamic";

/**
 * Volontairement sans accès base ni Storage : une panne Supabase ne doit pas
 * faire redémarrer le conteneur applicatif. Aucun détail d'environnement ni
 * secret n'est exposé, seulement le nom du service et l'heure serveur.
 */
export function GET(): Response {
  return Response.json(
    { ok: true, service: "arneph", timestamp: new Date().toISOString() },
    { headers: { "cache-control": "no-store" } },
  );
}
