"use client";

import type { SectionWithImages } from "@/lib/db/queries";
import { ImageStep } from "../reader/deck/ImageStep";
import { PanXStep } from "../reader/deck/PanXStep";
import { AnimationStep } from "../reader/deck/AnimationStep";
import { LongYStep } from "../reader/deck/LongYStep";

interface PreviewRendererProps {
  section: SectionWithImages;
  /**
   * Progression interne utilisée pour les étapes épinglées. La valeur par
   * défaut (milieu) rend immédiatement visible le sens du panoramique et la
   * frame courante de l'animation quand l'auteur change un réglage.
   */
  progress?: number;
}

/**
 * Aperçu éditeur : mêmes composants que le lecteur, dans un cadre borné.
 * Ce qui est vu ici est exactement ce qui sera lu.
 */
export function PreviewRenderer({ section, progress = 0.5 }: PreviewRendererProps) {
  return (
    <div
      data-testid="preview-frame"
      data-section-type={section.type}
      className="relative mx-auto h-72 w-full overflow-hidden rounded-lg border border-border bg-muted/20"
    >
      {section.type === "image" ? (
        <ImageStep section={section} />
      ) : section.type === "long-y" ? (
        <LongYStep section={section} onBoundary={() => {}} />
      ) : section.type === "pan-x" ? (
        <PanXStep section={section} progress={progress} />
      ) : (
        <AnimationStep section={section} progress={progress} />
      )}
    </div>
  );
}
