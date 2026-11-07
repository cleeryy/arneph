import "server-only";

import { cache } from "react";

import { createClient } from "@/lib/supabase/server";

export interface Profile {
  id: string;
  email: string;
  displayName: string | null;
  createdAt: string;
  updatedAt: string;
}

const PROFILE_COLUMNS = "id, email, display_name, created_at, updated_at";

/**
 * Profil applicatif de l'utilisateur authentifié de la requête courante.
 *
 * `getUser()` valide le JWT auprès du serveur Auth : c'est la seule source
 * fiable pour choisir quel profil lire. Une erreur (réseau, RLS, profil pas
 * encore créé par le trigger) renvoie `null` plutôt que de casser la page.
 *
 * `cache()` React déduplique l'appel entre le layout, la page et les Server
 * Actions d'une même requête.
 */
export const getCurrentProfile = cache(async (): Promise<Profile | null> => {
  const supabase = await createClient();

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .eq("id", userData.user.id)
    .maybeSingle();

  if (error || !data) return null;

  return {
    id: data.id,
    email: data.email,
    displayName: data.display_name,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
});
