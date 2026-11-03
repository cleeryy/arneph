"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";

import { isAnimatedMime } from "@/lib/image/animated";
import type { SectionWithImages } from "@/lib/db/queries";
import { getSupabasePublicObjectUrl } from "@/lib/supabase/public-url";
import type { FxOverlayConfig } from "@/types/webtoon";
import { FxOverlay } from "./FxOverlay";

/**
 * URL publique d'une image du bucket storage `webtoon-images`.
 * (même pattern que `coverUrl` T14).
 */
export function sectionImageUrl(storagePath: string): string {
  return getSupabasePublicObjectUrl(storagePath);
}

/**
 * Rendu commun des sections à flux NATIF (image simple + long-y).
 *
 * Une section de ce type contient UNE image (position 0) — c'est la première
 * qui est rendue. Les images animées (GIF) sont servies via `<img>` natif
 * pour préserver l'animation ; les images statiques utilisent `next/image`
 * avec `unoptimized` (contrainte AGENTS.md). Le `sizes` forcé à 800px est
 * supprimé (shrink fix T16) — l'image rend à sa taille réelle, bornée par
 * le conteneur via `max-w-none`.
 */
export function SectionImage({
  section,
  priority,
  blurDataURL,
  alt,
}: {
  section: SectionWithImages;
  /** Première section du webtoon : chargement prioritaire (pas de lazy). */
  priority: boolean;
  /** Placeholder flou optionnel (data-URI) avant chargement de l'image. */
  blurDataURL?: string;
  alt: string;
}) {
  const image = section.images[0];

  // Section sans image → aucun contenu à rendre (défensif, cas éditeur vide).
  if (!image) return null;

  const src = sectionImageUrl(image.storagePath);
  const animated =
    isAnimatedMime(image.mimeType) || image.storagePath.endsWith(".gif");

  // Images animées (GIF) → <img> natif pour préserver l'animation.
  if (animated) {
    return (
      <img
        data-testid="native-img"
        src={src}
        alt={alt}
        width={image.width}
        height={image.height}
        loading={priority ? "eager" : "lazy"}
        decoding="async"
        draggable={false}
        className="mx-auto block h-auto w-full max-w-none bg-muted/20 select-none"
      />
    );
  }

  // Images statiques → next/image avec unoptimized (contrainte AGENTS.md).
  return (
    <Image
      src={src}
      alt={alt}
      width={image.width}
      height={image.height}
      priority={priority}
      fetchPriority={priority ? "high" : "low"}
      loading={priority ? "eager" : "lazy"}
      className="mx-auto block h-auto w-full max-w-none bg-muted/20 select-none"
      unoptimized
      draggable={false}
      style={{ maxWidth: image.width > 0 ? image.width : undefined }}
      {...(blurDataURL ? { placeholder: "blur", blurDataURL } : undefined)}
    />
  );
}

export interface ImageSectionProps {
  section: SectionWithImages;
  /** Première section du webtoon : chargement prioritaire (pas de lazy). */
  priority?: boolean;
  /** Placeholder flou optionnel (data-URI) avant chargement de l'image. */
  blurDataURL?: string;
}

/**
 * Section image simple — cas de base du lecteur webtoon.
 *
 * Les images animées (GIF, mimeType `image/gif` ou extension `.gif`)
 * sont rendues en `<img>` natif pour préserver l'animation.
 * Les images statiques utilisent `next/image` avec `unoptimized`
 * (contrainte AGENTS.md). Le `sizes` forcé à 800px est supprimé
 * (shrink fix T16) — l'image rend à sa taille réelle.
 */
export function ImageSection({ section, priority = false, blurDataURL }: ImageSectionProps) {
  const t = useTranslations("reader.section");
  const fxPath = (section.config as { fxPath?: string }).fxPath;
  const fxConfig = (section.config as { fxConfig?: FxOverlayConfig }).fxConfig;

  const image = (
    <SectionImage section={section} priority={priority} blurDataURL={blurDataURL} alt={t("image")} />
  );

  return (
    <div
      data-testid="section-image"
      data-section={section.type}
      data-section-id={section.id}
      data-section-position={section.position}
      className="w-full overflow-hidden bg-background"
    >
      {fxPath ? (
        <div className="relative mx-auto w-full overflow-hidden">
          {image}
          <FxOverlay fxPath={fxPath} fxConfig={fxConfig} />
        </div>
      ) : (
        image
      )}
    </div>
  );
}

export default ImageSection;
