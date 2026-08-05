"use client";

import { useTranslations } from "next-intl";

import type { SectionWithImages } from "@/lib/db/queries";
import type { FxOverlayConfig } from "@/types/webtoon";
import { FxOverlay } from "./FxOverlay";
import { SectionImage } from "./ImageSection";

export interface LongYSectionProps {
  section: SectionWithImages;
  /** Première section du webtoon : chargement prioritaire (pas de lazy). */
  priority?: boolean;
  /** Placeholder flou optionnel (data-URI) avant chargement de l'image. */
  blurDataURL?: string;
}

/**
 * Section image longue axe Y — délègue à `SectionImage` (ImageSection).
 *
 * Même rendu qu'ImageSection : l'image très haute occupe sa hauteur
 * naturelle et défile avec la page. Les images animées (GIF) sont
 * rendues en `<img>` natif pour préserver l'animation ; les images
 * statiques utilisent `next/image` avec `unoptimized`. Le `sizes`
 * forcé à 800px est supprimé (shrink fix T16).
 */
export function LongYSection({ section, priority = false, blurDataURL }: LongYSectionProps) {
  const t = useTranslations("reader.section");
  const fxPath = (section.config as { fxPath?: string }).fxPath;
  const fxConfig = (section.config as { fxConfig?: FxOverlayConfig }).fxConfig;

  const image = (
    <SectionImage
      section={section}
      priority={priority}
      blurDataURL={blurDataURL}
      alt={t("longY")}
    />
  );

  return (
    <div
      data-testid="section-long-y"
      data-section={section.type}
      data-section-id={section.id}
      data-section-position={section.position}
      className="w-full"
    >
      {fxPath ? (
        <div className="relative">
          {image}
          <FxOverlay fxPath={fxPath} fxConfig={fxConfig} />
        </div>
      ) : (
        image
      )}
    </div>
  );
}

export default LongYSection;
