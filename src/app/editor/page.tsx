import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { listWebtoons } from "@/lib/db/queries";
import { requireUserOrRedirect } from "@/lib/auth/require-user";
import { signOut } from "@/lib/auth/actions";
import { WebtoonListClient } from "@/components/editor/WebtoonListClient";

export const dynamic = "force-dynamic";

export default async function EditorPage() {
  const user = await requireUserOrRedirect("/editor");
  const t = await getTranslations("editor");
  const webtoons = await listWebtoons(user.id);

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
      <main className="flex flex-1 flex-col bg-background px-6 py-12">
        <div className="mx-auto w-full max-w-4xl">
          <WebtoonListClient
            title={t("title")}
            webtoons={webtoons.map((webtoon) => ({
              id: webtoon.id,
              title: webtoon.title,
              visibility: webtoon.visibility,
            }))}
          />
        </div>
      </main>
    </div>
  );
}
