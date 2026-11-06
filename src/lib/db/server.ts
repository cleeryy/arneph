import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

// Re-export pour les modules existants qui importent `Database` depuis ce
// fichier ; la définition vit désormais dans `@/types/database` (client-safe).
export type { Database } from "@/types/database";

type SupabaseServerClient = SupabaseClient<Database>;

let supabaseClient: SupabaseServerClient | null = null;

function initSupabaseClient() {
  if (supabaseClient) {
    return supabaseClient;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "[db/server] Variables d'environnement manquantes : NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY (ou SUPABASE_SECRET_KEY) doivent être définies.",
    );
  }

  /**
   * Client Supabase SERVICE ROLE — SÉCURITÉ.
   * `import "server-only"` fait échouer la compilation si ce module est importé
   * depuis un Client Component. Le guardrail `grep -rn "SERVICE_ROLE" src/` doit
   * ne matcher QUE ce fichier (et .env.local, hors src/).
   */
  supabaseClient = createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return supabaseClient;
}

/**
 * Client Supabase SERVICE ROLE — SÉCURITÉ.
 * `import "server-only"` fait échouer la compilation si ce module est importé
 * depuis un Client Component. Le guardrail `grep -rn "SERVICE_ROLE" src/` doit
 * ne matcher QUE ce fichier (et .env.local, hors src/).
 */
export function getSupabaseServerClient(): SupabaseServerClient {
  return initSupabaseClient();
}

export const supabase = new Proxy({} as SupabaseServerClient, {
  get(_target, prop: PropertyKey) {
    const client = initSupabaseClient();
    const value = Reflect.get(client, prop);
    return typeof value === "function" ? value.bind(client) : value;
  },
}) as SupabaseServerClient;
