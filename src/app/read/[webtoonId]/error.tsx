"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function ReaderError({
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
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background px-6 py-24 text-center">
      <h2 className="font-heading text-xl font-semibold text-foreground">
        {t("generic")}
      </h2>
      <button
        type="button"
        onClick={() => unstable_retry()}
        className={cn(buttonVariants({ variant: "default", size: "lg" }))}
      >
        {t("retry")}
      </button>
    </main>
  );
}
