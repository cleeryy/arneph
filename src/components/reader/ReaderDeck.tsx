"use client";

import * as React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowUp, BookOpen, RotateCcw, Settings, VolumeX } from "lucide-react";

import { buildReaderSteps, globalProgress, type ReaderStep } from "@/lib/reader/steps";
import {
  normalizeWheelDelta,
  useReaderNavigation,
} from "@/hooks/useReaderNavigation";
import { useSectionAudio } from "@/hooks/useSectionAudio";
import { getSupabasePublicObjectUrl } from "@/lib/supabase/public-url";
import type { ReaderPageData } from "@/app/read/[webtoonId]/page";
import { ReaderSettings } from "./ReaderSettings";
import { useReaderPreferences } from "@/hooks/useReaderPreferences";
import { stepImageUrls, useStepPreload } from "@/hooks/useStepPreload";
import { ImageStep } from "./deck/ImageStep";
import { PanXStep } from "./deck/PanXStep";
import { AnimationStep } from "./deck/AnimationStep";
import { LongYStep } from "./deck/LongYStep";

const HEADER_HIDE_MS = 2000;
const STORAGE_PREFIX = "arneph:reader-index:v1:";
/** Intervalle minimal entre deux mises à jour de la progression long-y (~16 Hz). */
const LONG_Y_PROGRESS_INTERVAL_MS = 60;

/**
 * Position de défilement des images longues, par section. Conservée au niveau
 * du module : revenir sur une image longue doit retrouver l'endroit quitté,
 * même après un démontage du deck.
 */
const longYScrollPositions = new Map<string, number>();

function saveIndex(webtoonId: string, index: number): void {
  try {
    window.localStorage.setItem(`${STORAGE_PREFIX}${webtoonId}`, String(index));
  } catch {
    /* stockage indisponible : la lecture reste possible */
  }
}

function isInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(
    target.closest(
      "a,button,input,textarea,select,[role='button'],[data-long-y-step]",
    ),
  );
}

