import { notFound } from "next/navigation";

import { getWebtoon, type WebtoonWithSections } from "@/lib/db/queries";

/**
 * Contrat de données de la page lecteur — consommé par T15 (ReaderShell).
 *
 * Ce Server Component charge le webtoon publié complet (sections ordonnées +
 * images imbriquées) puis le transmet au composant client `ReaderShell`.
 * T15 importera `ReaderPageData` depuis ce fichier et remplacera le
 * placeholder ci-dessous par `<ReaderShell data={readerData} />`.
 */
export interface ReaderPageData {
  webtoon: WebtoonWithSections;
}

export default async function ReadWebtoonPage({
  params,
}: {
  params: Promise<{ webtoonId: string }>;
}) {
  // Next 16 : params est une Promise — await obligatoire.
  const { webtoonId } = await params;

  const webtoon = await getWebtoon(webtoonId);

  // Id inconnu/invalide OU draft → 404 (un draft n'est jamais lisible).
  if (!webtoon || webtoon.visibility !== "published") {
    notFound();
  }

  const readerData: ReaderPageData = { webtoon };

  // T15 : remplacer ce placeholder par <ReaderShell data={readerData} />.
  return (
    <main className="flex min-h-dvh flex-col bg-background px-6 py-12">
      <div
        id="reader-shell-placeholder"
        data-webtoon-id={readerData.webtoon.id}
        className="mx-auto w-full max-w-[800px] text-center"
      >
        <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">
          {readerData.webtoon.title}
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          {readerData.webtoon.sections.length} section(s) — rendu lecteur (T15)
        </p>
      </div>
    </main>
  );
}
