"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";

import { webtoonSizes } from "@/lib/image/sizes";
import type { SectionWithImages } from "@/lib/db/queries";
import { getSupabasePublicObjectUrl } from "@/lib/supabase/public-url";

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
 * qui est rendue. `next/image` reçoit width/height (dims réelles post-resize
 * T11 stockées en BDD) et `sizes` (T12) ; le ratio est conservé par
 * `h-auto w-full`. AUCUNE animation : le défilement est celui de la page.
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

  return (
    <Image
      src={sectionImageUrl(image.storagePath)}
      alt={alt}
      width={image.width}
      height={image.height}
      sizes={webtoonSizes()}
      priority={priority}
      fetchPriority={priority ? "high" : "low"}
      loading={priority ? "eager" : "lazy"}
      className="h-auto w-full"
      unoptimized
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
 * Flux natif strictement : aucune animation, l'image occupe sa hauteur
 * naturelle et défile avec la page. `next/image` sert l'optimisé
 * (AVIF/WebP T12), jamais `<img>` natif ni le fichier source.
 */
export function ImageSection({ section, priority = false, blurDataURL }: ImageSectionProps) {
  const t = useTranslations("reader.section");

  return (
    <div
      data-testid="section-image"
      data-section={section.type}
      data-section-id={section.id}
      data-section-position={section.position}
      className="w-full"
    >
      <SectionImage section={section} priority={priority} blurDataURL={blurDataURL} alt={t("image")} />
    </div>
  );
}

export default ImageSection;
