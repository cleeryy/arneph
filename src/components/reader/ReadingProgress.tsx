"use client";

import { useTranslations } from "next-intl";

export interface ReadingProgressProps {
  /** Ratio de lecture courant, 0 → 1 (borné dans le composant). */
  progress: number;
  /** Ratio sauvegardé à proposer en reprise, `null` = bouton masqué. */
  savedProgress: number | null;
  /** Scrolle à la position sauvegardée. */
  onResume: () => void;
}

function clampRatio(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/**
 * Indicateur de progression de lecture + reprise.
 *
 * Présentationnel : l'état (scroll, localStorage, clavier) vit dans
 * `useReadingProgress`. La barre est fine et fixée en haut pour rester visible
 * au-dessus de l'en-tête sticky du lecteur.
 */
export default function ReadingProgress({
  progress,
  savedProgress,
  onResume,
}: ReadingProgressProps) {
  const t = useTranslations("reader");
  const percent = Math.round(clampRatio(progress) * 100);

  return (
    <>
      <div
        role="progressbar"
        aria-label={t("readingProgress")}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        data-testid="reading-progressbar"
        className="fixed inset-x-0 top-0 z-30 h-0.5 bg-muted"
      >
        <div
          className="h-full bg-primary transition-[width] duration-150 ease-out motion-reduce:transition-none"
          style={{ width: `${percent}%` }}
        />
      </div>

      {savedProgress !== null ? (
        <button
          type="button"
          onClick={onResume}
          data-testid="resume-reading"
          className="fixed bottom-6 left-6 z-20 inline-flex items-center rounded-full border border-border bg-background/95 px-3 py-1.5 text-xs font-medium text-foreground shadow-lg backdrop-blur transition-colors hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          {t("resumeAt", { percent: Math.round(clampRatio(savedProgress) * 100) })}
        </button>
      ) : null}
    </>
  );
}
