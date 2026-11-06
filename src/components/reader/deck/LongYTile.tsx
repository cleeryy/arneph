"use client";

import Image from "next/image";

import { getSupabaseRenderUrl } from "@/lib/supabase/public-url";

export interface LongYTileProps {
  /** Chemin Storage relatif de la tuile (jamais une URL complète). */
  storagePath: string;
  alt: string;
  /** Largeur de sortie de la planche, partagée par toutes les tuiles. */
  width: number;
  /** Hauteur réelle de cette tuile (la dernière peut être plus courte). */
  height: number;
  /** Première tuile : chargement prioritaire pour éviter le flash d'entrée. */
  priority?: boolean;
  /** Index de la tuile, exposé pour le ciblage (`[data-tile-index="0"]`). */
  index?: number;
  testId?: string;
}

/**
 * Une tuile verticale d'une planche `long-y` segmentée.
 *
 * `width`/`height` sont déclarés : le navigateur réserve la hauteur avant le
 * décodage, donc `scrollHeight` reste stable et la position de lecture ne
 * saute pas quand les tuiles arrivent. Le loader imgproxy est identique à
 * `StepImage`, sans `unoptimized`.
 */
export function LongYTile({
  storagePath,
  alt,
  width,
  height,
  priority = false,
  index,
  testId,
}: LongYTileProps) {
  return (
    <Image
      data-testid={testId}
      data-tile-index={index}
      data-image-variant="tile"
      src={storagePath}
      loader={({ src, width: targetWidth }) =>
        getSupabaseRenderUrl(src, { width: targetWidth })
      }
      sizes="100vw"
      alt={alt}
      width={width}
      height={height}
      priority={priority}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      draggable={false}
      className="block h-auto w-full max-w-none select-none"
    />
  );
}

export default LongYTile;
