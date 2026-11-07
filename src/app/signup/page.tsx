import { getTranslations } from "next-intl/server";

import { AuthShell } from "@/components/auth/auth-shell";
import { normalizeNextPath } from "@/lib/auth/next-path";
import { SignupForm } from "./signup-form";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations("auth");
  return { title: `${t("signUpTitle")} — ${t("brand")}` };
}

export default async function SignupPage({
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
      title={t("signUpTitle")}
      subtitle={t("signUpSubtitle")}
      backHomeLabel={t("backHome")}
    >
      <SignupForm nextPath={nextPath} />
    </AuthShell>
  );
}
