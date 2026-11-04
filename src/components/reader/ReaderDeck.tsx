"use client";

import * as React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowUp, BookOpen, RotateCcw, Settings } from "lucide-react";

import { buildReaderSteps, globalProgress, type ReaderStep } from "@/lib/reader/steps";
import { useReaderNavigation } from "@/hooks/useReaderNavigation";
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
  const { playSectionAudio, pauseCurrent } = useSectionAudio();
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
  const settingsOpenRef = React.useRef(false);
  const [resumeDismissed, setResumeDismissed] = React.useState(false);
  const hideTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStartY = React.useRef<number | null>(null);
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

  // Audio : une seule section montée, on pilote directement.
  React.useEffect(() => {
    if (!step?.section.audioPath) {
      pauseCurrent();
      return;
    }
    playSectionAudio(
      step.section.id,
      getSupabasePublicObjectUrl(step.section.audioPath),
    );
  }, [step, playSectionAudio, pauseCurrent]);

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
      if (isInteractiveTarget(event.target)) return;
      if (event.deltaY > 0) dismissChrome();
      else revealHeader();
      if (stepKindRef.current === "long-y") return;
      event.preventDefault();
      navRef.current.handleWheel(event.deltaY);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [revealHeader, dismissChrome]);

  // Tactile : même logique, seuil géré par l'accumulateur du hook.
  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onTouchStart = (event: TouchEvent) => {
      revealHeader();
      touchStartY.current = event.touches[0]?.clientY ?? null;
    };
    const onTouchMove = (event: TouchEvent) => {
      if (isInteractiveTarget(event.target) || stepKindRef.current === "long-y") return;
      const current = event.touches[0]?.clientY;
      if (current === undefined || touchStartY.current === null) return;
      const delta = touchStartY.current - current;
      touchStartY.current = current;
      if (Math.abs(delta) < 6) return;
      if (delta > 0) dismissChrome();
      else revealHeader();
      event.preventDefault();
      navRef.current.handleWheel(delta);
    };
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
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
  }, [revealHeader]);

  // Image de l'étape précédente, affichée sous l'étape courante : pendant le
  // décodage de la nouvelle image, on voit l'ancienne au lieu du fond blanc.
  const backdropIndex =
    nav.direction === 0 ? -1 : nav.index - nav.direction;
  const backdropStep =
    backdropIndex >= 0 && backdropIndex < steps.length
      ? steps[backdropIndex]
      : undefined;
  const backdropUrl =
    backdropStep && backdropStep.kind !== "long-y"
      ? stepImageUrls(backdropStep)[0]
      : undefined;

  // Entre deux images simples, toute animation laisse voir le fond une frame :
  // on échange donc instantanément (les deux images sont déjà préchargées).
  const previousStep =
    nav.index - nav.direction >= 0 ? steps[nav.index - nav.direction] : undefined;
  const isImageSwap =
    step?.kind === "image" && previousStep?.kind === "image";

  const innerProgress =
    step?.kind === "long-y" ? longYProgress : nav.inner;
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
        if (isInteractiveTarget(event.target)) return;
        if (step?.kind === "long-y") return;
        nav.handleTap(event.clientX, window.innerWidth);
      }}
    >
      <header
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

      {backdropUrl && !nav.isEnd ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={backdropUrl}
            alt=""
            className="max-h-full max-w-full object-contain opacity-60"
            draggable={false}
          />
        </div>
      ) : null}

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
              onScrollProgress={setLongYProgress}
              onBoundary={(edge) => (edge === "bottom" ? nav.goNext() : nav.goPrev())}
            />
          ) : null}
        </div>
        </div>
      )}

      {/* Images des sections voisines, montées mais invisibles : elles sont
          déjà téléchargées et décodées quand on change d'écran. */}
      {!nav.isEnd
        ? steps.map((candidate, index) =>
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
          )
        : null}

      {!nav.isEnd && step?.kind === "long-y" ? (
        <button
          type="button"
          onClick={() => nav.goTo(nav.index)}
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
