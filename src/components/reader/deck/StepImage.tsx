"use client";

import Image from "next/image";
import { createContext, useContext } from "react";
import type * as React from "react";

import type { SectionWithImages } from "@/lib/db/queries";
import { isAnimatedMime } from "@/lib/image/animated";
import {
  getSupabasePublicObjectUrl,
  getSupabaseRenderUrl,
} from "@/lib/supabase/public-url";

export type ImageLoading = "eager" | "lazy";

/**
 * Mode de chargement par défaut des `StepImage` d'un sous-arbre.
 *
 * L'aperçu éditeur monte des dizaines d'étapes hors écran : il fournit `lazy`
 * une seule fois, sans avoir à propager la prop à travers chaque étape.
 */
export const StepImageLoadingContext = createContext<ImageLoading>("eager");

/** Dimension entière strictement positive, sinon repli à 1 (jamais NaNpx). */
function safeDimension(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.round(value) : 1;
}

export interface StepImageProps {
  section: SectionWithImages;
  alt: string;
  /** Étape visible au premier écran : chargement prioritaire. */
  priority?: boolean;
  /**
   * Mode de chargement natif. `eager` par défaut côté lecteur ; l'aperçu
   * éditeur force `lazy` via `StepImageLoadingContext`.
   */
  loading?: ImageLoading;
  className: string;
  style?: React.CSSProperties;
  testId: string;
}

/**
 * Image d'une étape du deck (`images[0]` uniquement).
 *
 * Les images animées (GIF, mimeType `image/gif` ou extension `.gif`) gardent un
 * `<img>` natif pour préserver l'animation et pointent vers l'URL objet
 * Supabase (une URL imgproxy ré-encoderait le GIF en image fixe). Les images
 * statiques passent par `next/image` avec le loader imgproxy responsive.
 * Aucun transform ni transition : le cadrage est entièrement piloté par les
 * classes passées par l'appelant.
 */
export function StepImage({
  section,
  alt,
  priority = false,
  loading: loadingProp,
  className,
  style,
  testId,
}: StepImageProps) {
  const inheritedLoading = useContext(StepImageLoadingContext);
  const loading = loadingProp ?? inheritedLoading;

  const image = section.images[0];
  if (!image) return null;

  const storagePath =
    typeof image.storagePath === "string" ? image.storagePath.trim() : "";
  if (!storagePath) return null;

  const src = storagePath;
  const width = safeDimension(image.width);
  const height = safeDimension(image.height);
  const animated =
    isAnimatedMime(image.mimeType) || storagePath.toLowerCase().endsWith(".gif");

  if (animated) {
    return (
      <img
        data-testid={testId}
        data-image-variant="native"
        src={getSupabasePublicObjectUrl(src)}
        alt={alt}
        width={width}
        height={height}
        loading={loading}
        decoding="async"
        draggable={false}
        className={className}
        style={style}
      />
    );
  }

  return (
    <Image
      data-testid={testId}
      data-image-variant="next"
      src={src}
      loader={({ src: path, width: targetWidth }) =>
        getSupabaseRenderUrl(path, { width: targetWidth })
      }
      sizes="(max-width: 900px) 100vw, 860px"
      alt={alt}
      width={width}
      height={height}
      priority={priority}
      fetchPriority={priority ? "high" : "low"}
      loading={loading}
      decoding="async"
      draggable={false}
      className={className}
      style={style}
    />
  );
}

export default StepImage;
