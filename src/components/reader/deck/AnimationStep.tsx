"use client";

import { useTranslations } from "next-intl";

import type { SectionWithImages } from "@/lib/db/queries";
import { spritePositionFromFrame } from "@/lib/scroll/transforms";
import { MAX_SPRITE_PIXELS } from "@/lib/image/limits";
import { getSupabasePublicObjectUrl } from "@/lib/supabase/public-url";
import type { AnimationSectionConfig } from "@/types/webtoon";

/** Entier ≥ 1 : toute config corrompue retombe sur le repli. */
function safeInt(value: unknown, fallback = 1): number {
  const n = typeof value === "number" ? Math.floor(value) : Number.NaN;
  return Number.isFinite(n) && n >= 1 ? n : fallback;
}

/** Dimension CSS finie et strictement positive, sinon repli. */
function safeDimension(value: unknown, fallback = 1): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : fallback;
}

function clampProgress(progress: number): number {
  return Number.isFinite(progress) ? Math.min(1, Math.max(0, progress)) : 0;
}

/**
 * Index de frame instantané : `floor(progress * frameCount)` borné à
 * `[0, frameCount - 1]`. Aucune interpolation — les frames commutent net.
 */
export function animationFrameIndex(progress: number, frameCount: number): number {
  const count = safeInt(frameCount);
  const index = Math.floor(clampProgress(progress) * count);
  return Math.min(count - 1, Math.max(0, index));
}

/** Premier chemin non vide (les chaînes blanches comptent comme absentes). */
function firstNonBlank(...candidates: Array<string | undefined | null>): string {
  for (const candidate of candidates) {
    const value = typeof candidate === "string" ? candidate.trim() : "";
    if (value) return value;
  }
  return "";
}

export interface AnimationStepProps {
  section: SectionWithImages;
  /** Progression interne de l'étape, 0→1 (pilotée par le deck). */
  progress: number;
}

/**
 * Étape animation : sprite sheet en `background-image`, frame choisie par
 * `progress`. Une seule frame visible à la fois, commutée sans transition.
 *
 * La géométrie est revalidée ici (clamp) : une config corrompue ne doit
 * jamais produire `NaNpx` dans les styles CSS.
 */
export function AnimationStep({ section, progress }: AnimationStepProps) {
  const t = useTranslations("reader.section");
  const config = section.config as AnimationSectionConfig;

  const frameWidth = safeDimension(config.frameWidth);
  const frameHeight = safeDimension(config.frameHeight);
  const columns = safeInt(config.columns);
  const rows = safeInt(config.rows);
  const frameCount = safeInt(config.frameCount);
  const frameIndex = animationFrameIndex(progress, frameCount);

  const framePaths = Array.isArray(config.framePaths)
    ? config.framePaths.filter((path): path is string => Boolean(path && path.trim()))
    : [];
  const spritePath = firstNonBlank(
    section.images[0]?.storagePath,
    config.spritePath,
  );

  // Une image par frame : on ne décode que la frame courante, plus quelques
  // voisines cachées pour éviter un flash au changement.
  if (framePaths.length > 0) {
    const current = framePaths[Math.min(frameIndex, framePaths.length - 1)];
    const preloadRadius = 3;
    const preload = framePaths
      .map((path, index) => ({ path, index }))
      .filter(
        ({ index }) =>
          index !== frameIndex && Math.abs(index - frameIndex) <= preloadRadius,
      );

    return (
      <section
        data-testid="animation-step"
        data-section-id={section.id}
        data-section-type={section.type}
        role="article"
        aria-label={t("animation")}
        className="relative grid h-full w-full place-items-center overflow-hidden bg-background"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          data-testid="animation-step-frame"
          data-frame-index={frameIndex}
          data-frame-count={framePaths.length}
          src={getSupabasePublicObjectUrl(current)}
          alt=""
          aria-hidden="true"
          width={frameWidth}
          height={frameHeight}
          className="block h-full w-auto max-w-full object-contain select-none"
          draggable={false}
        />
        {preload.map(({ path, index }) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={`${index}-${path}`}
            src={getSupabasePublicObjectUrl(path)}
            alt=""
            aria-hidden="true"
            data-preload-frame={index}
            style={{ display: "none" }}
          />
        ))}
      </section>
    );
  }

  if (!spritePath) {
    return (
      <section
        data-testid="animation-step"
        data-section-id={section.id}
        data-section-type={section.type}
        role="article"
        aria-label={t("animation")}
        className="relative h-full w-full overflow-hidden bg-background"
      >
        <div
          data-testid="animation-step-placeholder"
          className="mx-auto h-40 max-h-[40vh] w-full max-w-3xl overflow-hidden border-b border-border bg-muted/20"
        />
      </section>
    );
  }

  const sheetPixels = columns * frameWidth * rows * frameHeight;

  // Garde-fou mémoire : une sprite démesurée (16k×14k ≈ 900 Mo décodés) fait
  // tomber l'onglet. On refuse de la charger plutôt que de planter.
  if (sheetPixels > MAX_SPRITE_PIXELS) {
    return (
      <section
        data-testid="animation-step"
        data-section-id={section.id}
        data-section-type={section.type}
        role="article"
        aria-label={t("animation")}
        className="relative h-full w-full overflow-hidden bg-background"
      >
        <div
          data-testid="animation-step-too-large"
          className="mx-auto flex h-40 max-h-[40vh] w-full max-w-3xl items-center justify-center border-b border-border bg-muted/20 px-4 text-center text-xs text-muted-foreground"
        >
          {t("animationTooLarge")}
        </div>
      </section>
    );
  }

  const { x, y } = spritePositionFromFrame(
    frameIndex,
    columns,
    frameWidth,
    frameHeight,
  );
  const backgroundImage = getSupabasePublicObjectUrl(spritePath);
  const backgroundSize = `${columns * frameWidth}px ${rows * frameHeight}px`;

  return (
    <section
      data-testid="animation-step"
      data-section-id={section.id}
      data-section-type={section.type}
      role="article"
      aria-label={t("animation")}
      className="relative grid h-full w-full place-items-center overflow-hidden bg-background"
    >
      <div
        data-testid="animation-step-frame"
        data-frame-index={frameIndex}
        data-frame-count={frameCount}
        aria-hidden="true"
        className="bg-muted/20 select-none"
        style={{
          width: frameWidth,
          height: frameHeight,
          maxWidth: "100%",
          maxHeight: "100%",
          backgroundImage: `url("${backgroundImage}")`,
          backgroundSize,
          backgroundRepeat: "no-repeat",
          backgroundPosition: `${-x}px ${-y}px`,
        }}
      />
    </section>
  );
}

export default AnimationStep;
