"use client";

import type { CSSProperties } from "react";
import { useTranslations } from "next-intl";

import type { SectionWithImages } from "@/lib/db/queries";
import type {
  FxOverlayConfig,
  ImageFit,
  ImageFocus,
  ImageSectionConfig,
} from "@/types/webtoon";
import { FxOverlay } from "../FxOverlay";
import { StepImage } from "./StepImage";

/** Classes de cadrage : `100dvh` est porté par la section, l'image s'y adapte. */
const FIT_CLASSNAME: Record<ImageFit, string> = {
  contain: "block h-auto max-h-full w-auto max-w-full object-contain select-none",
  cover: "absolute inset-0 h-full w-full object-cover select-none",
  width: "block h-auto w-full max-w-none select-none",
};

function resolveFit(config: ImageSectionConfig): ImageFit {
  return config.fit === "cover" || config.fit === "width" ? config.fit : "contain";
}

function resolveFocus(config: ImageSectionConfig): ImageFocus {
  return config.focus === "top" || config.focus === "bottom"
    ? config.focus
    : "center";
}

function objectPositionForFocus(focus: ImageFocus): string {
  if (focus === "top") return "center top";
  if (focus === "bottom") return "center bottom";
  return "center";
}

export interface ImageStepProps {
  section: SectionWithImages;
  /** Étape affichée au premier écran : chargement prioritaire. */
  priority?: boolean;
}

/**
 * Étape image statique : un écran plein (`100dvh`), aucune animation.
 *
 * Trois cadrages :
 * - `contain` (défaut) : image entière, centrée ;
 * - `cover` : remplit l'écran, recadrée selon `focus` (`object-position`) ;
 * - `width` : pleine largeur, hauteur auto, centrée verticalement.
 *
 * L'overlay FX (GIF/WebP animé) reste le seul élément animé de l'étape.
 */
export function ImageStep({ section, priority = false }: ImageStepProps) {
  const t = useTranslations("reader.section");
  const config = section.config as ImageSectionConfig;
  const fit = resolveFit(config);
  const focus = resolveFocus(config);
  const fxPath = typeof config.fxPath === "string" ? config.fxPath.trim() : "";

  const imageStyle: CSSProperties | undefined =
    fit === "cover" ? { objectPosition: objectPositionForFocus(focus) } : undefined;

  const image = (
    <StepImage
      section={section}
      alt={t("image")}
      priority={priority}
      testId="image-step-image"
      className={FIT_CLASSNAME[fit]}
      style={imageStyle}
    />
  );

  return (
    <section
      data-testid="image-step"
      data-section-id={section.id}
      data-section-type={section.type}
      data-fit={fit}
      data-focus={fit === "cover" ? focus : undefined}
      role="article"
      aria-label={t("image")}
      className="relative h-full w-full overflow-hidden bg-background"
    >
      {fit === "cover" ? (
        image
      ) : (
        <div className="flex h-full w-full items-center justify-center">{image}</div>
      )}
      {fxPath ? (
        <FxOverlay
          fxPath={fxPath}
          fxConfig={config.fxConfig as FxOverlayConfig | undefined}
        />
      ) : null}
    </section>
  );
}

export default ImageStep;
