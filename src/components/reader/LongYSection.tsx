"use client";

import { useTranslations } from "next-intl";

import type { SectionWithImages } from "@/lib/db/queries";
import { SectionImage } from "./ImageSection";

export interface LongYSectionProps {
  section: SectionWithImages;
  /** Première section du webtoon : chargement prioritaire (pas de lazy). */
  priority?: boolean;
  /** Placeholder flou optionnel (data-URI) avant chargement de l'image. */
  blurDataURL?: string;
}

/**
 * Section image longue axe Y — flux natif strictement.
 *
 * Même rendu qu'ImageSection : l'image très haute occupe sa hauteur naturelle
 * et défile avec la page. DÉCISION (plan) : PAS d'animation sticky/zoom — le
 * scroll natif est déjà la meilleure perf. `next/image` sert le WebP optimisé
 * (T12), pas le fichier source (contrainte mémoire).
 */
export function LongYSection({ section, priority = false, blurDataURL }: LongYSectionProps) {
  const t = useTranslations("reader.section");

  return (
    <div
      data-testid="section-long-y"
      data-section={section.type}
      data-section-id={section.id}
      data-section-position={section.position}
      className="w-full"
    >
      <SectionImage
        section={section}
        priority={priority}
        blurDataURL={blurDataURL}
        alt={t("longY")}
      />
    </div>
  );
}

export default LongYSection;
