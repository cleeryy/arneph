"use client";

import { useTranslations } from "next-intl";

import type { SectionWithImages } from "@/lib/db/queries";
import { resolvePanDirection } from "@/lib/reader/steps";
import { getSupabasePublicObjectUrl } from "@/lib/supabase/public-url";
import type { PanXSectionConfig } from "@/types/webtoon";

/**
 * Base du calcul de translation : `100%` = largeur rendue de l'image et
 * `100cqw` = largeur du cadre de lecture (container query). Le pan utile est
 * donc `100cqw - 100%`, négatif dès que l'image est plus large que le cadre.
 * Le cadre porte `container-type: inline-size` (voir ReaderDeck).
 */
const VIEWPORT_DELTA = "(100cqw - 100%)";

/** Zones mortes en début et fin : on voit le bord avant que ça n'enchaîne. */
const LEAD_IN = 0.08;
const LEAD_OUT = 0.08;

/** Coefficient de pan arrondi pour éviter les `0.30000000000004` en CSS. */
function panCoefficient(progress: number, direction: "ltr" | "rtl"): number {
  const clamped = Number.isFinite(progress)
    ? Math.min(1, Math.max(0, progress))
    : 0;
  const effective = Math.min(
    1,
    Math.max(0, (clamped - LEAD_IN) / (1 - LEAD_IN - LEAD_OUT)),
  );
  const raw = direction === "rtl" ? 1 - effective : effective;
  return Number(raw.toFixed(5));
}

/**
 * Transform CSS du pan horizontal.
 *
 * - `ltr` : part bord gauche (translate 0) et glisse vers la gauche ;
 * - `rtl` : part bord droit (translate maximale) et revient vers la gauche.
 *
 * Le terme `min(0px, …)` borne la translation à 0 quand l'image est plus
 * étroite que l'écran (aucun pan) ; le terme `max(0px, …)` recentre alors
 * l'image. Aucune mesure JS, aucun listener : tout est résolu par le CSS.
 */
export function panXStepTransform(
  progress: number,
  direction: "ltr" | "rtl",
): string {
  const coefficient = panCoefficient(progress, direction);
  const centering = `max(0px, ${VIEWPORT_DELTA} / 2)`;
  const pan = `min(0px, ${VIEWPORT_DELTA} * ${coefficient})`;
  return `translateX(calc(${centering} + ${pan}))`;
}

/** Premier chemin non vide (les chaînes blanches comptent comme absentes). */
function firstNonBlank(...candidates: Array<string | undefined | null>): string {
  for (const candidate of candidates) {
    const value = typeof candidate === "string" ? candidate.trim() : "";
    if (value) return value;
  }
  return "";
}

function safeDimension(value: unknown, fallback = 1): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.round(value)
    : fallback;
}

export interface PanXStepProps {
  section: SectionWithImages;
  /** Progression interne de l'étape, 0→1 (pilotée par le deck). */
  progress: number;
  /** Interpole visuellement entre deux crans de molette. */
  smooth?: boolean;
}

/**
 * Étape panoramique : image large épinglée plein écran, révélée par une
 * translation horizontale proportionnelle à `progress`.
 *
 * L'image est rendue à hauteur d'écran (`h-full w-auto`) et se déplace via un
 * `transform` CSS uniquement — aucun hook de scroll, aucun listener global.
 * Une image déjà plus étroite que l'écran reste statique et centrée (calcul
 * CSS `min`/`max`).
 */
export function PanXStep({ section, progress, smooth = true }: PanXStepProps) {
  const t = useTranslations("reader.section");
  const config = section.config as PanXSectionConfig;
  const image = section.images[0];
  const direction = resolvePanDirection(config);

  const storagePath = firstNonBlank(image?.storagePath, config.imagePath);
  const width = safeDimension(config.width ?? image?.width);
  const height = safeDimension(config.height ?? image?.height);

  const sectionData = {
    "data-testid": "pan-x-step",
    "data-section-id": section.id,
    "data-section-type": section.type,
    "data-direction": direction,
    role: "article",
    "aria-label": t("panX"),
  } as const;

  if (!storagePath) {
    return (
      <section {...sectionData} className="relative h-full w-full overflow-hidden bg-background">
        <div
          data-testid="pan-x-step-placeholder"
          className="mx-auto h-40 max-h-[40vh] w-full max-w-3xl overflow-hidden border-b border-border bg-muted/20"
        />
      </section>
    );
  }

  const src = getSupabasePublicObjectUrl(storagePath);
  const transform = panXStepTransform(progress, direction);

  return (
    <section {...sectionData} className="relative h-full w-full overflow-hidden bg-background">
      <img
        data-testid="pan-x-step-image"
        src={src}
        alt={t("panX")}
        width={width}
        height={height}
        loading="lazy"
        decoding="async"
        draggable={false}
        className="absolute top-0 left-0 h-full w-auto max-w-none bg-muted/20 select-none"
        style={{
          transform,
          willChange: "transform",
          transition: smooth
            ? "transform 140ms linear"
            : undefined,
        }}
      />
    </section>
  );
}

export default PanXStep;
