"use client";

import * as React from "react";
import { useActionState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signUpAction, type AuthFormState } from "@/lib/auth/actions";

const INITIAL_STATE: AuthFormState = { status: "idle" };

interface SignupFormProps {
  nextPath: string;
}

/**
 * Création de compte : nom d'affichage facultatif, e-mail, mot de passe et
 * confirmation. La confirmation est vérifiée côté client pour un retour
 * immédiat, le serveur restant la seule source fiable.
 */
export function SignupForm({ nextPath }: SignupFormProps) {
  const t = useTranslations("auth");
  const [state, formAction, pending] = useActionState(
    signUpAction,
    INITIAL_STATE,
  );

  const [password, setPassword] = React.useState("");
  const [confirmation, setConfirmation] = React.useState("");

  const passwordsMismatch =
    confirmation.length > 0 && password !== confirmation;
  const hasStatus = state.status !== "idle";
  const isError = state.status === "error";
  const statusId = "signup-status";
  const passwordHintId = "signup-password-hint";

  const passwordDescribedBy = hasStatus
    ? `${passwordHintId} ${statusId}`
    : passwordHintId;

  return (
    <form
      action={formAction}
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        // La validation native ne sait pas comparer deux champs.
        if (passwordsMismatch) event.preventDefault();
      }}
    >
      <input type="hidden" name="next" value={nextPath} />

      <div className="flex flex-col gap-2">
        <Label htmlFor="signup-display-name">{t("displayName")}</Label>
        <Input
          className="h-10"
          id="signup-display-name"
          name="displayName"
          type="text"
          autoComplete="name"
          placeholder={t("displayNamePlaceholder")}
          disabled={pending}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="signup-email">{t("email")}</Label>
        <Input
          className="h-10"
          id="signup-email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          placeholder={t("emailPlaceholder")}
          aria-invalid={isError}
          aria-describedby={hasStatus ? statusId : undefined}
          disabled={pending}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="signup-password">{t("password")}</Label>
        <Input
          className="h-10"
          id="signup-password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder={t("passwordPlaceholder")}
          aria-invalid={isError || passwordsMismatch}
          aria-describedby={passwordDescribedBy}
          disabled={pending}
        />
        <p id={passwordHintId} className="text-xs leading-5 text-muted-foreground">
          {t("passwordHint")}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="signup-confirm-password">{t("confirmPassword")}</Label>
        <Input
          className="h-10"
          id="signup-confirm-password"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
          aria-invalid={isError || passwordsMismatch}
          aria-describedby={
            passwordsMismatch
              ? "signup-password-mismatch"
              : hasStatus
                ? statusId
                : undefined
          }
          disabled={pending}
        />
        {passwordsMismatch ? (
          <p
            id="signup-password-mismatch"
            role="alert"
            className="text-xs font-medium text-destructive"
          >
            {t("passwordMismatch")}
          </p>
        ) : null}
      </div>

      {hasStatus ? (
        <p
          id={statusId}
          role={isError ? "alert" : "status"}
          className={
            isError
              ? "rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              : "rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground"
          }
        >
          {state.message ?? (isError ? t("signUpError") : t("signUpSuccess"))}
        </p>
      ) : null}

      <Button
        type="submit"
        size="lg"
        className="mt-1 h-10 w-full"
        disabled={pending || passwordsMismatch}
      >
        {pending ? t("signUpSubmitting") : t("signUpSubmit")}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        {t("haveAccount")}{" "}
        <Link
          href={`/login?next=${encodeURIComponent(nextPath)}`}
          className="rounded-sm font-medium text-foreground underline underline-offset-4 outline-none hover:text-foreground/70 focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {t("signInLink")}
        </Link>
      </p>
    </form>
  );
}
