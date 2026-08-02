import { getTranslations } from "next-intl/server";
import Link from "next/link";

export default async function EditorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const t = await getTranslations("editor");

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="sticky top-0 z-10 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="text-sm font-medium text-muted-foreground underline-offset-4 hover:underline"
            >
              ← {t("backToHome")}
            </Link>
          </div>
          <h1 className="font-heading text-lg font-semibold tracking-tight text-foreground">
            {t("title")}
          </h1>
          <div className="flex items-center gap-2">
            <Link
              href="/read"
              className="text-sm font-medium text-muted-foreground underline-offset-4 hover:underline"
            >
              {t("readerLink")}
            </Link>
            <button
              type="button"
              className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
              disabled
              aria-label={t("save")}
            >
              {t("save")}
            </button>
          </div>
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}
