import * as React from "react";

/**
 * Progression de lecture persistée par webtoon.
 *
 * Clé namespacée + versionnée : changer le format de stockage (ratio → objet,
 * etc.) se fait en incrémentant `v1` sans relire d'anciennes valeurs.
 */
export const READING_PROGRESS_STORAGE_PREFIX = "arneph:reading-progress:v1";

const DEFAULT_MIN_RESUME_RATIO = 0.05;
const DEFAULT_MAX_RESUME_RATIO = 0.95;
const DEFAULT_PERSIST_DELAY_MS = 200;

export interface UseReadingProgressOptions {
  webtoonId: string;
  /** Ratio minimal (inclus) pour proposer la reprise. */
  minResumeRatio?: number;
  /** Ratio maximal (inclus) pour proposer la reprise. */
  maxResumeRatio?: number;
  /** Délai de débounce avant écriture localStorage. */
  persistDelayMs?: number;
}

export interface UseReadingProgressResult {
  /** Ratio de lecture courant, 0 → 1, borné. */
  progress: number;
  /** Ratio restauré au montage, uniquement s'il est dans la fenêtre de reprise. */
  savedProgress: number | null;
  /** Scrolle à la position sauvegardée puis masque le bouton de reprise. */
  resume(): void;
  /** Masque le bouton de reprise sans scroller. */
  dismissResume(): void;
}

export function readingProgressStorageKey(webtoonId: string): string {
  return `${READING_PROGRESS_STORAGE_PREFIX}:${webtoonId}`;
}

function clampRatio(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/** localStorage peut throw dès l'accès (Safari navigation privée, iframe). */
function getStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

function readStoredRatio(key: string): number | null {
  const storage = getStorage();
  if (storage === null) return null;
  try {
    const raw = storage.getItem(key);
    if (raw === null) return null;
    const parsed = Number.parseFloat(raw);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) return null;
    return parsed;
  } catch {
    return null;
  }
}

function persistRatio(key: string, ratio: number): void {
  const storage = getStorage();
  if (storage === null) return;
  try {
    storage.setItem(key, clampRatio(ratio).toFixed(4));
  } catch {
    // Quota dépassé ou stockage indisponible : la reprise est un bonus.
  }
}

function getDocumentHeight(): number {
  if (typeof window === "undefined") return 0;
  const doc = window.document?.documentElement;
  return doc ? doc.scrollHeight : 0;
}

/** Ratio visible : scrollY / hauteur réellement scrollable. */
function getScrollRatio(): number {
  if (typeof window === "undefined") return 0;
  const scrollable = getDocumentHeight() - window.innerHeight;
  if (!Number.isFinite(scrollable) || scrollable <= 0) return 0;
  return clampRatio(window.scrollY / scrollable);
}

function getResumeScrollTop(ratio: number): number {
  if (typeof window === "undefined") return 0;
  const scrollable = getDocumentHeight() - window.innerHeight;
  const reference = Number.isFinite(scrollable) && scrollable > 0 ? scrollable : getDocumentHeight();
  return Math.max(0, clampRatio(ratio) * reference);
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (target === null || typeof target !== "object") return false;
  const element = target as HTMLElement;
  const tagName = typeof element.tagName === "string" ? element.tagName.toUpperCase() : "";
  if (tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT" || tagName === "OPTION") {
    return true;
  }
  return element.isContentEditable === true;
}

/** `useSyncExternalStore` exige une souscription stable ; localStorage n'émet pas. */
function subscribeToNothing(): () => void {
  return () => {};
}

/**
 * Progression de lecture : ratio scrollé (throttlé via requestAnimationFrame),
 * persistance localStorage débouncée, reprise et raccourcis clavier.
 *
 * SSR-safe : le rendu serveur et l'hydration utilisent le snapshot `null`
 * (`getServerSnapshot`), `localStorage` n'est lu qu'après hydration ; toute
 * erreur d'accès au stockage est avalée.
 */
