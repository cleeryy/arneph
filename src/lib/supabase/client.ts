"use client";

import { createBrowserClient } from "@supabase/ssr";

import type { Database } from "@/types/database";

/**
 * Client Supabase navigateur (clé anon/publishable uniquement).
 *
 * `createBrowserClient` gère la session via des cookies et réutilise le même
 * client pour tous les appels : ne jamais instancier un client ici avec la
 * clé service role.
 */
export function createClient() {
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

  return createBrowserClient<Database>(supabaseUrl, supabaseKey);
}
