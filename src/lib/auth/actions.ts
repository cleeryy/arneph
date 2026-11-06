"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { normalizeNextPath } from "@/lib/auth/next-path";
import { createClient } from "@/lib/supabase/server";

export interface AuthFormState {
  status: "idle" | "success" | "error";
  message?: string;
}

const emailSchema = z
  .string()
  .trim()
  .min(1, "Adresse e-mail requise.")
  .email("Adresse e-mail invalide.");

const GENERIC_SEND_ERROR =
  "Impossible d'envoyer le lien pour le moment. Réessayez dans quelques instants.";
const GENERIC_SIGN_OUT_ERROR =
  "La déconnexion a échoué. Réessayez dans quelques instants.";

/**
 * Origine de la requête courante, utilisée quand `NEXT_PUBLIC_SITE_URL`
 * n'est pas configurée (dev local, préview Docker).
 */
async function getRequestOrigin(): Promise<string> {
  const store = await headers();
  const origin = store.get("origin");
  if (origin) return origin;

  const host = store.get("x-forwarded-host") ?? store.get("host");
  const protocol = store.get("x-forwarded-proto") ?? "http";
  if (host) return `${protocol}://${host}`;

  return "http://localhost:3000";
}

function getSiteUrl(origin: string): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  return (configured && configured.length > 0 ? configured : origin).replace(
    /\/+$/,
    "",
  );
}

/**
 * Envoie un magic link Supabase (création de compte incluse).
 *
 * Le message de succès est volontairement générique : il ne révèle pas si
 * l'adresse existe déjà (pas d'énumération de comptes).
 */
export async function sendMagicLink(
  _previousState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parse = emailSchema.safeParse(formData.get("email"));
  if (!parse.success) {
    return {
      status: "error",
      message: parse.error.issues[0]?.message ?? "Adresse e-mail invalide.",
    };
  }

  const nextPath = normalizeNextPath(
    typeof formData.get("next") === "string"
      ? (formData.get("next") as string)
      : null,
  );
  const origin = await getRequestOrigin();
  const emailRedirectTo = `${getSiteUrl(origin)}/auth/confirm?next=${encodeURIComponent(nextPath)}`;

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parse.data,
    options: {
      emailRedirectTo,
      shouldCreateUser: true,
    },
  });

  if (error) {
    console.error("[auth] signInWithOtp failed:", error.message);
    return { status: "error", message: GENERIC_SEND_ERROR };
  }

  return {
    status: "success",
    message:
      "Si cette adresse est valide, un lien de connexion vient d'être envoyé. Vérifiez votre boîte mail.",
  };
}

/**
 * Déconnexion puis retour à l'accueil.
 * Utilisable directement comme `action` de formulaire.
 */
export async function signOut(): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut();

  if (error) {
    console.error("[auth] signOut failed:", error.message);
    throw new Error(GENERIC_SIGN_OUT_ERROR);
  }

  redirect("/");
}
