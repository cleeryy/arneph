import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { normalizeNextPath } from "@/lib/auth/next-path";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const t = await getTranslations("auth");
  const { next } = await searchParams;
  const nextValue = Array.isArray(next) ? next[0] : next;
  const nextPath = normalizeNextPath(nextValue);

  return (
    <main className="flex flex-1 items-center justify-center bg-background px-6 py-16">
      <div className="w-full max-w-sm">
        <div className="flex flex-col gap-2">
          <p className="font-mono text-[11px] font-medium tracking-[0.28em] text-muted-foreground uppercase">
            Arneph
          </p>
          <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">
            {t("title")}
          </h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>

        <div className="mt-8">
          <LoginForm
            nextPath={nextPath}
            labels={{
              email: t("email"),
              emailPlaceholder: t("emailPlaceholder"),
              submit: t("submit"),
              submitting: t("submitting"),
              success: t("success"),
              error: t("error"),
            }}
          />
        </div>

        <Link
          href="/"
          className="mt-8 inline-block text-sm font-medium text-muted-foreground underline-offset-4 hover:underline"
        >
          ← {t("backHome")}
        </Link>
      </div>
    </main>
  );
}
