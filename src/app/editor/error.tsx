"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useTranslations } from "next-intl";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Frontière d'erreur de l'éditeur : une Server Action ou un rendu qui échoue
 * ne doit pas laisser l'utilisateur sur un écran blanc.
 */
export default function EditorError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  const t = useTranslations("errors");

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-background px-6 py-24 text-center">
      <h2 className="font-heading text-xl font-semibold text-foreground">
        {t("generic")}
      </h2>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => unstable_retry()}
          className={cn(buttonVariants({ variant: "default", size: "lg" }))}
        >
          {t("retry")}
        </button>
        <Link
          href="/editor"
          className={cn(buttonVariants({ variant: "outline", size: "lg" }))}
        >
          {t("backToEditor")}
        </Link>
      </div>
    </div>
  );
}
