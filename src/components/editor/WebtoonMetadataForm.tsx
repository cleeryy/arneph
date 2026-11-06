"use client";

import * as React from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { AlertCircle, BookOpen, Save, X } from "lucide-react";

import { updateWebtoonMetadataAction } from "@/app/editor/actions";
import { useEditorState } from "@/components/editor/EditorStateContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  ImageProcessingError,
  readImageDimensions,
  resizeImage,
} from "@/lib/image/process";
import { MAX_UPLOAD_BYTES } from "@/lib/image/limits";
import { getSupabaseRenderUrl } from "@/lib/supabase/public-url";
import { uploadSectionAsset } from "@/lib/supabase/upload";

interface WebtoonMetadataFormProps {
  webtoonId: string;
  /** Couverture déjà persistée, hydratée côté serveur. */
  initialCoverPath?: string | null;
}

/** Chemin Storage de la couverture : `webtoons/covers/<webtoonId>/<ts>-<name>`. */
function coverStoragePath(webtoonId: string, filename: string): string {
  const timestamp = Date.now();
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `webtoons/covers/${webtoonId}/${timestamp}-${safeName}`;
}

/** Une couverture est rendue en vignette : 800 px suffit largement. */
const COVER_IMAGE_MAX_DIMENSION = 800;

