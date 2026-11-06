import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

import { normalizeNextPath } from "@/lib/auth/next-path";
import { createClient } from "@/lib/supabase/server";

/**
 * Types OTP acceptés par `verifyOtp`. La valeur vient de l'URL : la valider
 * évite de transmettre une chaîne arbitraire à l'API Auth.
 */
const ALLOWED_OTP_TYPES = new Set<EmailOtpType>([
  "email",
  "magiclink",
  "signup",
  "invite",
  "recovery",
  "email_change",
]);

/**
 * Point d'entrée des magic links Supabase (`token_hash`, voie cross-device).
 *
 * Le template email doit pointer vers :
 * `/auth/confirm?token_hash={{ .TokenHash }}&type=email`
 * et peut ajouter `&next=/editor`. Ce handler ne lit jamais de code PKCE :
 * le lien peut donc être ouvert sur un autre appareil que celui qui l'a
 * demandé.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  const errorUrl = new URL("/auth/auth-code-error", origin);

  if (!tokenHash || !type || !ALLOWED_OTP_TYPES.has(type)) {
    return NextResponse.redirect(errorUrl);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({
    type,
    token_hash: tokenHash,
  });

  if (error) {
    console.error("[auth] verifyOtp failed:", error.message);
    return NextResponse.redirect(errorUrl);
  }

  // `next` validé comme chemin interne : jamais de redirection ouverte.
  // Le token n'est pas recopié dans l'URL de destination.
  const nextPath = normalizeNextPath(searchParams.get("next"));
  return NextResponse.redirect(new URL(nextPath, origin));
}
