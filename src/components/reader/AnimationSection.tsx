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

export function spriteUrl(storagePath: string): string {
  return getSupabasePublicObjectUrl(storagePath);
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
 */
export function AnimationSection({ section }: AnimationSectionProps) {
  const t = useTranslations("reader.section");
  const reducedMotion = useReducedMotion() === true;

  // Invariant T7 : section.config.type === section.type (animation). La config
  // est l'autorité pour le découpage en frames ; le sprite est stocké comme
  // image de la section (upload T11), `config.spritePath` sert de secours.
  const config = section.config as AnimationSectionConfig;
  const frameCount = Math.max(1, Math.floor(config.frameCount));
  const columns = Math.max(1, Math.floor(config.columns));
  const rows = Math.max(1, Math.floor(config.rows));
  const scrollHeightVh = config.scrollHeight ?? SCROLL_DISTANCES.animation;

  const spritePath = section.images[0]?.storagePath ?? config.spritePath;
  const backgroundImage = spriteUrl(spritePath);
  const backgroundSize = `${columns * config.frameWidth}px ${
    rows * config.frameHeight
  }px`;

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
      config.frameWidth,
      config.frameHeight,
    );
    return `${-x}px ${-y}px`;
  });

  // Reduced-motion : frame médiane figée — aucun mouvement au scroll.
  const frozenPosition = React.useMemo(() => {
    const { x, y } = spritePositionFromFrame(
      middleFrame(frameCount),
      columns,
      config.frameWidth,
      config.frameHeight,
    );
    return `${-x}px ${-y}px`;
  }, [frameCount, columns, config.frameWidth, config.frameHeight]);

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
            width: config.frameWidth,
            height: config.frameHeight,
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
