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
  /** Progression interne 0→1, utilisée par la barre globale. */
  onScrollProgress?: (progress: number) => void;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Geste supplémentaire (en fraction d'écran) avant de quitter une butée. */
const EDGE_HOLD_RATIO = 0.2;

/**
 * Étape image longue : défilement **piloté** (pas de scroll natif).
 *
 * Le conteneur reste en `overflow-hidden` et les gestes (molette, tactile) sont
 * interceptés pour déplacer `scrollTop` nous-mêmes. C'est ce qui évite les
 * comportements natifs capricieux sur iOS/Android (rebond, barre d'adresse,
 * overscroll) et garantit un rendu identique partout.
 *
 * Un léger momentum est appliqué au tactile pour conserver la sensation
 * naturelle.
 */
export function LongYStep({
  section,
  onBoundary,
  initialScrollTop = 0,
  onScrollTopChange,
  onScrollProgress,
}: LongYStepProps) {
  const t = useTranslations("reader.section");
  const config = section.config as LongYSectionConfig;
  const fxPath = typeof config.fxPath === "string" ? config.fxPath.trim() : "";

  const scrollerRef = React.useRef<HTMLDivElement>(null);
  const latchedRef = React.useRef<LongYBoundaryEdge | null>(null);
  const momentumRef = React.useRef<number | null>(null);
  const edgeAccumulatorRef = React.useRef(0);
  const callbacksRef = React.useRef({ onBoundary, onScrollTopChange, onScrollProgress });

  React.useEffect(() => {
    callbacksRef.current = { onBoundary, onScrollTopChange, onScrollProgress };
  });

  const publish = React.useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    callbacksRef.current.onScrollTopChange?.(el.scrollTop);
    const range = el.scrollHeight - el.clientHeight;
    callbacksRef.current.onScrollProgress?.(
      range > 0 ? clamp(el.scrollTop / range, 0, 1) : 1,
    );
  }, []);

  const notify = React.useCallback((edge: LongYBoundaryEdge) => {
    if (latchedRef.current === edge) return;
    latchedRef.current = edge;
    callbacksRef.current.onBoundary(edge);
  }, []);

  /** L'image doit être décodée avant de décider qu'on est « en butée ». */
  const isContentReady = React.useCallback((): boolean => {
    const el = scrollerRef.current;
    if (!el) return false;
    const image = el.querySelector("img");
    return Boolean(image && image.complete && image.naturalHeight > 0);
  }, []);

  const scrollBy = React.useCallback(
    (delta: number): boolean => {
      const el = scrollerRef.current;
      if (!el) return false;
      if (!isContentReady()) return false;
      const max = el.scrollHeight - el.clientHeight;
      if (max <= 0) return false;
      const next = clamp(el.scrollTop + delta, 0, max);
      if (next === el.scrollTop) return false;
      el.scrollTop = next;
      latchedRef.current = null;
      publish();
      return true;
    },
    [publish],
  );

  // Restaure la position au montage (retour arrière) et publie la progression.
  React.useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = Math.max(0, initialScrollTop);
    publish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Gestes : listeners natifs non passifs pour pouvoir bloquer le scroll natif.
  React.useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;

    const stopMomentum = () => {
      if (momentumRef.current !== null) {
        cancelAnimationFrame(momentumRef.current);
        momentumRef.current = null;
      }
    };

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      stopMomentum();
      if (!isContentReady()) return;

      const el = scrollerRef.current;
      if (!el) return;
      const max = el.scrollHeight - el.clientHeight;
      const moved = scrollBy(event.deltaY);

      // En butée (ou contenu plus court que l'écran), il faut insister un peu
      // avant de quitter l'étape : sinon on saute sans voir la fin.
      if (!moved) {
        const atEdge =
          max <= 0 ||
          (event.deltaY > 0
            ? el.scrollTop >= max
            : el.scrollTop <= 0);
        if (!atEdge) return;
        edgeAccumulatorRef.current += Math.abs(event.deltaY);
        if (edgeAccumulatorRef.current >= el.clientHeight * EDGE_HOLD_RATIO) {
          edgeAccumulatorRef.current = 0;
          notify(event.deltaY > 0 ? "bottom" : "top");
        }
        return;
      }
      edgeAccumulatorRef.current = 0;
    };

    let touchY: number | null = null;
    let touchScroll = 0;
    let velocity = 0;
    let lastTime = 0;
    /** Dépassement cumulé hors butée pendant le geste courant. */
    let overscroll = 0;

    const onTouchStart = (event: TouchEvent) => {
      stopMomentum();
      touchY = event.touches[0]?.clientY ?? null;
      touchScroll = el.scrollTop;
      velocity = 0;
      overscroll = 0;
      lastTime = performance.now();
      latchedRef.current = null;
    };

    const onTouchMove = (event: TouchEvent) => {
      const current = event.touches[0]?.clientY;
      if (current === undefined || touchY === null) return;
      event.preventDefault();
      const max = el.scrollHeight - el.clientHeight;
      const raw = touchScroll - (current - touchY);
      const next = clamp(raw, 0, max);

      // Dépassement au-delà d'une butée : on le mémorise pour décider, au
      // relâchement, si l'utilisateur veut vraiment quitter l'étape.
      if (raw > max) overscroll = Math.max(overscroll, raw - max);
      if (raw < 0) overscroll = Math.min(overscroll, raw);

      const now = performance.now();
      const dt = Math.max(1, now - lastTime);
      velocity = (next - el.scrollTop) / dt;
      lastTime = now;
      el.scrollTop = next;
      latchedRef.current = null;
      publish();
    };

    const onTouchEnd = () => {
      if (touchY === null) return;
      touchY = null;
      const max = el.scrollHeight - el.clientHeight;
      const threshold = Math.max(24, el.clientHeight * EDGE_HOLD_RATIO);

      // Sortie de butée : le geste a dépassé le contenu de ~12 % d'écran.
      if (overscroll >= threshold) {
        stopMomentum();
        overscroll = 0;
        notify("bottom");
        return;
      }
      if (overscroll <= -threshold) {
        stopMomentum();
        overscroll = 0;
        notify("top");
        return;
      }

      if (Math.abs(velocity) < 0.05 || max <= 0) return;

      let momentum = clamp(velocity * 16, -80, 80);
      const step = () => {
        momentum *= 0.94;
        const next = clamp(el.scrollTop + momentum, 0, max);
        if (next === el.scrollTop || Math.abs(momentum) < 0.4) {
          momentumRef.current = null;
          return;
        }
        el.scrollTop = next;
        publish();
        momentumRef.current = requestAnimationFrame(step);
      };
      momentumRef.current = requestAnimationFrame(step);
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd);
    el.addEventListener("touchcancel", onTouchEnd);

    return () => {
      stopMomentum();
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [publish, scrollBy, notify, isContentReady]);

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
        onScroll={publish}
        className="h-full w-full overflow-hidden"
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
