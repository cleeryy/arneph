import "server-only";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error(
    "[db/server] Variables d'environnement manquantes : NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY doivent être définies.",
  );
}

/**
 * Client Supabase SERVICE ROLE — SÉCURITÉ.
 * `import "server-only"` fait échouer la compilation si ce module est importé
 * depuis un Client Component. Le guardrail `grep -rn "SERVICE_ROLE" src/` doit
 * ne matcher QUE ce fichier (et .env.local, hors src/).
 */
export const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});