export function ReaderDeck({ data }: { data: ReaderPageData }) {
  const t = useTranslations("reader");
  const steps = React.useMemo(
    () => buildReaderSteps(data.webtoon.sections),
    [data.webtoon.sections],
  );
  const nav = useReaderNavigation(steps);
  const { playSectionAudio, pauseCurrent, unlocked, muted, toggleMuted } =
    useSectionAudio();
  const hydrated = React.useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const { preferences } = useReaderPreferences();
  useStepPreload(steps, nav.index);
  const [headerVisible, setHeaderVisible] = React.useState(true);
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [longYProgress, setLongYProgress] = React.useState(0);
  const [resetToken, setResetToken] = React.useState(0);
  const settingsOpenRef = React.useRef(false);
  const [resumeDismissed, setResumeDismissed] = React.useState(false);
  const hideTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStartY = React.useRef<number | null>(null);
  const touchDelta = React.useRef(0);
  const wheelAccumulator = React.useRef(0);
  const wheelFrame = React.useRef<number | null>(null);
  const longYProgressValue = React.useRef(0);
  const longYProgressAt = React.useRef(0);
  const longYProgressTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const navRef = React.useRef(nav);
  const stepKindRef = React.useRef<ReaderStep["kind"] | undefined>(undefined);

  const step: ReaderStep | undefined = nav.isEnd ? undefined : steps[nav.index];

  // Les listeners globaux sont attachés une seule fois : ils lisent l'état
  // courant via des refs, mises à jour après chaque rendu.
  React.useEffect(() => {
    navRef.current = nav;
    stepKindRef.current = step?.kind;
  });

  React.useEffect(() => {
    settingsOpenRef.current = settingsOpen;
  }, [settingsOpen]);

  // Reprise : lecture non bloquante du stockage (pas de setState en effet,
  // et aucun accès à `window` pendant le rendu serveur).
  const storageKey = `${STORAGE_PREFIX}${data.webtoon.id}`;
  const storedRaw = React.useSyncExternalStore(
    (onChange) => {
      window.addEventListener("storage", onChange);
      return () => window.removeEventListener("storage", onChange);
    },
    () => window.localStorage.getItem(storageKey),
    () => null,
  );
  const storedIndex = storedRaw === null ? null : Number.parseInt(storedRaw, 10);
  const savedIndex =
    storedIndex !== null &&
    Number.isFinite(storedIndex) &&
    storedIndex > 0 &&
    storedIndex < steps.length &&
    !resumeDismissed
      ? storedIndex
      : null;

  // On ne sauvegarde qu'après une vraie avancée : écrire 0 au montage
  // écraserait la position mémorisée avant que le bouton « Reprendre » ne
  // puisse la lire.
  React.useEffect(() => {
    if (!nav.isEnd && nav.index > 0) saveIndex(data.webtoon.id, nav.index);
  }, [data.webtoon.id, nav.index, nav.isEnd]);

  // Audio : une seule section montée, on pilote directement. `unlocked` fait
  // partie des dépendances : le premier geste doit relancer la piste mémorisée
  // même si l'étape n'a pas changé.
  React.useEffect(() => {
    if (!step?.section.audioPath) {
      pauseCurrent();
      return;
    }
    playSectionAudio(
      step.section.id,
      getSupabasePublicObjectUrl(step.section.audioPath),
    );
  }, [step, unlocked, playSectionAudio, pauseCurrent]);

  React.useEffect(() => () => pauseCurrent(), [pauseCurrent]);

  /** Le geste vers l'avant masque le header et le bouton « Reprendre ». */
  const dismissChrome = React.useCallback(() => {
    setHeaderVisible(false);
    setResumeDismissed(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
  }, []);

  const revealHeader = React.useCallback(() => {
    setHeaderVisible(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setHeaderVisible(false), HEADER_HIDE_MS);
  }, []);

  // Timers de confort : ils ne doivent jamais survivre au démontage.
  React.useEffect(
    () => () => {
      if (hideTimer.current !== null) {
        clearTimeout(hideTimer.current);
        hideTimer.current = null;
      }
      if (longYProgressTimer.current !== null) {
        clearTimeout(longYProgressTimer.current);
        longYProgressTimer.current = null;
      }
    },
    [],
  );

  /**
   * Progression d'une image longue : throttlée (~16 Hz) pour éviter un render
   * React par frame de scroll. La dernière valeur est toujours publiée.
   */
  const handleLongYProgress = React.useCallback((value: number) => {
    longYProgressValue.current = value;
    const now = Date.now();
    const elapsed = now - longYProgressAt.current;
    if (elapsed >= LONG_Y_PROGRESS_INTERVAL_MS) {
      longYProgressAt.current = now;
      setLongYProgress(value);
      return;
    }
    if (longYProgressTimer.current !== null) return;
    longYProgressTimer.current = setTimeout(() => {
      longYProgressTimer.current = null;
      longYProgressAt.current = Date.now();
      setLongYProgress(longYProgressValue.current);
    }, LONG_Y_PROGRESS_INTERVAL_MS - elapsed);
  }, []);

  // Le header se masque après quelques secondes ; chaque geste le réaffiche
  // via `revealHeader` (aucun setState synchrone dans cet effet).
  React.useEffect(() => {
    const timer = setTimeout(() => setHeaderVisible(false), HEADER_HIDE_MS);
    return () => clearTimeout(timer);
  }, []);

  // Molette : on intercepte sauf dans une section long-y (scroll natif).
  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      if (settingsOpenRef.current) return;
      if (isInteractiveTarget(event.target)) return;
      // Ctrl/⌘ + molette = zoom navigateur : ne jamais l'avaler (WCAG 1.4.4).
      if (event.ctrlKey || event.metaKey) return;
      // Firefox renvoie des lignes (`DOM_DELTA_LINE`), pas des pixels.
      const delta = normalizeWheelDelta(
        event.deltaY,
        event.deltaMode,
        window.innerHeight,
      );
      if (delta === 0) return;
      if (delta > 0) dismissChrome();
      else revealHeader();
      if (stepKindRef.current === "long-y") return;
      event.preventDefault();

      // Un seul rendu par frame : les trackpads émettent des dizaines
      // d'événements par seconde.
      wheelAccumulator.current += delta;
      if (wheelFrame.current === null) {
        wheelFrame.current = requestAnimationFrame(() => {
          wheelFrame.current = null;
          const accumulated = wheelAccumulator.current;
          wheelAccumulator.current = 0;
          navRef.current.handleWheel(accumulated);
        });
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("wheel", onWheel);
      if (wheelFrame.current !== null) {
        cancelAnimationFrame(wheelFrame.current);
        wheelFrame.current = null;
      }
    };
  }, [revealHeader, dismissChrome]);

  // Tactile : sur une étape discrète, un geste = une étape (commit au
  // touchend). Les étapes épinglées gardent un pilotage continu.
  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const isContinuousStep = () =>
      stepKindRef.current === "pan-x" || stepKindRef.current === "animation";
    const onTouchStart = (event: TouchEvent) => {
      if (settingsOpenRef.current) return;
      revealHeader();
      touchStartY.current = event.touches[0]?.clientY ?? null;
      touchDelta.current = 0;
    };
    const onTouchMove = (event: TouchEvent) => {
      if (settingsOpenRef.current) return;
      // Pincement : laisser le zoom natif au navigateur (WCAG 1.4.4).
      if (event.touches.length > 1) {
        touchDelta.current = 0;
        return;
      }
      if (isInteractiveTarget(event.target) || stepKindRef.current === "long-y") {
        return;
      }
      const current = event.touches[0]?.clientY;
      if (current === undefined || touchStartY.current === null) return;
      const delta = touchStartY.current - current;
      touchStartY.current = current;
      if (Math.abs(delta) < 6) return;
      if (delta > 0) dismissChrome();
      else revealHeader();
      event.preventDefault();
      if (isContinuousStep()) {
        navRef.current.handleWheel(delta);
        return;
      }
      // Les étapes image accumulent pendant le geste et ne naviguent qu'au
      // relâchement, sinon un long swipe traverse plusieurs sections.
      touchDelta.current += delta;
    };
    const resetTouch = () => {
      touchStartY.current = null;
      touchDelta.current = 0;
    };
    const onTouchEnd = (event: TouchEvent) => {
      const accumulated = touchDelta.current;
      resetTouch();
      // Un doigt encore posé : ce n'est pas la fin du geste.
      if (event.touches.length > 0) return;
      if (settingsOpenRef.current || accumulated === 0) return;
      if (isContinuousStep() || stepKindRef.current === "long-y") return;
      navRef.current.handleWheel(accumulated);
    };
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd);
    el.addEventListener("touchcancel", resetTouch);
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", resetTouch);
    };
  }, [revealHeader, dismissChrome]);

  // Clavier.
  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (settingsOpenRef.current) return;
      if (isInteractiveTarget(event.target)) return;

      // Sur une image longue, les flèches défilent D'ABORD le contenu ;
      // la navigation ne prend le relais qu'en butée.
      if (stepKindRef.current === "long-y") {
        const el = containerRef.current?.querySelector<HTMLElement>(
          "[data-testid='long-y-scroll']",
        );
        const forward = event.key === "ArrowDown" || event.key === "PageDown";
        const backward = event.key === "ArrowUp" || event.key === "PageUp";
        if (el && (forward || backward)) {
          const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
          const atTop = el.scrollTop <= 0;
          if ((forward && atBottom) || (backward && atTop)) {
            event.preventDefault();
            if (forward) navRef.current.goNext();
            else navRef.current.goPrev();
            revealHeader();
            return;
          }
          event.preventDefault();
          el.scrollBy({ top: (forward ? 1 : -1) * el.clientHeight * 0.9 });
          revealHeader();
          return;
        }
      }

      if (navRef.current.handleKey(event.key)) {
        event.preventDefault();
        if (event.key === "ArrowUp" || event.key === "ArrowLeft" || event.key === "PageUp") {
          revealHeader();
        } else {
          dismissChrome();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [revealHeader, dismissChrome]);

  // Entre deux images simples, l'échange doit être instantané : toute
  // animation laisserait voir le fond une frame.
  const previousStep =
    nav.index - nav.direction >= 0 ? steps[nav.index - nav.direction] : undefined;
  const isImageSwap =
    step?.kind === "image" && previousStep?.kind === "image";

  const innerProgress =
    step?.kind === "long-y" ? longYProgress : nav.inner;
  const preloadLayers = React.useMemo(() => {
    if (nav.isEnd) return null;
    return steps.map((candidate, index) =>
      index !== nav.index && Math.abs(index - nav.index) <= 2 ? (
        <div
          key={candidate.section.id}
          aria-hidden="true"
          style={{ display: "none" }}
          data-preload-step={index}
        >
          {stepImageUrls(candidate).map((url) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={url} src={url} alt="" loading="eager" decoding="async" />
          ))}
        </div>
      ) : null,
    );
  }, [steps, nav.index, nav.isEnd]);

  const progress = globalProgress(steps, nav.index, innerProgress);
  const total = steps.length;

  if (steps.length === 0) {
    return (
      <main className="flex h-[100dvh] items-center justify-center bg-background px-6">
        <p className="text-center text-sm text-muted-foreground">
          {t("empty")}
        </p>
      </main>
    );
  }

  return (
    <main
      ref={containerRef}
      data-testid="reader-deck"
      data-hydrated={hydrated ? "true" : "false"}
      className="relative h-[100dvh] overflow-hidden bg-background"
      onClick={(event) => {
        if (settingsOpenRef.current) return;
        if (isInteractiveTarget(event.target)) return;
        if (step?.kind === "long-y") return;
        nav.handleTap(event.clientX, window.innerWidth);
      }}
    >
      <header
        inert={!headerVisible}
        aria-hidden={!headerVisible}
        data-visible={headerVisible ? "true" : "false"}
        className="pointer-events-none absolute inset-x-0 top-0 z-30 bg-gradient-to-b from-black/60 to-transparent px-4 pb-8 pt-[max(0.75rem,env(safe-area-inset-top))] transition-opacity duration-200 data-[visible=false]:opacity-0 motion-reduce:transition-none"
      >
        <div className="pointer-events-auto flex items-center justify-between gap-3 text-white">
          <Link
            href="/read"
            className="rounded-md px-2 py-1 text-sm font-medium underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:outline-none"
          >
            ← {t("title")}
          </Link>
          <span className="truncate font-heading text-sm font-semibold">
            {data.webtoon.title}
          </span>
          <div className="flex shrink-0 items-center gap-1">
            <span className="text-xs tabular-nums text-white/80">
              {Math.min(nav.index + 1, total)}/{total}
            </span>
            <button
              type="button"
              data-testid="reader-mute-button"
              aria-label={t("mute")}
              aria-pressed={muted}
              onClick={toggleMuted}
              className={
                "inline-flex size-8 items-center justify-center rounded-md hover:bg-white/15 focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:outline-none " +
                (muted ? "bg-white/15 text-white" : "text-white/90")
              }
            >
              <VolumeX aria-hidden="true" className="size-4" />
            </button>
            <button
              type="button"
              data-testid="reader-settings-button"
              aria-label={t("settings")}
              onClick={() => setSettingsOpen(true)}
              className="inline-flex size-8 items-center justify-center rounded-md text-white/90 hover:bg-white/15 focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:outline-none"
            >
              <Settings aria-hidden="true" className="size-4" />
            </button>
          </div>
        </div>
      </header>

      {nav.isEnd ? (
        <section
          data-testid="reader-end"
          className="flex h-full flex-col items-center justify-center gap-6 px-6 text-center"
        >
          <BookOpen aria-hidden="true" className="size-10 text-muted-foreground" />
          <h2 className="font-heading text-2xl font-semibold text-foreground">
            {t("endTitle")}
          </h2>
          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={() => nav.goTo(0)}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              <RotateCcw aria-hidden="true" className="size-4" />
              {t("endRestart")}
            </button>
            <Link
              href="/read"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-border px-5 text-sm font-medium text-foreground hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              <BookOpen aria-hidden="true" className="size-4" />
              {t("endLibrary")}
            </Link>
          </div>
        </section>
      ) : (
        <div
          key={nav.index}
          data-testid="reader-frame"
          className="mx-auto h-full w-full max-w-[860px] px-2 [container-type:inline-size] sm:px-4"
        >
        <div
          data-testid="reader-step"
          data-step-kind={step?.kind}
          className={
            "h-full " +
            (preferences.smoothY && nav.direction !== 0 && !isImageSwap
              ? nav.direction > 0
                ? "reader-step-forward"
                : "reader-step-backward"
              : "")
          }
        >
          {step?.kind === "image" ? (
            <ImageStep section={step.section} priority={nav.index === 0} />
          ) : null}
          {step?.kind === "pan-x" ? (
            <PanXStep
              section={step.section}
              progress={nav.inner}
              smooth={preferences.smoothX}
            />
          ) : null}
          {step?.kind === "animation" ? (
            <AnimationStep section={step.section} progress={nav.inner} />
          ) : null}
          {step?.kind === "long-y" ? (
            <LongYStep
              section={step.section}
              initialScrollTop={longYScrollPositions.get(step.section.id) ?? 0}
              onScrollTopChange={(top) =>
                longYScrollPositions.set(step.section.id, top)
              }
              onScrollProgress={handleLongYProgress}
              resetToken={resetToken}
              onBoundary={(edge) => (edge === "bottom" ? nav.goNext() : nav.goPrev())}
            />
          ) : null}
        </div>
        </div>
      )}

      {preloadLayers}

      {!nav.isEnd && step?.kind === "long-y" ? (
        <button
          type="button"
          onClick={() => setResetToken((token) => token + 1)}
          aria-label={t("backToTop")}
          className="absolute right-4 top-[max(3.5rem,calc(env(safe-area-inset-top)+3rem))] z-20 inline-flex size-9 items-center justify-center rounded-full border border-border bg-background/90 text-foreground shadow backdrop-blur focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <ArrowUp aria-hidden="true" className="size-4" />
        </button>
      ) : null}

      {savedIndex !== null ? (
        <button
          type="button"
          data-testid="resume-reading"
          onClick={() => {
            nav.goTo(savedIndex);
            setResumeDismissed(true);
          }}
          className="absolute bottom-[max(1.5rem,calc(env(safe-area-inset-bottom)+1rem))] left-4 z-20 inline-flex items-center rounded-full border border-border bg-background/95 px-3 py-1.5 text-xs font-medium shadow-lg backdrop-blur focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          {t("resumeAt", { percent: Math.round((savedIndex / Math.max(1, total - 1)) * 100) })}
        </button>
      ) : null}

      <ReaderSettings open={settingsOpen} onClose={() => setSettingsOpen(false)} />

      <div
        role="progressbar"
        aria-label={t("readingProgress")}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress * 100)}
        data-testid="reader-progress"
        className="absolute inset-x-0 bottom-0 z-30 h-[3px] bg-muted"
        style={{ marginBottom: "env(safe-area-inset-bottom)" }}
      >
        <div
          className="h-full bg-primary transition-[width] duration-150 ease-out motion-reduce:transition-none"
          style={{ width: `${(progress * 100).toFixed(2)}%` }}
        />
      </div>
    </main>
  );
}
