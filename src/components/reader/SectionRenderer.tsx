"use client";

import { useTranslations } from "next-intl";

import type { SectionWithImages } from "@/lib/db/queries";
import type { SectionType } from "@/types/webtoon";
import { ImageSection } from "./ImageSection";
import { LongYSection } from "./LongYSection";

/**
 * Dispatch par type de section — réutilisable par l'éditeur (T22+).
 *
 * Les composants finaux arrivent en T16 (image), T17 (long-y / pan-x) et
 * T18 (animation) : ce fichier rend des STUBS temporaires visibles qui
 * documentent l'ordre, le type et la config de chaque section. Le switch et
 * l'interface de props restent stables quand les composants réels
 * remplaceront les stubs.
 */
export interface SectionRendererProps {
  section: SectionWithImages;
}

const STUB_TESTID: Record<SectionType, string> = {
  image: "section-stub-image",
  "long-y": "section-stub-long-y",
  "pan-x": "section-stub-pan-x",
  animation: "section-stub-animation",
};

/** Stub temporaire : boîte visible + label i18n, aucune logique de scroll. */
function SectionStub({ section }: { section: SectionWithImages }) {
  const t = useTranslations("reader.section");

  const labels: Record<SectionType, string> = {
    image: t("image"),
    "long-y": t("longY"),
    "pan-x": t("panX"),
    animation: t("animation"),
  };

  // Config = autorité (invariant T7 : config.type === section.type). Les types
  // image/long-y/pan-x exposent width×height → ratio d'aspect de la section ;
  // animation expose frameWidth×frameHeight (pas de ratio pleine section).
  const { config } = section;
  const hasAspect = "width" in config && "height" in config;
  const aspectRatio = hasAspect ? `${config.width} / ${config.height}` : undefined;

  return (
    <div
      data-testid={STUB_TESTID[section.type]}
      data-section-id={section.id}
      data-section-position={section.position}
      data-section-type={section.type}
      role="article"
      aria-label={labels[section.type]}
      className="mx-auto w-full overflow-hidden border-b border-border bg-muted/20"
      style={aspectRatio ? { aspectRatio } : undefined}
    >
      <div className="flex min-h-48 w-full flex-col items-center justify-center gap-1.5 px-4 py-10 text-center">
        <p className="font-heading text-sm font-semibold tracking-tight text-foreground">
          {labels[section.type]}
        </p>
        <p className="text-xs text-muted-foreground">{t("pending")}</p>
        {section.images.length > 0 ? (
          <p className="text-[11px] text-muted-foreground">
            {t("sectionImageCount", { count: section.images.length })}
          </p>
        ) : null}
        <p className="mt-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground/70">
          {t("position", { position: section.position })}
        </p>
      </div>
    </div>
  );
}

export function SectionRenderer({ section }: SectionRendererProps) {
  // Chaque case sera remplacée par le composant final T16/T17/T18 — le switch
  // matérialise le dispatch par type exigé par le plan.
  switch (section.type) {
    case "image":
      return <ImageSection section={section} priority={section.position === 1} />;
    case "long-y":
      return <LongYSection section={section} priority={section.position === 1} />;
    case "pan-x":
      return <SectionStub section={section} />;
    case "animation":
      return <SectionStub section={section} />;
    default:
      // Union fermée (T7) — jamais atteint, préserve l'exhaustivité.
      return null;
  }
}
