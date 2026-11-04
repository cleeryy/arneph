"use client";

import * as React from "react";

import type { ReaderStep } from "@/lib/reader/steps";
import { getSupabasePublicObjectUrl } from "@/lib/supabase/public-url";

/** Images à précharger pour une étape (média principal + replis). */
export function stepImageUrls(step: ReaderStep): string[] {
  const { section } = step;
  const config = section.config;

  // Animation en frames : ne jamais précharger l'ancienne sprite (elle peut
  // peser des centaines de Mo). On ne charge que les premières frames.
  if (config.type === "animation" && Array.isArray(config.framePaths) && config.framePaths.length > 0) {
    return dedupe(config.framePaths.slice(0, 4)).map((path) =>
      getSupabasePublicObjectUrl(path),
    );
  }

  const paths: Array<string | undefined> = [section.images[0]?.storagePath];

  if (config.type === "image" || config.type === "long-y" || config.type === "pan-x") {
    paths.push(config.imagePath);
  }
  if (config.type === "animation") {
    paths.push(config.spritePath);
  }

  return dedupe(paths).map((path) => getSupabasePublicObjectUrl(path));
}

function dedupe(paths: Array<string | undefined>): string[] {
  const unique = new Set<string>();
  for (const path of paths) {
    const trimmed = path?.trim();
    if (trimmed) unique.add(trimmed);
  }
  return [...unique];
}

const loadedImages = new Map<string, HTMLImageElement>();

/**
 * Précharge des URLs d'images sans les monter dans le DOM.
 * Le cache évite de relancer une requête déjà demandée pendant la session.
 */
export function preloadImages(urls: string[]): void {
  if (typeof window === "undefined") return;
  for (const url of urls) {
    if (loadedImages.has(url)) continue;
    const image = new window.Image();
    image.decoding = "async";
    // Garder la référence : le bitmap décodé reste en mémoire, donc l'image
    // s'affiche immédiatement quand la section suivante est montée.
    loadedImages.set(url, image);
    image.src = url;
    void image.decode?.().catch(() => {});
  }
}

/** Remet le cache à zéro (tests). */
export function resetPreloadCache(): void {
  loadedImages.clear();
}

/**
 * Précharge l'étape courante et ses voisines (± `radius`) pour supprimer les
 * flashs blancs au changement d'écran.
 */
export function useStepPreload(
  steps: ReaderStep[],
  index: number,
  radius = 2,
): void {
  React.useEffect(() => {
    if (steps.length === 0) return;
    const from = Math.max(0, index - 1);
    const to = Math.min(steps.length - 1, index + radius);
    const urls: string[] = [];
    for (let i = from; i <= to; i += 1) {
      urls.push(...stepImageUrls(steps[i]));
    }
    preloadImages(urls);
  }, [steps, index, radius]);
}
