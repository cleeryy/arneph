import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { normalizeNextPath } from "@/lib/auth/next-path";

export interface CurrentUser {
  id: string;
  email: string | null;
}

/**
 * Utilisateur authentifié de la requête courante.
 *
 * `getUser()` contacte le serveur Auth et valide le JWT : c'est la seule
 * source fiable pour une décision d'autorisation (contrairement à
 * `getSession()` qui lit un cookie non vérifié).
 *
 * `cache()` React déduplique l'appel entre le layout, la page et les Server
 * Actions d'une même requête.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) return null;

  return {
    id: data.user.id,
    email: data.user.email ?? null,
  };
});

export type RequireUserResult =
  | { ok: true; user: CurrentUser }
  | { ok: false; error: "unauthenticated" };

/**
 * Garde pour les Server Actions d'écriture.
 * Ne redirige jamais : une action renvoie un objet sérialisable au client.
 */
export async function requireUser(): Promise<RequireUserResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "unauthenticated" };
  return { ok: true, user };
}

/**
 * Garde pour les pages serveur : redirige vers `/login` en conservant la
 * destination interne (`next`), validée contre les redirections ouvertes.
 */
export async function requireUserOrRedirect(
  nextPath: string,
): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) {
    const safeNext = normalizeNextPath(nextPath);
    redirect(`/login?next=${encodeURIComponent(safeNext)}`);
  }
  return user;
}
