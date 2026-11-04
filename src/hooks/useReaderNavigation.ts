import * as React from "react";

import type { ReaderStep } from "@/lib/reader/steps";

/** Fraction de la hauteur d'écran à franchir pour changer d'étape. */
export const WHEEL_THRESHOLD_RATIO = 0.2;
/** Fenêtre d'inactivité après laquelle l'accumulateur de geste est remis à zéro. */
export const WHEEL_RESET_MS = 220;

export interface NavigationState {
  /** Index de l'étape courante ; `steps.length` représente l'écran de fin. */
  index: number;
  /** Progression interne d'une étape épinglée (pan-x, animation), 0→1. */
  inner: number;
}

export interface NavigationApi extends NavigationState {
  isEnd: boolean;
  goNext: () => void;
  goPrev: () => void;
  goTo: (index: number) => void;
  handleWheel: (deltaY: number) => void;
  handleTap: (clientX: number, viewportWidth: number) => void;
  handleKey: (key: string) => boolean;
}

function isPinned(step: ReaderStep | undefined): boolean {
  return step?.kind === "pan-x" || step?.kind === "animation";
}

/** Longueur en pixels d'une étape épinglée pour une hauteur d'écran donnée. */
export function stepLengthPx(step: ReaderStep, viewportHeight: number): number {
  if (step.kind === "pan-x" || step.kind === "animation") {
    return (step.lengthVh / 100) * viewportHeight;
  }
  return viewportHeight;
}

export function initialNavigationState(): NavigationState {
  return { index: 0, inner: 0 };
}

/**
 * Calcule le prochain état après un geste vertical.
 *
 * - image : accumulateur de geste, saut net au-delà du seuil ;
 * - pan-x / animation : le geste alimente la progression interne, puis passe
 *   à l'étape suivante en butée ;
 * - long-y : progression naturelle (gérée par le DOM), le geste ne fait rien
 *   ici tant que le contenu n'est pas en butée.
 */
export function reduceWheel(
  state: NavigationState,
  steps: ReaderStep[],
  deltaY: number,
  viewportHeight: number,
  accumulated: number,
): { state: NavigationState; accumulated: number; navigated: boolean } {
  if (steps.length === 0) return { state, accumulated: 0, navigated: false };

  // Écran de fin : on ne peut que revenir sur la dernière étape.
  if (state.index >= steps.length) {
    if (deltaY < 0) {
      const last = steps.length - 1;
      const lastStep = steps[last];
      return {
        state: {
          index: last,
          inner: lastStep.kind === "pan-x" || lastStep.kind === "animation" ? 1 : 0,
        },
        accumulated: 0,
        navigated: true,
      };
    }
    return { state, accumulated: 0, navigated: false };
  }

  const step = steps[state.index];
  const threshold = Math.max(24, viewportHeight * WHEEL_THRESHOLD_RATIO);

  if (step.kind === "long-y") {
    return { state, accumulated: 0, navigated: false };
  }

  if (isPinned(step)) {
    const length = Math.max(1, stepLengthPx(step, viewportHeight));
    const nextInner = state.inner + deltaY / length;
    if (nextInner >= 1) {
      const nextIndex = state.index + 1;
      return {
        state: { index: nextIndex, inner: 0 },
        accumulated: 0,
        navigated: true,
      };
    }
    if (nextInner <= 0 && deltaY < 0) {
      if (state.index === 0) {
        return { state: { index: 0, inner: 0 }, accumulated: 0, navigated: false };
      }
      return {
        state: { index: state.index - 1, inner: 1 },
        accumulated: 0,
        navigated: true,
      };
    }
    return {
      state: { index: state.index, inner: Math.min(1, Math.max(0, nextInner)) },
      accumulated: 0,
      navigated: false,
    };
  }

  const acc = accumulated + deltaY;
  if (acc >= threshold) {
    return {
      state: { index: Math.min(steps.length, state.index + 1), inner: 0 },
      accumulated: 0,
      navigated: true,
    };
  }
  if (acc <= -threshold) {
    return {
      state: { index: Math.max(0, state.index - 1), inner: 0 },
      accumulated: 0,
      navigated: true,
    };
  }
  return { state, accumulated: acc, navigated: false };
}

/**
 * État de navigation du lecteur discret.
 *
 * L'écran de fin est représenté par `index === steps.length`. Le hook ne
 * touche ni au DOM ni au scroll : il expose des handlers que la vue branche
 * sur les gestes.
 */
export function useReaderNavigation(steps: ReaderStep[]): NavigationApi {
  const [state, setState] = React.useState<NavigationState>(() =>
    initialNavigationState(),
  );
  const accumulator = React.useRef(0);
  const lastGestureAt = React.useRef(0);

  const viewportHeight = React.useCallback(() => {
    if (typeof window === "undefined") return 800;
    return window.innerHeight || 800;
  }, []);

  const goNext = React.useCallback(() => {
    accumulator.current = 0;
    setState((prev) => ({
      index: Math.min(steps.length, prev.index + 1),
      inner: 0,
    }));
  }, [steps.length]);

  const goPrev = React.useCallback(() => {
    accumulator.current = 0;
    setState((prev) => {
      if (prev.index === 0) return prev;
      const target = prev.index - 1;
      return {
        index: target,
        inner: steps[target]?.kind === "pan-x" || steps[target]?.kind === "animation" ? 1 : 0,
      };
    });
  }, [steps]);

  const goTo = React.useCallback(
    (index: number) => {
      accumulator.current = 0;
      setState({
        index: Math.min(steps.length, Math.max(0, Math.floor(index))),
        inner: 0,
      });
    },
    [steps.length],
  );

  const handleWheel = React.useCallback(
    (deltaY: number) => {
      const now = Date.now();
      if (now - lastGestureAt.current > WHEEL_RESET_MS) accumulator.current = 0;
      lastGestureAt.current = now;

      setState((prev) => {
        const result = reduceWheel(
          prev,
          steps,
          deltaY,
          viewportHeight(),
          accumulator.current,
        );
        accumulator.current = result.accumulated;
        return result.state;
      });
    },
    [steps, viewportHeight],
  );

  const handleTap = React.useCallback(
    (clientX: number, width: number) => {
      if (clientX < width / 3) goPrev();
      else goNext();
    },
    [goNext, goPrev],
  );

  const handleKey = React.useCallback(
    (key: string): boolean => {
      switch (key) {
        case "ArrowDown":
        case "ArrowRight":
        case "PageDown":
        case " ":
        case "Enter":
          goNext();
          return true;
        case "ArrowUp":
        case "ArrowLeft":
        case "PageUp":
          goPrev();
          return true;
        case "Home":
          goTo(0);
          return true;
        case "End":
          goTo(steps.length);
          return true;
        default:
          return false;
      }
    },
    [goNext, goPrev, goTo, steps.length],
  );

  return {
    ...state,
    isEnd: state.index >= steps.length,
    goNext,
    goPrev,
    goTo,
    handleWheel,
    handleTap,
    handleKey,
  };
}
