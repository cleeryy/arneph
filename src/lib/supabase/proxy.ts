import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import type { Database } from "@/types/database";

/**
 * Rafraîchit la session Supabase et protège les routes privées (éditeur et
 * compte).
 *
 * Appelé une seule fois par requête depuis `src/proxy.ts` (proxy Next 16).
 * `getClaims()` valide le JWT (JWKS ou serveur Auth) alors que `getSession()`
 * ne fait que lire un cookie non vérifié : ne jamais utiliser `getSession()`
 * pour une décision d'autorisation.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  // Accès statique obligatoire : Next n'inline au build que les expressions
  // `process.env.NEXT_PUBLIC_*` écrites littéralement.
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    // Les routes publiques restent servies ; les pages/actions éditeur
    // refusent l'accès faute d'utilisateur authentifiable.
    return supabaseResponse;
  }

  const supabase = createServerClient<Database>(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        // Met à jour la requête entrante pour que les Server Components
        // voient les cookies rafraîchis…
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }

        // …et reconstruit la réponse avec les nouveaux cookies + les headers
        // anti-cache (`Cache-Control: private, no-store`, etc.).
        supabaseResponse = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          supabaseResponse.cookies.set(name, value, options);
        }
        for (const [key, value] of Object.entries(headers)) {
          supabaseResponse.headers.set(key, value);
        }
      },
    },
  });

  // Important : appeler `getClaims()` tôt, avant toute construction de
  // réponse, pour que le rafraîchissement de token puisse écrire ses cookies.
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims ?? null;

  const { pathname, search } = request.nextUrl;
  const isProtectedRoute =
    pathname === "/editor" ||
    pathname.startsWith("/editor/") ||
    pathname === "/account" ||
    pathname.startsWith("/account/");

  if (isProtectedRoute && !claims) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    loginUrl.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
  }

  // Toujours retourner la réponse qui porte les éventuels cookies rafraîchis.
  return supabaseResponse;
}
