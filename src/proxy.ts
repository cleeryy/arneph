import type { NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/proxy";

/**
 * Proxy Next 16 (ex-middleware). Node.js runtime uniquement — ne pas définir
 * `export const runtime`, Next lève une erreur dans ce fichier.
 *
 * Le matcher exclut les assets statiques : sans cela, la logique d'auth
 * s'exécuterait sur chaque CSS/JS/image et pourrait bloquer leur chargement.
 */
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|css|js|map|txt|xml|woff|woff2|ttf|otf)$).*)",
  ],
};
