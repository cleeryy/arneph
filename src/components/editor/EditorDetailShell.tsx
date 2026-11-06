"use client";

import * as React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Save, Globe, Lock, AlertCircle, Undo2, Redo2 } from "lucide-react";

import { useEditorState, remapSectionIds } from "@/components/editor/EditorStateContext";
import { WebtoonMetadataForm } from "@/components/editor/WebtoonMetadataForm";
import { saveWebtoon, publishWebtoon, unpublishWebtoon } from "@/app/editor/actions";
import { sectionConfigSchema } from "@/lib/schemas";
import { isSectionType } from "@/lib/editor/sections";
import { sectionTypeLabel } from "@/lib/editor/section-labels";

interface ActionResult {
  ok: boolean;
  error?: string;
  /** Le serveur a refusé la sauvegarde à cause du verrou optimiste. */
  conflict?: boolean;
}

/**
 * Client shell of the editor detail screen: header (title, badge, actions),
 * metadata form and the canvas slot. Metadata is seeded by the route layout
 * through the EditorStateProvider initial values.
 */
export function EditorDetailLayoutContent({
  children,
  webtoonId,
  initialCoverPath = null,
  initialRevision = 0,
}: {
  children: React.ReactNode;
  webtoonId: string;
  /** Couverture persistée, hydratée par la route serveur. */
  initialCoverPath?: string | null;
  /** Révision lue au chargement, utilisée comme verrou optimiste. */
  initialRevision?: number;
}) {
  const t = useTranslations("editor");
  const {
    sections,
    setSections,
    isDirty,
    setIsDirty,
    metadataDirty,
    canUndo,
    canRedo,
    undo,
    redo,
    webtoonTitle,
    visibility,
    setVisibility,
    setSelectedSectionId,
  } = useEditorState();
  const [saving, setSaving] = React.useState(false);
  const [publishing, setPublishing] = React.useState(false);
  const [saveResult, setSaveResult] = React.useState<ActionResult | null>(null);
  // Le garde-fou de sortie couvre tout ce qui n'est pas persisté : sections
  // éditées et formulaire metadata. Le bouton Enregistrer du header reste
  // dédié aux sections.
  const hasUnsaved = isDirty || metadataDirty;
  // Verrou optimiste : dernière révision confirmée par le serveur. La ref
  // évite qu'un second save lancé avant le re-render reparte de l'ancienne
  // valeur et se fasse refuser pour un conflit fantôme.
  const [revision, setRevision] = React.useState(initialRevision);
  const revisionRef = React.useRef(initialRevision);

  // Latest-value refs are required here: a save resolves after the await and
  // must apply its id map to the sections edited meanwhile, never to the
  // snapshot captured at click time. The React Compiler lint rule cannot see
  // that the write is only read from an async event handler.
  const sectionsRef = React.useRef(sections);
  // eslint-disable-next-line react-hooks/refs
  sectionsRef.current = sections;
  // Synchronous re-entrance locks: the disabled button only exists after the
  // next render, so a double click could otherwise start two saves/publishes.
  const saveInFlightRef = React.useRef(false);
  const publishInFlightRef = React.useRef(false);

  // Garde-fou fermeture d'onglet / rechargement : uniquement tant que des
  // modifications ne sont pas enregistrées.
  React.useEffect(() => {
    if (!hasUnsaved) return;

    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      // Requis par les navigateurs historiques pour afficher la confirmation.
      event.returnValue = "";
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [hasUnsaved]);

  // Best-effort back/forward guard: re-push the current entry when the user
  // declines to leave, so the editor is not unmounted by a cancelled popstate.
  React.useEffect(() => {
    if (!hasUnsaved) return;

    function handlePopState() {
      if (window.confirm(t("unsavedConfirm"))) return;
      window.history.pushState(null, "", window.location.href);
    }

    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, [hasUnsaved, t]);

  // Client-side <Link> navigation does not fire beforeunload: confirm here.
  const guardLink = React.useCallback(
    (event: React.MouseEvent<HTMLAnchorElement>) => {
      if (!hasUnsaved) return;
      if (!window.confirm(t("unsavedConfirm"))) {
        event.preventDefault();
      }
    },
    [hasUnsaved, t],
  );

  async function performSave(): Promise<boolean> {
    if (saveInFlightRef.current) return false;
    saveInFlightRef.current = true;

    setSaveResult(null);

    const sectionsAtSave = sections;
    const invalidIndex = sectionsAtSave.findIndex(
      (s) => !sectionConfigSchema.safeParse(s.config).success,
    );
    if (invalidIndex !== -1) {
      const invalid = sectionsAtSave[invalidIndex];
      const configType =
        (invalid.config as { type?: string } | undefined)?.type ?? invalid.type;
      const isAnimation = configType === "animation";
      // Type inconnu (config corrompue) → libellé animation, comme avant.
      const typeLabel = sectionTypeLabel(
        t,
        isSectionType(configType) ? configType : "animation",
      );
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
      saveInFlightRef.current = false;
      return false;
    }

    setSaving(true);
    try {
      const result = await saveWebtoon(
        webtoonId,
        sectionsAtSave,
        revisionRef.current,
      );
      setSaveResult({
        ok: result.ok,
        error: result.error,
        conflict: result.conflict,
      });
      if (result.ok) {
        // La révision avance à chaque sauvegarde réussie : les sauvegardes
        // suivantes doivent partir de cette valeur sous peine de conflit.
        const nextRevision = result.revision ?? revisionRef.current;
        revisionRef.current = nextRevision;
        setRevision(nextRevision);
        // Edits made while the request was in flight must survive the
        // response: remap the latest sections, never the save snapshot.
        // Le RPC conserve désormais les UUID client : ce remap ne sert plus
        // qu'aux réponses d'anciennes versions (compatibilité).
        const currentSections = sectionsRef.current;
        const changedDuringSave = currentSections !== sectionsAtSave;
        if (result.sectionIds) {
          setSections(remapSectionIds(currentSections, result.sectionIds));
          // Functional update: remap whichever section is selected now, even
          // if the selection changed while the save was in flight.
          const sectionIds = result.sectionIds;
          setSelectedSectionId((current) =>
            current && sectionIds[current] ? sectionIds[current] : current,
          );
        }
        // Only disarm the unsaved-changes guard when nothing changed meanwhile.
        if (!changedDuringSave) setIsDirty(false);
      }
      return result.ok;
    } catch (err) {
      setSaveResult({
        ok: false,
        error: err instanceof Error ? err.message : t("saveError"),
      });
      return false;
    } finally {
      saveInFlightRef.current = false;
      setSaving(false);
    }
  }

  async function handleSave() {
    await performSave();
  }

  async function handlePublish() {
    if (publishInFlightRef.current) return;
    publishInFlightRef.current = true;

    try {
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
    } finally {
      publishInFlightRef.current = false;
    }
  }

  async function handleUnpublish() {
    if (publishInFlightRef.current) return;
    publishInFlightRef.current = true;

    try {
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
    } finally {
      publishInFlightRef.current = false;
    }
  }

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="sticky top-0 z-10 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <Link
              href="/editor"
              onClick={guardLink}
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
              onClick={guardLink}
              className="text-sm font-medium text-muted-foreground underline-offset-4 hover:underline"
            >
              {t("readerLink")}
            </Link>
            {hasUnsaved && (
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
              onClick={undo}
              disabled={!canUndo}
              className="inline-flex size-9 items-center justify-center rounded-md border border-border bg-background text-foreground shadow transition-colors hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label={t("undo")}
              title={t("undo")}
              data-testid="undo-button"
            >
              <Undo2 className="size-4" />
            </button>
            <button
              type="button"
              onClick={redo}
              disabled={!canRedo}
              className="inline-flex size-9 items-center justify-center rounded-md border border-border bg-background text-foreground shadow transition-colors hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label={t("redo")}
              title={t("redo")}
              data-testid="redo-button"
            >
              <Redo2 className="size-4" />
            </button>
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
            <span className="flex-1">{saveResult.error}</span>
            {saveResult.conflict && (
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="shrink-0 rounded-md border border-destructive/40 px-2.5 py-1 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                data-testid="save-reload"
              >
                {t("reload")}
              </button>
            )}
          </div>
        </div>
      )}
      <WebtoonMetadataForm
        webtoonId={webtoonId}
        initialCoverPath={initialCoverPath}
      />
      <main className="flex-1">{children}</main>
    </div>
  );
}
