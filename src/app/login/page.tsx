import { getTranslations } from "next-intl/server";

import { AuthShell } from "@/components/auth/auth-shell";
import { normalizeNextPath } from "@/lib/auth/next-path";
import { MagicLinkForm } from "./magic-link-form";
import { PasswordLoginForm } from "./password-login-form";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations("auth");
  return { title: `${t("title")} — ${t("brand")}` };
}

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
    <AuthShell
      brand={t("brand")}
      title={t("title")}
      subtitle={t("subtitle")}
      backHomeLabel={t("backHome")}
    >
      <PasswordLoginForm nextPath={nextPath} />

      <section
        aria-labelledby="magic-link-title"
        className="mt-10 border border-border bg-muted/30 p-5"
      >
        <h2
          id="magic-link-title"
          className="font-mono text-[11px] font-medium tracking-[0.2em] text-muted-foreground uppercase"
        >
          {t("magicLinkTitle")}
        </h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {t("magicLinkSubtitle")}
        </p>
        <div className="mt-5">
          <MagicLinkForm nextPath={nextPath} />
        </div>
      </section>
    </AuthShell>
  );
}
