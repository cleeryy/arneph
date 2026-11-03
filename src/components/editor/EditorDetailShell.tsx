"use client";

import * as React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Save, Globe, Lock, AlertCircle } from "lucide-react";

import { useEditorState, remapSectionIds } from "@/components/editor/EditorStateContext";
import { WebtoonMetadataForm } from "@/components/editor/WebtoonMetadataForm";
import { saveWebtoon, publishWebtoon, unpublishWebtoon } from "@/app/editor/actions";
import { sectionConfigSchema } from "@/lib/schemas";

interface ActionResult {
  ok: boolean;
  error?: string;
}

/**
 * Client shell of the editor detail screen: header (title, badge, actions),
 * metadata form and the canvas slot. Metadata is seeded by the route layout
 * through the EditorStateProvider initial values.
 */
export function EditorDetailLayoutContent({
  children,
  webtoonId,
}: {
  children: React.ReactNode;
  webtoonId: string;
}) {
  const t = useTranslations("editor");
  const {
    sections,
    setSections,
    isDirty,
    setIsDirty,
    webtoonTitle,
    visibility,
    setVisibility,
  } = useEditorState();
  const [saving, setSaving] = React.useState(false);
  const [publishing, setPublishing] = React.useState(false);
  const [saveResult, setSaveResult] = React.useState<ActionResult | null>(null);

  async function performSave(): Promise<boolean> {
    setSaveResult(null);

    const invalidIndex = sections.findIndex(
      (s) => !sectionConfigSchema.safeParse(s.config).success,
    );
    if (invalidIndex !== -1) {
      const invalid = sections[invalidIndex];
      const configType =
        (invalid.config as { type?: string } | undefined)?.type ?? invalid.type;
      const isAnimation = configType === "animation";
      const typeLabel =
        configType === "image"
          ? t("sectionTypeImage")
          : configType === "long-y"
            ? t("sectionTypeLongY")
            : configType === "pan-x"
              ? t("sectionTypePanX")
              : t("sectionTypeAnimation");
      // Section positions are 1-based in the UI: never add an offset.
      const position =
        typeof invalid.position === "number"
          ? invalid.position
          : invalidIndex + 1;
      setSaveResult({
        ok: false,
        error: t("incompleteSection", {
          position,
          type: typeLabel,
          action: isAnimation ? t("animationUpload") : t("imageUpload"),
        }),
      });
      return false;
    }

    setSaving(true);
    try {
      const result = await saveWebtoon(webtoonId, sections);
      setSaveResult(result);
      if (result.ok) {
        if (result.sectionIds) {
          setSections(remapSectionIds(sections, result.sectionIds));
        }
        setIsDirty(false);
      }
      return result.ok;
    } catch (err) {
      setSaveResult({
        ok: false,
        error: err instanceof Error ? err.message : t("saveError"),
      });
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function handleSave() {
    await performSave();
  }

  async function handlePublish() {
    setSaveResult(null);

    if (sections.length === 0) {
      setSaveResult({ ok: false, error: t("publishNoSections") });
      return;
    }

    setPublishing(true);
    try {
      // Publishing a dirty editor must persist the pending edits first.
      if (isDirty) {
        const saved = await performSave();
        if (!saved) return;
      }

      const result = await publishWebtoon(webtoonId);
      if (result.ok) {
        setVisibility("published");
      } else {
        setSaveResult({ ok: false, error: result.error ?? t("publishError") });
      }
    } catch (err) {
      setSaveResult({
        ok: false,
        error: err instanceof Error ? err.message : t("publishError"),
      });
    } finally {
      setPublishing(false);
    }
  }

  async function handleUnpublish() {
    setSaveResult(null);
    setPublishing(true);
    try {
      const result = await unpublishWebtoon(webtoonId);
      if (result.ok) {
        setVisibility("draft");
      } else {
        setSaveResult({ ok: false, error: result.error ?? t("publishError") });
      }
    } catch (err) {
      setSaveResult({
        ok: false,
        error: err instanceof Error ? err.message : t("publishError"),
      });
    } finally {
      setPublishing(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="sticky top-0 z-10 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <Link
              href="/editor"
              className="text-sm font-medium text-muted-foreground underline-offset-4 hover:underline"
            >
              ← {t("backToEditor")}
            </Link>
          </div>
          <h1
            className="font-heading text-lg font-semibold tracking-tight text-foreground truncate max-w-[400px]"
            data-testid="editor-title"
            data-loaded={webtoonTitle !== null ? "true" : "false"}
          >
            {webtoonTitle ?? "…"}
          </h1>
          <div className="flex items-center gap-2">
            <Link
              href={`/read/${webtoonId}`}
              className="text-sm font-medium text-muted-foreground underline-offset-4 hover:underline"
            >
              {t("readerLink")}
            </Link>
            {isDirty && (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600" data-testid="dirty-indicator">
                <AlertCircle className="size-3.5" />
                {t("unsavedChanges")}
              </span>
            )}
            <span
              className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
                visibility === "published"
                  ? "bg-green-100 text-green-700"
                  : "bg-muted text-muted-foreground"
              }`}
              data-testid="visibility-badge"
              data-loaded={visibility !== null ? "true" : "false"}
            >
              {visibility === "published" ? (
                <>
                  <Globe className="size-3.5" />
                  {t("published")}
                </>
              ) : visibility === "draft" ? (
                <>
                  <Lock className="size-3.5" />
                  {t("draft")}
                </>
              ) : (
                <span aria-hidden="true">…</span>
              )}
            </span>
            <button
              type="button"
              onClick={handlePublish}
              disabled={visibility !== "draft" || publishing}
              className="inline-flex h-9 items-center justify-center rounded-md bg-green-600 px-3 py-2 text-sm font-medium text-white shadow transition-colors hover:bg-green-700 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label={t("publish")}
            >
              {t("publish")}
            </button>
            <button
              type="button"
              onClick={handleUnpublish}
              disabled={visibility !== "published" || publishing}
              className="inline-flex h-9 items-center justify-center rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground shadow transition-colors hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label={t("unpublish")}
            >
              {t("unpublish")}
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !isDirty}
              className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label={t("save")}
              data-testid="save-button"
            >
              <Save className="size-4 mr-1.5" />
              {t("save")}
            </button>
          </div>
        </div>
      </header>
      {saveResult && !saveResult.ok && (
        <div className="mx-auto mt-2 max-w-7xl px-4" data-testid="save-error">
          <div className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive flex items-center gap-2">
            <AlertCircle className="size-4 shrink-0" />
            {saveResult.error}
          </div>
        </div>
      )}
      <WebtoonMetadataForm webtoonId={webtoonId} />
      <main className="flex-1">{children}</main>
    </div>
  );
}
