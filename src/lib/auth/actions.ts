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

const displayNameSchema = z
  .string()
  .trim()
  .max(60, "Le nom affiché ne doit pas dépasser 60 caractères.");

// 72 octets : limite imposée par bcrypt, au-delà Supabase tronque ou refuse.
const passwordSchema = z
  .string()
  .min(8, "Le mot de passe doit contenir au moins 8 caractères.")
  .max(72, "Le mot de passe ne doit pas dépasser 72 caractères.");

const GENERIC_SEND_ERROR =
  "Impossible d'envoyer le lien pour le moment. Réessayez dans quelques instants.";
const GENERIC_SIGN_OUT_ERROR =
  "La déconnexion a échoué. Réessayez dans quelques instants.";
const GENERIC_SIGN_UP_ERROR =
  "Impossible de créer le compte pour le moment. Réessayez dans quelques instants.";
const ACCOUNT_EXISTS_ERROR =
  "Un compte existe déjà avec cette adresse.";
const BAD_CREDENTIALS_ERROR = "Email ou mot de passe incorrect.";
const EMAIL_NOT_CONFIRMED_ERROR =
  "Confirmez votre email avant de vous connecter.";
const PASSWORD_TOO_SHORT_ERROR =
  "Le mot de passe doit contenir au moins 8 caractères.";
const PASSWORD_MISMATCH_ERROR = "Les mots de passe ne correspondent pas.";

/** Lit un champ texte d'un FormData sans jamais laisser fuiter un `File`. */
function readFormString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

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
 * Crée un compte email / mot de passe.
 *
 * `AUTOCONFIRM=true` (Supabase local et préproduction) renvoie une session
 * immédiatement : l'utilisateur est redirigé. En production avec confirmation
 * par email, `session` est `null` et on affiche le message d'attente.
 *
 * `display_name` part dans les métadonnées Auth : le trigger
 * `public.handle_new_user()` crée la ligne `public.profiles` correspondante.
 */
export async function signUpAction(
  _previousState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const emailParse = emailSchema.safeParse(readFormString(formData, "email"));
  if (!emailParse.success) {
    return {
      status: "error",
      message: emailParse.error.issues[0]?.message ?? "Adresse e-mail invalide.",
    };
  }

  const passwordParse = passwordSchema.safeParse(
    readFormString(formData, "password"),
  );
  if (!passwordParse.success) {
    return {
      status: "error",
      message: passwordParse.error.issues[0]?.message ?? PASSWORD_TOO_SHORT_ERROR,
    };
  }

  const confirmPassword = readFormString(formData, "confirmPassword");
  if (passwordParse.data !== confirmPassword) {
    return { status: "error", message: PASSWORD_MISMATCH_ERROR };
  }

  const rawDisplayName = readFormString(formData, "displayName");
  let displayName: string | undefined;
  if (rawDisplayName.trim().length > 0) {
    const displayNameParse = displayNameSchema.safeParse(rawDisplayName);
    if (!displayNameParse.success) {
      return {
        status: "error",
        message:
          displayNameParse.error.issues[0]?.message ??
          "Nom affiché invalide.",
      };
    }
    displayName = displayNameParse.data;
  }

  const nextPath = normalizeNextPath(readFormString(formData, "next"));
  const origin = await getRequestOrigin();
  const emailRedirectTo = `${getSiteUrl(origin)}/auth/confirm?next=${encodeURIComponent(nextPath)}`;

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: emailParse.data,
    password: passwordParse.data,
    options: {
      data: { display_name: displayName ?? "" },
      emailRedirectTo,
    },
  });

  if (error) {
    // Ne jamais logguer le mot de passe : seul le message Supabase est tracé.
    console.error("[auth] signUp failed:", error.message);

    if (/already registered|already exists/i.test(error.message)) {
      return { status: "error", message: ACCOUNT_EXISTS_ERROR };
    }
    if (/password/i.test(error.message)) {
      return { status: "error", message: PASSWORD_TOO_SHORT_ERROR };
    }
    return { status: "error", message: GENERIC_SIGN_UP_ERROR };
  }

  if (data.session) {
    redirect(nextPath);
  }

  return {
    status: "success",
    message:
      "Compte créé. Vérifiez votre boîte mail pour confirmer votre adresse.",
  };
}

/**
 * Connexion email / mot de passe.
 *
 * Le message d'erreur reste générique pour ne pas révéler si l'adresse existe
 * (pas d'énumération de comptes), sauf pour l'email non confirmé où
 * l'utilisateur doit savoir qu'il lui reste une étape.
 */
export async function signInWithPasswordAction(
  _previousState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const emailParse = emailSchema.safeParse(readFormString(formData, "email"));
  if (!emailParse.success) {
    return {
      status: "error",
      message: emailParse.error.issues[0]?.message ?? "Adresse e-mail invalide.",
    };
  }

  const password = readFormString(formData, "password");
  if (password.length === 0) {
    return { status: "error", message: "Mot de passe requis." };
  }

  const nextPath = normalizeNextPath(readFormString(formData, "next"));

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: emailParse.data,
    password,
  });

  if (error) {
    console.error("[auth] signInWithPassword failed:", error.message);

    if (/email not confirmed/i.test(error.message)) {
      return { status: "error", message: EMAIL_NOT_CONFIRMED_ERROR };
    }
    return { status: "error", message: BAD_CREDENTIALS_ERROR };
  }

  redirect(nextPath);
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
