"use client";

import * as React from "react";
import { useActionState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { sendMagicLink, type AuthFormState } from "@/lib/auth/actions";

const INITIAL_STATE: AuthFormState = { status: "idle" };

interface MagicLinkFormProps {
  nextPath: string;
}

/**
 * Connexion par lien magique (secondaire sur /login).
 *
 * Formulaire volontairement minimal : un e-mail, un message de succès
 * générique (pas d'énumération de comptes) et des identifiants DOM distincts
 * de ceux du formulaire mot de passe pour éviter les collisions de labels.
 */
export function MagicLinkForm({ nextPath }: MagicLinkFormProps) {
  const t = useTranslations("auth");
  const [state, formAction, pending] = useActionState(
    sendMagicLink,
    INITIAL_STATE,
  );

  const hasStatus = state.status !== "idle";
  const isError = state.status === "error";

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="next" value={nextPath} />

      <div className="flex flex-col gap-2">
        <Label htmlFor="magic-email">{t("email")}</Label>
        <Input
          className="h-10"
          id="magic-email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          placeholder={t("emailPlaceholder")}
          aria-invalid={isError}
          aria-describedby={hasStatus ? "magic-status" : undefined}
          disabled={pending}
        />
      </div>

      {hasStatus ? (
        <p
          id="magic-status"
          role={isError ? "alert" : "status"}
          className={
            isError
              ? "rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              : "rounded-lg border border-border bg-background/70 px-3 py-2 text-sm text-muted-foreground"
          }
        >
          {state.message ?? (isError ? t("error") : t("success"))}
        </p>
      ) : null}

      <Button
        type="submit"
        variant="outline"
        size="lg"
        className="h-10 w-full"
        disabled={pending}
      >
        {pending ? t("submitting") : t("submit")}
      </Button>
    </form>
  );
}
