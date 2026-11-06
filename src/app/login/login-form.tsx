"use client";

import * as React from "react";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  sendMagicLink,
  type AuthFormState,
} from "@/lib/auth/actions";

const INITIAL_STATE: AuthFormState = { status: "idle" };

interface LoginFormProps {
  nextPath: string;
  labels: {
    email: string;
    emailPlaceholder: string;
    submit: string;
    submitting: string;
    success: string;
    error: string;
  };
}

export function LoginForm({ nextPath, labels }: LoginFormProps) {
  const [state, formAction, pending] = useActionState(
    sendMagicLink,
    INITIAL_STATE,
  );

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="next" value={nextPath} />

      <div className="flex flex-col gap-2">
        <Label htmlFor="email">{labels.email}</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          placeholder={labels.emailPlaceholder}
          aria-invalid={state.status === "error"}
          aria-describedby={
            state.status === "idle" ? undefined : "login-status"
          }
          disabled={pending}
        />
      </div>

      {state.status !== "idle" && state.message && (
        <p
          id="login-status"
          role={state.status === "error" ? "alert" : "status"}
          className={
            state.status === "error"
              ? "rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              : "rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground"
          }
        >
          {state.status === "error"
            ? (state.message ?? labels.error)
            : (state.message ?? labels.success)}
        </p>
      )}

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? labels.submitting : labels.submit}
      </Button>
    </form>
  );
}
