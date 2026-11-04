"use client";

import type { ReaderPageData } from "@/app/read/[webtoonId]/page";
import { ReaderDeck } from "./ReaderDeck";

/**
 * Point d'entrée du lecteur : le deck discret gère la navigation, l'audio,
 * la progression et les écrans de contenu.
 */
export default function ReaderShell({ data }: { data: ReaderPageData }) {
  return <ReaderDeck data={data} />;
}
