"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";

import { SCROLL_DISTANCES } from "@/lib/scroll/constants";
import {
  frameIndexFromProgress,
  spritePositionFromFrame,
} from "@/lib/scroll/transforms";
import type { SectionWithImages } from "@/lib/db/queries";
import type { AnimationSectionConfig } from "@/types/webtoon";
import { getSupabasePublicObjectUrl } from "@/lib/supabase/public-url";

/**
 * Entier ≥ 1. Toute config corrompue (NaN, 0, négatif, chaîne, Infinity) est
 * ramenée au repli : aucune valeur non finie ne doit atteindre le style CSS.
 */
function safeInt(value: unknown, fallback = 1): number {
  const n = typeof value === "number" ? Math.floor(value) : Number.NaN;
  return Number.isFinite(n) && n >= 1 ? n : fallback;
}

/** Dimension CSS finie et strictement positive, sinon repli. */
function safeDimension(value: unknown, fallback = 1): number {
  const n = typeof value === "number" ? value : Number.NaN;
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Premier chemin non vide (les chaînes blanches comptent comme absentes). */
function firstNonBlank(...candidates: Array<string | undefined | null>): string {
  for (const candidate of candidates) {
    const value = typeof candidate === "string" ? candidate.trim() : "";
    if (value) return value;
  }
  return "";
}

function middleFrame(frameCount: number): number {
  return Math.round((Math.max(1, frameCount) - 1) / 2);
}

export interface AnimationSectionProps {
  section: SectionWithImages;
}

/**
 * Section animation : sprite sheet 2D (T11) pilotée frame par frame par le
 * scroll. Un SEUL élément en `background-image` + `background-position` —
 * jamais N `<img>` empilés. La grille 2D (T11, maxColumns 10) garantit que
 * `columns*frameWidth` et `rows*frameHeight` restent sous 16384px.
 *
 * La config est revalidée ici (clamp) : le lecteur peut recevoir une config
 * éditée/corrompue avant le passage par `sectionConfigSchema`, et une valeur
 * non finie produirait `NaNpx` dans `background-size`. Sans chemin de sprite,
 * on rend un placeholder borné plutôt qu'une zone de scroll vide et une
 * requête vers la racine du bucket.
 */
export function AnimationSection({ section }: AnimationSectionProps) {
  const t = useTranslations("reader.section");
  const reducedMotion = useReducedMotion() === true;

  // Invariant T7 : section.config.type === section.type (animation). La config
  // est l'autorité pour le découpage en frames ; le sprite est stocké comme
  // image de la section (upload T11), `config.spritePath` sert de secours.
  const config = section.config as AnimationSectionConfig;
  const frameWidth = safeDimension(config.frameWidth);
  const frameHeight = safeDimension(config.frameHeight);
  const columns = safeInt(config.columns);
  const rows = safeInt(config.rows);
  const frameCount = safeInt(config.frameCount);
  const scrollHeightVh = safeDimension(
    config.scrollHeight,
    SCROLL_DISTANCES.animation,
  );

  const spritePath = firstNonBlank(
    section.images[0]?.storagePath,
    config.spritePath,
  );
  const hasSprite = spritePath.length > 0;

  const containerRef = React.useRef<HTMLElement | null>(null);

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end end"],
  });

  const frameIndex = useTransform(scrollYProgress, (progress) =>
    frameIndexFromProgress(progress, frameCount),
  );

  const backgroundPosition = useTransform(frameIndex, (index) => {
    const { x, y } = spritePositionFromFrame(
      index,
      columns,
      frameWidth,
      frameHeight,
    );
    return `${-x}px ${-y}px`;
  });

  // Reduced-motion : frame médiane figée — aucun mouvement au scroll.
  const frozenPosition = React.useMemo(() => {
    const { x, y } = spritePositionFromFrame(
      middleFrame(frameCount),
      columns,
      frameWidth,
      frameHeight,
    );
    return `${-x}px ${-y}px`;
  }, [frameCount, columns, frameWidth, frameHeight]);

  // Média absent : placeholder borné, pas de hauteur de scroll synthétique.
  if (!hasSprite) {
    return (
      <section
        data-testid="animation-section"
        data-section-id={section.id}
        data-section-position={section.position}
        data-section-type={section.type}
        role="article"
        aria-label={t("animation")}
        className="relative overflow-hidden bg-background"
      >
        <div
          data-testid="animation-placeholder"
          className="mx-auto h-40 max-h-[40vh] w-full max-w-3xl overflow-hidden border-b border-border bg-muted/20"
        />
      </section>
    );
  }

  const backgroundImage = getSupabasePublicObjectUrl(spritePath);
  const backgroundSize = `${columns * frameWidth}px ${rows * frameHeight}px`;

  return (
    <section
      ref={containerRef}
      data-testid="animation-section"
      data-section-id={section.id}
      data-section-position={section.position}
      data-section-type={section.type}
      role="article"
      aria-label={t("animation")}
      className="relative overflow-hidden bg-background"
      style={{ height: `${scrollHeightVh}vh` }}
    >
      <div className="sticky top-0 grid h-screen place-items-center overflow-hidden bg-background supports-[height:100svh]:h-[100svh]">
        <motion.div
          data-testid="animation-frame"
          aria-hidden="true"
          className="m-auto shrink-0 bg-muted/20 select-none"
          style={{
            width: frameWidth,
            height: frameHeight,
            backgroundImage: `url("${backgroundImage}")`,
            backgroundSize,
            backgroundRepeat: "no-repeat",
            backgroundPosition: reducedMotion ? frozenPosition : backgroundPosition,
          }}
        />
      </div>
    </section>
  );
}
