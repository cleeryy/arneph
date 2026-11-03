import { getTranslations } from "next-intl/server";
import { BookOpen } from "lucide-react";

import { listPublishedWebtoons } from "@/lib/db/queries";
import LibraryClient, {
  type LibraryWebtoon,
} from "@/components/reader/LibraryClient";

export const dynamic = "force-dynamic";

/**
 * Bibliothèque lecteur : webtoons publiés uniquement (fetch serveur T10, drafts
 * jamais exposés). La liste complète est rendue côté serveur (SEO / sans JS) ;
 * la recherche et le tri sont des améliorations client par-dessus cette liste.
 */
export default async function ReadPage() {
  const t = await getTranslations("reader");
  const webtoons = await listPublishedWebtoons();

  const libraryWebtoons: LibraryWebtoon[] = webtoons.map((webtoon) => ({
    id: webtoon.id,
    title: webtoon.title,
    description: webtoon.description,
    coverPath: webtoon.coverPath,
    createdAt: webtoon.createdAt,
  }));

  return (
    <main className="flex flex-1 flex-col bg-background">
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-5 py-10 sm:px-6 sm:py-14">
        <header className="flex flex-col gap-2 border-b border-border pb-8">
          <p className="font-mono text-[11px] font-medium tracking-[0.28em] text-muted-foreground uppercase">
            Arneph
          </p>
          <h1 className="font-heading text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
            {t("title")}
          </h1>
        </header>

        {libraryWebtoons.length === 0 ? (
          <div
            data-testid="reader-empty"
            className="mt-8 flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-muted/20 px-6 py-16 text-center"
          >
            <span className="flex size-11 items-center justify-center rounded-full border border-border bg-background text-muted-foreground">
              <BookOpen aria-hidden="true" className="size-5" />
            </span>
            <p className="max-w-xs text-sm text-muted-foreground">
              {t("empty")}
            </p>
          </div>
        ) : (
          <LibraryClient webtoons={libraryWebtoons} />
        )}
      </div>
    </main>
  );
}
