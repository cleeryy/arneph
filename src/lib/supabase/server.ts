import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import type { Database } from "@/types/database";

/**
 * Client Supabase serveur lié à la session de l'utilisateur (cookies).
 *
 * À utiliser pour l'authentification (`getUser`, `getClaims`, `verifyOtp`,
 * `signInWithOtp`, `signOut`). Les opérations d'administration des données
 * passent par le client service role de `@/lib/db/server`.
 *
 * Un client par requête : `cookies()` est asynchrone en Next 16 et doit être
 * relu à chaque appel. Ne jamais mettre ce client en variable globale.
 */
export async function createClient() {
  const cookieStore = await cookies();

  // Accès statique obligatoire : Next n'inline au build que les expressions
  // `process.env.NEXT_PUBLIC_*` écrites littéralement.
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      "Supabase URL ou clé publique non configurée (NEXT_PUBLIC_SUPABASE_ANON_KEY ou NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)",
    );
  }

  return createServerClient<Database>(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Un Server Component ne peut pas écrire de cookies (Next lève une
          // erreur). Le proxy rafraîchit déjà la session en amont ; ignorer
          // cette écriture évite de transformer une page en 500.
        }
      },
    },
  });
}
