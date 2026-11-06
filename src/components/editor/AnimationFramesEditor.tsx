"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight, Copy, Pause, Play, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ImageProcessingError } from "@/lib/image/process";
import { getSupabasePublicObjectUrl } from "@/lib/supabase/public-url";

/** Vitesse de lecture de l'aperçu : ~12 images par seconde. */
export const ANIMATION_PREVIEW_FPS = 12;
export const ANIMATION_PREVIEW_INTERVAL_MS = Math.round(1000 / ANIMATION_PREVIEW_FPS);

/** Résultat d'un lot de frames uploadées par le parent. */
export interface AnimationFrameUploadResult {
  /** Chemins Storage des seules frames ajoutées, dans l'ordre de lecture. */
  frames: string[];
  frameWidth: number;
  frameHeight: number;
}

export interface AnimationFramesValue {
  frames: string[];
  frameWidth: number;
  frameHeight: number;
}

interface AnimationFramesEditorProps {
  /** Chemins Storage relatifs (jamais des URLs complètes). */
  frames: string[];
  frameWidth: number;
  frameHeight: number;
  onChange: (next: AnimationFramesValue) => void;
  /**
   * Upload d'un lot d'images, implémenté par le parent (`uploadSectionAsset`).
   * Le composant reste présentational : il ne connaît ni Storage ni Supabase.
   */
  onUploadFiles: (files: File[]) => Promise<AnimationFrameUploadResult>;
  /**
   * Désactive toutes les actions d'édition pendant qu'un upload parent
   * (sprite sheet, image, audio) est en cours : évite de réinjecter une liste
   * de frames périmée par-dessus les changements en vol.
   */
  disabled?: boolean;
}

function isImageFile(file: File): boolean {
  return file.type.startsWith("image/");
}

/**
 * Éditeur compact des frames individuelles d'une section animation :
 * vignettes réordonnables, duplication/suppression, ajout par fichiers et
 * aperçu en boucle. Les URLs publiques passent toujours par
 * `getSupabasePublicObjectUrl()`.
 */
