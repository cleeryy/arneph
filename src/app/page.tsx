import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { BookOpen, PenLine } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default async function Home() {
  const t = await getTranslations("home");

  return (
    <main className="flex flex-1 flex-col items-center justify-center bg-background px-6 py-24">
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="font-heading text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          {t("title")}
        </h1>
        <p className="mt-2 max-w-md text-pretty text-base leading-7 text-muted-foreground sm:text-lg">
          {t("subtitle")}
        </p>
      </div>

      <nav className="mt-12 flex w-full max-w-sm flex-col gap-3">
        <Link
          href="/editor"
          className={cn(
            buttonVariants({ variant: "default", size: "lg" }),
            "h-12 w-full gap-2 text-base"
          )}
        >
          <PenLine aria-hidden="true" />
          {t("editorLink")}
        </Link>
        <Link
          href="/read"
          className={cn(
            buttonVariants({ variant: "outline", size: "lg" }),
            "h-12 w-full gap-2 text-base"
          )}
        >
          <BookOpen aria-hidden="true" />
          {t("readerLink")}
        </Link>
      </nav>
    </main>
  );
}
