import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default async function NotFound() {
  const t = await getTranslations("errors");

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 bg-background px-6 py-24 text-center">
      <h2 className="font-heading text-2xl font-semibold text-foreground">
        {t("notFound")}
      </h2>
      <p className="max-w-md text-sm text-muted-foreground">{t("generic")}</p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/"
          className={cn(buttonVariants({ variant: "default", size: "lg" }))}
        >
          {t("backHome")}
        </Link>
        <Link
          href="/read"
          className={cn(buttonVariants({ variant: "outline", size: "lg" }))}
        >
          {t("openReader")}
        </Link>
      </div>
    </main>
  );
}