export function WebtoonMetadataForm({
  webtoonId,
  initialCoverPath = null,
}: WebtoonMetadataFormProps) {
  const t = useTranslations("editor");
  const tCommon = useTranslations("common");
  const {
    webtoonTitle,
    webtoonDescription,
    setWebtoonTitle,
    setWebtoonDescription,
    setMetadataDirty,
  } = useEditorState();

  const [title, setTitle] = React.useState(webtoonTitle ?? "");
  const [description, setDescription] = React.useState(
    webtoonDescription ?? "",
  );
  const [coverPath, setCoverPath] = React.useState<string | null>(
    initialCoverPath,
  );
  const [saving, setSaving] = React.useState(false);
  const [coverBusy, setCoverBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState(false);
  const coverInputRef = React.useRef<HTMLInputElement>(null);

  const busy = saving || coverBusy;
  const initial = Array.from(title.trim())[0]?.toUpperCase() ?? "";

  function commitContext(nextTitle: string, nextDescription: string) {
    setWebtoonTitle(nextTitle);
    setWebtoonDescription(nextDescription);
    setTitle(nextTitle);
    setDescription(nextDescription);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;

    const nextTitle = title.trim();
    if (nextTitle.length === 0) {
      setSaved(false);
      setError(t("metadataTitleRequired"));
      return;
    }
    const nextDescription = description.trim();

    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const result = await updateWebtoonMetadataAction(webtoonId, {
        title: nextTitle,
        description: nextDescription,
      });
      if (!result.ok) {
        setError(result.error ?? t("metadataError"));
        return;
      }
      commitContext(nextTitle, nextDescription);
      setMetadataDirty(false);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("metadataError"));
    } finally {
      setSaving(false);
    }
  }

  /**
   * La couverture est persistée immédiatement : l'upload Storage n'a de sens
   * que si le chemin est enregistré dans la même foulée.
   */
  async function handleCoverUpload(file: File) {
    if (busy) return;
    setError(null);
    setSaved(false);

    const nextTitle = title.trim();
    if (nextTitle.length === 0) {
      setError(t("metadataTitleRequired"));
      return;
    }
    if (!file.type.startsWith("image/")) {
      setError(t("uploadImageError"));
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setError(t("fileTooLarge"));
      return;
    }

    setCoverBusy(true);
    try {
      // `resizeImage()` encode déjà en WebP : pas de double encodage.
      const resized = await resizeImage(file, {
        maxDimension: COVER_IMAGE_MAX_DIMENSION,
      });
      const dimensions = await readImageDimensions(resized);
      if (!(dimensions.width > 0 && dimensions.height > 0)) {
        setError(t("uploadImageErrorGeneric"));
        return;
      }

      const storagePath = await uploadSectionAsset(
        coverStoragePath(webtoonId, file.name),
        resized,
        "image/webp",
      );

      const nextDescription = description.trim();
      const result = await updateWebtoonMetadataAction(webtoonId, {
        title: nextTitle,
        description: nextDescription,
        coverPath: storagePath,
      });
      if (!result.ok) {
        setError(result.error ?? t("metadataError"));
        return;
      }

      setCoverPath(storagePath);
      commitContext(nextTitle, nextDescription);
      setMetadataDirty(false);
      setSaved(true);
    } catch (err) {
      if (err instanceof ImageProcessingError) {
        setError(err.message);
      } else {
        setError(t("uploadImageErrorGeneric"));
      }
    } finally {
      setCoverBusy(false);
      if (coverInputRef.current) coverInputRef.current.value = "";
    }
  }

  function handleCoverChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setMetadataDirty(true);
    void handleCoverUpload(file);
  }

  async function handleCoverRemove() {
    if (busy || coverPath === null) return;
    setMetadataDirty(true);
    setError(null);
    setSaved(false);

    const nextTitle = title.trim();
    if (nextTitle.length === 0) {
      setError(t("metadataTitleRequired"));
      return;
    }
    const nextDescription = description.trim();

    setCoverBusy(true);
    try {
      const result = await updateWebtoonMetadataAction(webtoonId, {
        title: nextTitle,
        description: nextDescription,
        coverPath: "",
      });
      if (!result.ok) {
        setError(result.error ?? t("metadataError"));
        return;
      }

      setCoverPath(null);
      commitContext(nextTitle, nextDescription);
      setMetadataDirty(false);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("metadataError"));
    } finally {
      setCoverBusy(false);
    }
  }

  return (
    <section
      aria-labelledby="webtoon-metadata-heading"
      className="border-b border-border bg-muted/20 px-6 py-4"
    >
      <h2
        id="webtoon-metadata-heading"
        className="font-heading text-sm font-semibold tracking-tight text-foreground"
      >
        {t("metadata")}
      </h2>
      <form
        data-testid="metadata-form"
        onSubmit={handleSubmit}
        className="mt-3 grid gap-3 sm:grid-cols-2"
      >
        <div className="grid gap-1.5 sm:col-span-2">
          <span className="text-sm font-medium text-foreground">
            {t("preview")}
          </span>
          <div className="flex items-center gap-3">
            <div className="relative aspect-[4/5] w-20 shrink-0 overflow-hidden rounded-md border border-border bg-muted">
              {coverPath ? (
                <Image
                  src={coverPath}
                  loader={({ src, width }) =>
                    getSupabaseRenderUrl(src, { width })
                  }
                  alt={title.trim() || t("previewAlt")}
                  width={320}
                  height={400}
                  sizes="80px"
                  data-testid="metadata-cover-preview"
                  className="h-full w-full object-cover"
                />
              ) : (
                // Même placeholder que la bibliothèque : initiale du titre.
                <div
                  aria-hidden="true"
                  data-testid="metadata-cover-placeholder"
                  className="flex h-full w-full items-center justify-center overflow-hidden bg-[linear-gradient(140deg,var(--muted),var(--background))]"
                >
                  {initial ? (
                    <span className="font-heading text-2xl font-semibold tracking-tight text-muted-foreground/60 select-none">
                      {initial}
                    </span>
                  ) : (
                    <BookOpen className="size-5 text-muted-foreground" />
                  )}
                </div>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={coverInputRef}
                id="webtoon-metadata-cover"
                type="file"
                accept="image/*"
                className="sr-only"
                data-testid="metadata-cover-input"
                onChange={handleCoverChange}
                disabled={busy}
              />
              <Button
                type="button"
                variant="outline"
                size="lg"
                data-testid="metadata-cover-upload"
                disabled={busy}
                onClick={() => coverInputRef.current?.click()}
              >
                {coverBusy ? t("uploading") : t("imageUpload")}
              </Button>
              {coverPath && (
                <Button
                  type="button"
                  variant="ghost"
                  size="lg"
                  data-testid="metadata-cover-remove"
                  aria-label={tCommon("delete")}
                  title={tCommon("delete")}
                  disabled={busy}
                  onClick={handleCoverRemove}
                >
                  <X aria-hidden="true" className="size-4" />
                  {tCommon("delete")}
                </Button>
              )}
            </div>
          </div>
        </div>
        <div className="grid gap-1.5">
          <div className="flex items-baseline justify-between gap-2">
            <Label htmlFor="webtoon-metadata-title">{t("metadataTitle")}</Label>
            <span
              data-testid="metadata-title-counter"
              className="text-xs tabular-nums text-muted-foreground"
            >
              {title.length}/120
            </span>
          </div>
          <Input
            id="webtoon-metadata-title"
            data-testid="metadata-title"
            value={title}
            onChange={(event) => {
              setTitle(event.target.value);
              setMetadataDirty(true);
            }}
            disabled={busy}
            maxLength={120}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="webtoon-metadata-description">
            {t("metadataDescription")}
          </Label>
          <Textarea
            id="webtoon-metadata-description"
            data-testid="metadata-description"
            value={description}
            onChange={(event) => {
              setDescription(event.target.value);
              setMetadataDirty(true);
            }}
            disabled={busy}
            rows={2}
            maxLength={2000}
          />
        </div>
        <div className="flex items-center gap-3 sm:col-span-2">
          <Button
            type="submit"
            data-testid="metadata-save"
            disabled={busy}
            className="h-9"
          >
            <Save aria-hidden="true" className="size-4" />
            {t("metadataSave")}
          </Button>
          {error && (
            <span
              data-testid="metadata-error"
              role="alert"
              className="flex items-center gap-1.5 text-sm text-destructive"
            >
              <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
              {error}
            </span>
          )}
          {!error && saved && (
            <span className="text-sm text-muted-foreground">
              {t("metadataSaved")}
            </span>
          )}
        </div>
      </form>
    </section>
  );
}