export function AnimationFramesEditor({
  frames,
  frameWidth,
  frameHeight,
  onChange,
  onUploadFiles,
  disabled = false,
}: AnimationFramesEditorProps) {
  const t = useTranslations("editor");
  const inputId = React.useId();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [previewIndex, setPreviewIndex] = React.useState(0);
  const [playing, setPlaying] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const controlsDisabled = disabled || uploading;

  // La liste peut rétrécir pendant l'aperçu : l'index affiché est borné au
  // rendu (jamais de setState synchrone dans un effet), et la lecture exige
  // au moins deux frames.
  const isPlaying = playing && frames.length > 1;
  const safePreviewIndex =
    frames.length === 0 ? 0 : Math.min(previewIndex, frames.length - 1);

  React.useEffect(() => {
    if (!isPlaying) return;
    const timer = window.setInterval(() => {
      setPreviewIndex((index) => (index + 1) % frames.length);
    }, ANIMATION_PREVIEW_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [isPlaying, frames.length]);

  const frameUrls = React.useMemo(
    () => frames.map((frame) => getSupabasePublicObjectUrl(frame)),
    [frames],
  );

  const commitFrames = (nextFrames: string[]) => {
    onChange({ frames: nextFrames, frameWidth, frameHeight });
  };

  const moveFrame = (from: number, to: number) => {
    if (to < 0 || to >= frames.length || from === to) return;
    const next = [...frames];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    commitFrames(next);
  };

  const duplicateFrame = (index: number) => {
    const next = [...frames];
    next.splice(index + 1, 0, frames[index]);
    commitFrames(next);
  };

  const deleteFrame = (index: number) => {
    const next = frames.filter((_, current) => current !== index);
    setPreviewIndex((current) =>
      next.length === 0 ? 0 : Math.min(current, next.length - 1),
    );
    commitFrames(next);
  };

  const handleFilesChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) return;
    setError(null);

    if (!files.every(isImageFile)) {
      setError(t("uploadAnimationError"));
      event.target.value = "";
      return;
    }

    setUploading(true);
    try {
      const uploaded = await onUploadFiles(files);
      if (uploaded.frames.length === 0) return;
      onChange({
        frames: [...frames, ...uploaded.frames],
        // Le parent normalise sur la géométrie existante ; elle n'est adoptée
        // que si la section n'en avait pas encore.
        frameWidth: uploaded.frameWidth > 0 ? uploaded.frameWidth : frameWidth,
        frameHeight: uploaded.frameHeight > 0 ? uploaded.frameHeight : frameHeight,
      });
    } catch (err) {
      // Les erreurs de validation image portent un message localisé ; les
      // échecs Storage restent génériques (pas de fuite technique à l'écran).
      setError(
        err instanceof ImageProcessingError
          ? err.message
          : t("uploadAnimationErrorGeneric"),
      );
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const currentUrl = frameUrls[safePreviewIndex] ?? frameUrls[0] ?? null;

  return (
    <div className="min-w-0 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-foreground">{t("animationFrames")}</span>
        {frames.length > 0 && (
          <span className="text-xs tabular-nums text-muted-foreground">
            {t("frameIndex", { index: safePreviewIndex + 1, total: frames.length })}
          </span>
        )}
      </div>

      {currentUrl && (
        <div className="space-y-2">
          <div className="flex items-center justify-center overflow-hidden rounded-md border bg-muted/30">
            {/* `<img>` natif : les frames Storage ne passent pas par l'optimiseur. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              data-testid="animation-frame-preview"
              src={currentUrl}
              alt={t("framePreview")}
              loading="lazy"
              className="max-h-48 w-auto max-w-full object-contain"
            />
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setPlaying((value) => !value)}
            disabled={frames.length < 2 || controlsDisabled}
            aria-label={isPlaying ? t("framePause") : t("framePlay")}
          >
            {isPlaying ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
            {isPlaying ? t("framePause") : t("framePlay")}
          </Button>
        </div>
      )}

      {frames.length > 0 && (
        <ul className="grid grid-cols-3 gap-2 min-[360px]:grid-cols-4" role="list">
          {frames.map((frame, index) => (
            <li
              key={`${frame}-${index}`}
              className="relative overflow-hidden rounded-md border bg-muted/30"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                data-testid="animation-frame"
                src={frameUrls[index]}
                alt={t("frameIndex", { index: index + 1, total: frames.length })}
                loading="lazy"
                className="aspect-square w-full object-cover"
              />
              <span className="absolute left-1 top-1 rounded bg-background/85 px-1 text-[10px] font-medium tabular-nums text-foreground">
                {index + 1}
              </span>
              <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-0.5 bg-background/85 p-0.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className="size-5"
                  onClick={() => moveFrame(index, index - 1)}
                  disabled={index === 0 || controlsDisabled}
                  aria-label={`${t("frameMoveLeft")} ${index + 1}`}
                  title={t("frameMoveLeft")}
                >
                  <ChevronLeft className="size-3" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className="size-5"
                  onClick={() => moveFrame(index, index + 1)}
                  disabled={index === frames.length - 1 || controlsDisabled}
                  aria-label={`${t("frameMoveRight")} ${index + 1}`}
                  title={t("frameMoveRight")}
                >
                  <ChevronRight className="size-3" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className="size-5"
                  onClick={() => duplicateFrame(index)}
                  disabled={controlsDisabled}
                  aria-label={`${t("frameDuplicate")} ${index + 1}`}
                  title={t("frameDuplicate")}
                >
                  <Copy className="size-3" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className="size-5 text-destructive hover:text-destructive"
                  onClick={() => deleteFrame(index)}
                  disabled={controlsDisabled}
                  aria-label={`${t("frameDelete")} ${index + 1}`}
                  title={t("frameDelete")}
                >
                  <Trash2 className="size-3" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="space-y-1">
        <label htmlFor={inputId} className="text-xs text-muted-foreground">
          {t("frameAdd")}
        </label>
        <Input
          id={inputId}
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handleFilesChange}
          disabled={controlsDisabled}
          className="cursor-pointer"
        />
      </div>

      {uploading && (
        <p role="status" aria-live="polite" className="text-xs text-muted-foreground">
          {t("uploading")}
        </p>
      )}
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
