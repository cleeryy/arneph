import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { signOut } from "@/lib/auth/actions";

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
            <form action={signOut}>
              <button
                type="submit"
                className="text-sm font-medium text-muted-foreground underline-offset-4 hover:underline"
              >
                {t("signOut")}
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}
