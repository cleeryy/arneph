import { getTranslations } from "next-intl/server";

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
    <main className="flex flex-1 flex-col bg-background px-6 py-12">
      <div className="mx-auto w-full max-w-3xl">
        <h1 className="font-heading text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          {t("title")}
        </h1>
      </div>

      {libraryWebtoons.length === 0 ? (
        <p
          data-testid="reader-empty"
          className="mx-auto mt-24 text-center text-base text-muted-foreground"
        >
          {t("empty")}
        </p>
      ) : (
        <LibraryClient webtoons={libraryWebtoons} />
      )}
    </main>
  );
}