export function useReadingProgress({
  webtoonId,
  minResumeRatio = DEFAULT_MIN_RESUME_RATIO,
  maxResumeRatio = DEFAULT_MAX_RESUME_RATIO,
  persistDelayMs = DEFAULT_PERSIST_DELAY_MS,
}: UseReadingProgressOptions): UseReadingProgressResult {
  const [progress, setProgress] = React.useState(0);
  // Mémorise pour quel webtoon la reprise a été écartée : changer de webtoon
  // dans la même instance réaffiche le bouton sans effect de synchronisation.
  const [dismissedForWebtoonId, setDismissedForWebtoonId] = React.useState<string | null>(null);
  const storageKey = readingProgressStorageKey(webtoonId);
  // Restauration SSR-safe : le serveur (et la passe d'hydration) voient `null`,
  // puis le client lit le ratio stocké sans setState dans un effect.
  const storedProgress = React.useSyncExternalStore(
    subscribeToNothing,
    () => readStoredRatio(storageKey),
    () => null,
  );
  const resumeCandidate =
    storedProgress !== null &&
    storedProgress >= minResumeRatio &&
    storedProgress <= maxResumeRatio
      ? storedProgress
      : null;
  const savedProgress = dismissedForWebtoonId === webtoonId ? null : resumeCandidate;
  // Tant que l'utilisateur n'a pas scrollé, on n'écrit rien : un montage en
  // haut de page écraserait la progression sauvegardée (et le bouton Reprendre).
  const persistEnabledRef = React.useRef(false);

  // Suivi du scroll, throttlé sur une frame pour éviter un re-rendu par pixel.
  React.useEffect(() => {
    if (typeof window === "undefined") return;

    let frame: number | null = null;
    let persistTimer: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;

    const compute = (persist: boolean) => {
      frame = null;
      if (disposed) return;
      const ratio = getScrollRatio();
      setProgress(ratio);
      if (!persist || !persistEnabledRef.current) return;
      if (persistTimer !== null) clearTimeout(persistTimer);
      persistTimer = setTimeout(() => {
        persistTimer = null;
        persistRatio(storageKey, getScrollRatio());
      }, persistDelayMs);
    };

    const onScroll = () => {
      persistEnabledRef.current = true;
      if (frame !== null) return;
      frame = requestAnimationFrame(() => compute(true));
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    // Synchronisation initiale (après restauration d'un éventuel bfcache).
    compute(false);

    return () => {
      disposed = true;
      if (frame !== null) cancelAnimationFrame(frame);
      if (persistTimer !== null) {
        clearTimeout(persistTimer);
        // Flush de la dernière position au démontage (navigation interne).
        persistRatio(storageKey, getScrollRatio());
      }
      window.removeEventListener("scroll", onScroll);
    };
  }, [storageKey, persistDelayMs]);

  // Raccourcis clavier : une page par flèche/PageUp/PageDown, Home en haut.
  React.useEffect(() => {
    if (typeof window === "undefined") return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
      if (isEditableTarget(event.target)) return;

      const viewport = window.innerHeight;
      switch (event.key) {
        case "ArrowDown":
        case "PageDown":
          event.preventDefault();
          window.scrollBy({ top: viewport, behavior: "smooth" });
          break;
        case "ArrowUp":
        case "PageUp":
          event.preventDefault();
          window.scrollBy({ top: -viewport, behavior: "smooth" });
          break;
        case "Home":
          event.preventDefault();
          window.scrollTo({ top: 0, behavior: "smooth" });
          break;
        default:
          return;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const resume = React.useCallback(() => {
    if (savedProgress === null) return;
    if (typeof window !== "undefined") {
      window.scrollTo({ top: getResumeScrollTop(savedProgress), behavior: "smooth" });
    }
    setDismissedForWebtoonId(webtoonId);
  }, [savedProgress, webtoonId]);

  const dismissResume = React.useCallback(() => {
    setDismissedForWebtoonId(webtoonId);
  }, [webtoonId]);

  return { progress, savedProgress, resume, dismissResume };
}
