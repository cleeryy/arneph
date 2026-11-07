import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";

import { AuthShell } from "@/components/auth/auth-shell";
import { Button, buttonVariants } from "@/components/ui/button";
import { signOut } from "@/lib/auth/actions";
import { getCurrentProfile } from "@/lib/auth/profile";
import { requireUserOrRedirect } from "@/lib/auth/require-user";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations("account");
  return { title: t("title") };
}

export default async function AccountPage() {
  const user = await requireUserOrRedirect("/account");
  const profile = await getCurrentProfile();
  const t = await getTranslations("account");
  const tAuth = await getTranslations("auth");
  const locale = await getLocale();

  // Le profil peut manquer (migration pas encore appliquée) : l'e-mail de la
  // session reste une identité fiable et suffisante.
  const email = profile?.email ?? user.email ?? t("emailEmpty");
  const displayName = profile?.displayName?.trim() || t("displayNameEmpty");

  const createdAt = profile?.createdAt;
  const memberSince =
    createdAt && !Number.isNaN(Date.parse(createdAt))
      ? new Intl.DateTimeFormat(locale, { dateStyle: "long" }).format(
          new Date(createdAt),
        )
      : null;

  return (
    <AuthShell
      brand={tAuth("brand")}
      title={t("title")}
      subtitle={t("subtitle")}
      backHomeLabel={t("backHome")}
    >
      <dl className="divide-y divide-border border-y border-border">
        <div className="flex items-baseline justify-between gap-6 py-3">
          <dt className="font-mono text-[11px] tracking-[0.18em] text-muted-foreground uppercase">
            {t("displayName")}
          </dt>
          <dd className="text-right text-sm font-medium break-words text-foreground">
            {displayName}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-6 py-3">
          <dt className="font-mono text-[11px] tracking-[0.18em] text-muted-foreground uppercase">
            {t("email")}
          </dt>
          <dd className="text-right text-sm font-medium break-all text-foreground">
            {email}
          </dd>
        </div>
        {memberSince ? (
          <div className="flex items-baseline justify-between gap-6 py-3">
            <dt className="font-mono text-[11px] tracking-[0.18em] text-muted-foreground uppercase">
              {t("memberSince")}
            </dt>
            <dd className="text-right text-sm text-foreground">{memberSince}</dd>
          </div>
        ) : null}
      </dl>

      <div className="mt-8 flex flex-col gap-2">
        <Link
          href="/editor"
          className={cn(
            buttonVariants({ variant: "default", size: "lg" }),
            "h-10 w-full",
          )}
        >
          {t("openEditor")}
        </Link>
        <Link
          href="/read"
          className={cn(
            buttonVariants({ variant: "outline", size: "lg" }),
            "h-10 w-full",
          )}
        >
          {t("backToReader")}
        </Link>
      </div>

      <form action={signOut} className="mt-8 border-t border-foreground/10 pt-5">
        <Button type="submit" variant="ghost" size="sm" className="text-muted-foreground">
          {t("signOut")}
        </Button>
      </form>
    </AuthShell>
  );
}
