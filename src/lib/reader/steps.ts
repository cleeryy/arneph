import type { SectionWithImages } from "@/lib/db/queries";
import type {
  AnimationSectionConfig,
  PanXSectionConfig,
} from "@/types/webtoon";

/** Une image simple occupe exactement un écran. */
export const IMAGE_SLIDE_VH = 100;

export const DEFAULT_PAN_DISTANCE_VH = 150;
export const MIN_PAN_DISTANCE_VH = 100;
export const MAX_PAN_DISTANCE_VH = 400;

export const ANIMATION_VH_PER_FRAME = 20;
export const MIN_ANIMATION_VH = 100;
export const MAX_ANIMATION_VH = 600;

export type PanDirection = "ltr" | "rtl";

export type ReaderStep =
  | { kind: "image"; section: SectionWithImages; lengthVh: number }
  | { kind: "long-y"; section: SectionWithImages }
  | {
      kind: "pan-x";
      section: SectionWithImages;
      lengthVh: number;
      direction: PanDirection;
    }
  | {
      kind: "animation";
      section: SectionWithImages;
      lengthVh: number;
      frameCount: number;
    };

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Longueur d'épinglage d'un panoramique, bornée à [100, 400] vh. */
export function resolvePanLengthVh(config: PanXSectionConfig): number {
  const raw = config.panDistance;
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    return DEFAULT_PAN_DISTANCE_VH;
  }
  return clamp(raw, MIN_PAN_DISTANCE_VH, MAX_PAN_DISTANCE_VH);
}

/** Sens du panoramique, `ltr` par défaut. */
export function resolvePanDirection(config: PanXSectionConfig): PanDirection {
  return config.direction === "rtl" ? "rtl" : "ltr";
}

/**
 * Durée d'une animation : `scrollHeight` si défini, sinon 20 vh par frame,
 * borné à [100, 600] vh.
 */
export function resolveAnimationLengthVh(config: AnimationSectionConfig): number {
  const explicit = config.scrollHeight;
  if (typeof explicit === "number" && Number.isFinite(explicit) && explicit > 0) {
    return clamp(explicit, MIN_ANIMATION_VH, MAX_ANIMATION_VH);
  }
  const frames = Math.max(1, Math.floor(config.frameCount) || 1);
  return clamp(frames * ANIMATION_VH_PER_FRAME, MIN_ANIMATION_VH, MAX_ANIMATION_VH);
}

/**
 * Transforme les sections (triées par position) en étapes de lecture.
 * Une étape = un écran (image) ou une zone épinglée (pan-x, animation),
 * sauf `long-y` qui garde son défilement natif.
 */
export function buildReaderSteps(sections: SectionWithImages[]): ReaderStep[] {
  const sorted = [...sections].sort((a, b) => a.position - b.position);

  return sorted.map((section): ReaderStep => {
    switch (section.config.type) {
      case "pan-x":
        return {
          kind: "pan-x",
          section,
          lengthVh: resolvePanLengthVh(section.config),
          direction: resolvePanDirection(section.config),
        };
      case "animation":
        return {
          kind: "animation",
          section,
          lengthVh: resolveAnimationLengthVh(section.config),
          frameCount: Math.max(1, Math.floor(section.config.frameCount) || 1),
        };
      case "long-y":
        return { kind: "long-y", section };
      case "image":
      default:
        return { kind: "image", section, lengthVh: IMAGE_SLIDE_VH };
    }
  });
}

/**
 * Poids d'une étape dans la progression globale, exprimé en « écrans ».
 * Une image vaut 1, un panoramique/animation sa durée épinglée, et une image
 * longue sa hauteur réelle — sinon la barre resterait figée pendant qu'on la
 * parcourt.
 */
export function stepWeight(step: ReaderStep, viewportHeight = 800): number {
  const vh = Math.max(1, viewportHeight);
  switch (step.kind) {
    case "long-y": {
      const config = step.section.config as { height?: number };
      const height =
        typeof config.height === "number" && Number.isFinite(config.height)
          ? config.height
          : 0;
      return Math.max(1, height / vh);
    }
    case "image":
      return 1;
    default:
      return Math.max(1, step.lengthVh / 100);
  }
}

/**
 * Progression globale 0→1 d'un webtoon, pondérée par le contenu réel de
 * chaque étape et incluant la progression interne de l'étape courante.
 */
export function globalProgress(
  steps: ReaderStep[],
  stepIndex: number,
  innerProgress: number,
  viewportHeight = 800,
): number {
  if (steps.length === 0) return 0;
  if (stepIndex < 0) return 0;
  if (stepIndex > steps.length - 1) return 1;

  const index = Math.floor(stepIndex);
  const weights = steps.map((step) => stepWeight(step, viewportHeight));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  const before = weights.slice(0, index).reduce((sum, weight) => sum + weight, 0);
  const current = weights[index] * clamp(innerProgress, 0, 1);

  return clamp((before + current) / Math.max(1e-6, total), 0, 1);
}
