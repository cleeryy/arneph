"use client";

import * as React from "react";

import type { ReaderStep } from "@/lib/reader/steps";
import { getSupabasePublicObjectUrl } from "@/lib/supabase/public-url";

/** Images à précharger pour une étape (média principal + replis). */
export function stepImageUrls(step: ReaderStep): string[] {
  const { section } = step;
  const config = section.config;
  const paths: Array<string | undefined> = [section.images[0]?.storagePath];

  if (config.type === "image" || config.type === "long-y" || config.type === "pan-x") {
    paths.push(config.imagePath);
  }
  if (config.type === "animation") {
    if (Array.isArray(config.framePaths) && config.framePaths.length > 0) {
      paths.push(config.framePaths[0]);
    } else {
      paths.push(config.spritePath);
    }
  }

  const unique = new Set<string>();
  for (const path of paths) {
    const trimmed = path?.trim();
    if (trimmed) unique.add(getSupabasePublicObjectUrl(trimmed));
  }
  return [...unique];
}

const loadedUrls = new Set<string>();

/**
 * Précharge des URLs d'images sans les monter dans le DOM.
 * Le cache évite de relancer une requête déjà demandée pendant la session.
 */
export function preloadImages(urls: string[]): void {
  if (typeof window === "undefined") return;
  for (const url of urls) {
    if (loadedUrls.has(url)) continue;
    loadedUrls.add(url);
    const image = new window.Image();
    image.decoding = "async";
    image.src = url;
  }
}

/** Remet le cache à zéro (tests). */
export function resetPreloadCache(): void {
  loadedUrls.clear();
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
