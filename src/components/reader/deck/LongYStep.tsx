"use client";

import * as React from "react";
import { useTranslations } from "next-intl";

import type { SectionWithImages } from "@/lib/db/queries";
import type { FxOverlayConfig, LongYSectionConfig } from "@/types/webtoon";
import { FxOverlay } from "../FxOverlay";
import { StepImage } from "./StepImage";

export type LongYBoundaryEdge = "top" | "bottom";

export interface LongYStepProps {
  section: SectionWithImages;
  /**
   * Appelé quand l'utilisateur tente de défiler au-delà d'une butée. Le deck
   * s'en sert pour changer d'étape ; aucun listener global ici.
   */
  onBoundary: (edge: LongYBoundaryEdge) => void;
  /** Position de défilement à restaurer au montage (retour arrière). */
  initialScrollTop?: number;
  /** Remonte la position courante pour la mémoriser entre deux visites. */
  onScrollTopChange?: (scrollTop: number) => void;
}

function isAtTop(el: HTMLElement): boolean {
  return el.scrollTop <= 0;
}

function isAtBottom(el: HTMLElement): boolean {
  return el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
}

/**
 * Étape image longue : son PROPRE conteneur de défilement (`100dvh`,
 * `overscroll-contain`). L'image garde sa hauteur naturelle, l'overlay FX
 * défile avec elle.
 *
 * Les butées sont détectées localement (wheel + touch) : chaque geste en
 * butée ne prévient le deck qu'une fois, puis le verrou est relâché dès que
 * l'utilisateur repart dans le contenu.
 */
export function LongYStep({
  section,
  onBoundary,
  initialScrollTop = 0,
  onScrollTopChange,
}: LongYStepProps) {
  const t = useTranslations("reader.section");
  const config = section.config as LongYSectionConfig;
  const fxPath = typeof config.fxPath === "string" ? config.fxPath.trim() : "";

  const scrollerRef = React.useRef<HTMLDivElement>(null);
  const restoreRef = React.useRef(initialScrollTop);
  const latchedRef = React.useRef<LongYBoundaryEdge | null>(null);
  const touchStartYRef = React.useRef<number | null>(null);

  // Restaure la position au montage : revenir sur une image longue doit
  // retrouver l'endroit quitté (souvent le bas), pas le haut.
  React.useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const target = Math.max(0, restoreRef.current);
    if (target > 0) el.scrollTop = target;
  }, []);

  const handleScroll = (event: React.UIEvent<HTMLDivElement>) => {
    onScrollTopChange?.(event.currentTarget.scrollTop);
  };

  const notify = React.useCallback(
    (edge: LongYBoundaryEdge) => {
      if (latchedRef.current === edge) return;
      latchedRef.current = edge;
      onBoundary(edge);
    },
    [onBoundary],
  );

  const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    const el = event.currentTarget;
    if (event.deltaY < 0) {
      if (isAtTop(el)) notify("top");
      else latchedRef.current = null;
      return;
    }
    if (event.deltaY > 0) {
      if (isAtBottom(el)) notify("bottom");
      else latchedRef.current = null;
    }
  };

  const handleTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    touchStartYRef.current = event.touches[0]?.clientY ?? null;
    latchedRef.current = null;
  };

  const handleTouchMove = (event: React.TouchEvent<HTMLDivElement>) => {
    const startY = touchStartYRef.current;
    const currentY = event.touches[0]?.clientY;
    if (startY === null || currentY === undefined) return;

    const el = event.currentTarget;
    const deltaY = currentY - startY;
    if (deltaY > 0 && isAtTop(el)) notify("top");
    else if (deltaY < 0 && isAtBottom(el)) notify("bottom");
  };

  const handleTouchEnd = () => {
    touchStartYRef.current = null;
  };

  return (
    <section
      data-testid="long-y-step"
      data-section-id={section.id}
      data-section-type={section.type}
      role="article"
      aria-label={t("longY")}
      className="relative h-full w-full overflow-hidden bg-background"
    >
      <div
        ref={scrollerRef}
        data-testid="long-y-scroll"
        onScroll={handleScroll}
        className="h-full w-full overflow-y-auto overscroll-contain"
        onWheel={handleWheel}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
      >
        <div className="relative w-full">
          <StepImage
            section={section}
            alt={t("longY")}
            testId="long-y-step-image"
            className="block h-auto w-full max-w-none select-none"
          />
          {fxPath ? (
            <FxOverlay
              fxPath={fxPath}
              fxConfig={config.fxConfig as FxOverlayConfig | undefined}
            />
          ) : null}
        </div>
      </div>
    </section>
  );
}

export default LongYStep;
