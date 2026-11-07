"use client";

import * as React from "react";
import { useActionState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  signInWithPasswordAction,
  type AuthFormState,
} from "@/lib/auth/actions";

const INITIAL_STATE: AuthFormState = { status: "idle" };

interface PasswordLoginFormProps {
  nextPath: string;
}

/** Connexion principale par e-mail + mot de passe. */
export function PasswordLoginForm({ nextPath }: PasswordLoginFormProps) {
  const t = useTranslations("auth");
  const [state, formAction, pending] = useActionState(
    signInWithPasswordAction,
    INITIAL_STATE,
  );

  const hasStatus = state.status !== "idle";
  const isError = state.status === "error";
  const statusId = "password-login-status";

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="next" value={nextPath} />

      <div className="flex flex-col gap-2">
        <Label htmlFor="login-email">{t("email")}</Label>
        <Input
          className="h-10"
          id="login-email"
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
        <Label htmlFor="login-password">{t("password")}</Label>
        <Input
          className="h-10"
          id="login-password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          placeholder={t("passwordPlaceholder")}
          aria-invalid={isError}
          aria-describedby={hasStatus ? statusId : undefined}
          disabled={pending}
        />
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
          {state.message ?? (isError ? t("signInError") : t("success"))}
        </p>
      ) : null}

      <Button
        type="submit"
        size="lg"
        className="mt-1 h-10 w-full"
        disabled={pending}
      >
        {pending ? t("signInSubmitting") : t("signInSubmit")}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        {t("noAccount")}{" "}
        <Link
          href={`/signup?next=${encodeURIComponent(nextPath)}`}
          className="rounded-sm font-medium text-foreground underline underline-offset-4 outline-none hover:text-foreground/70 focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {t("createAccountLink")}
        </Link>
      </p>
    </form>
  );
}
