import { notFound } from "next/navigation";

import { getWebtoon, type WebtoonWithSections } from "@/lib/db/queries";
import ReaderShell from "@/components/reader/ReaderShell";

export const dynamic = "force-dynamic";

/**
 * Contrat de données de la page lecteur — consommé par T15 (ReaderShell).
 *
 * Ce Server Component charge le webtoon publié complet (sections ordonnées +
 * images imbriquées) puis le transmet au composant client `ReaderShell`.
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

  return <ReaderShell data={readerData} />;
}
