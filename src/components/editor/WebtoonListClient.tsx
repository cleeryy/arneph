"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  AlertCircle,
  BookOpen,
  Globe,
  Layers,
  Lock,
  PenLine,
  Plus,
  Trash2,
} from "lucide-react";

import { createWebtoonAction, deleteWebtoonAction } from "@/app/editor/actions";
import {
  Card,
  CardAction,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export interface WebtoonListItem {
  id: string;
  title: string;
  visibility: "draft" | "published";
}

interface WebtoonListClientProps {
  title: string;
  webtoons: WebtoonListItem[];
}

export function WebtoonListClient({ webtoons }: WebtoonListClientProps) {
  // `title` reste dans le contrat : le layout éditeur affiche déjà ce titre
  // dans sa barre supérieure, on évite donc un doublon visible ici.
  const t = useTranslations("editor");
  const tc = useTranslations("common");
  const router = useRouter();

  const [creating, setCreating] = React.useState(false);
  const [createError, setCreateError] = React.useState<string | null>(null);
  const [pendingDelete, setPendingDelete] =
    React.useState<WebtoonListItem | null>(null);
  const [deleting, setDeleting] = React.useState(false);
  const [deleteError, setDeleteError] = React.useState<string | null>(null);

  async function handleCreate() {
    if (creating) return;
    setCreating(true);
    setCreateError(null);
    try {
      const result = await createWebtoonAction();
      if (!result.ok || !result.webtoonId) {
        setCreateError(result.error ?? t("createError"));
        return;
      }
      router.push(`/editor/${result.webtoonId}`);
      router.refresh();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : t("createError"));
    } finally {
      setCreating(false);
    }
  }

  function requestDelete(webtoon: WebtoonListItem) {
    setDeleteError(null);
    setPendingDelete(webtoon);
  }

  function closeDeleteDialog() {
    if (deleting) return;
    setPendingDelete(null);
    setDeleteError(null);
  }

  async function handleConfirmDelete() {
    if (!pendingDelete || deleting) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const result = await deleteWebtoonAction(pendingDelete.id);
      if (!result.ok) {
        setDeleteError(result.error ?? t("deleteError"));
        return;
      }
      setPendingDelete(null);
      router.refresh();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : t("deleteError"));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <header className="flex items-center justify-between gap-4 border-b border-border pb-5">
        <p className="font-mono text-[11px] font-medium tracking-[0.28em] text-muted-foreground uppercase">
          Arneph
        </p>
        <Button
          type="button"
          size="lg"
          className="h-10 shrink-0 gap-2 text-sm"
          onClick={handleCreate}
          disabled={creating}
        >
          <Plus aria-hidden="true" />
          {t("newWebtoon")}
        </Button>
      </header>

      {createError && (
        <div
          role="alert"
          data-testid="create-error"
          className="mt-4 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {createError}
        </div>
      )}

      {webtoons.length === 0 ? (
        <div
          data-testid="editor-empty"
          className="mt-8 flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-muted/20 px-6 py-16 text-center"
        >
          <span className="flex size-11 items-center justify-center rounded-full border border-border bg-background text-muted-foreground">
            <Layers aria-hidden="true" className="size-5" />
          </span>
          <p className="max-w-xs text-sm text-muted-foreground">
            {t("empty")}
          </p>
        </div>
      ) : (
        <ul className="mt-8 grid w-full grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {webtoons.map((webtoon) => {
            const isPublished = webtoon.visibility === "published";

            return (
              <li key={webtoon.id} className="min-w-0">
                <Card className="h-full gap-0 py-0 transition-colors duration-200 hover:ring-foreground/25">
                  <CardHeader className="relative gap-3 px-4 pt-4 pb-4">
                    <CardTitle className="pr-10 text-[15px] leading-snug">
                      {webtoon.title}
                    </CardTitle>

                    <CardAction>
                      <button
                        type="button"
                        data-testid={`delete-${webtoon.id}`}
                        aria-label={t("delete")}
                        title={t("delete")}
                        onClick={() => requestDelete(webtoon)}
                        className="-mt-1 -mr-1 inline-flex size-9 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:ring-2 focus-visible:ring-foreground/60"
                      >
                        <Trash2 aria-hidden="true" className="size-4" />
                      </button>
                    </CardAction>

                    <span
                      className={cn(
                        "inline-flex w-fit items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium",
                        isPublished
                          ? "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      {isPublished ? (
                        <Globe aria-hidden="true" className="size-3" />
                      ) : (
                        <Lock aria-hidden="true" className="size-3" />
                      )}
                      {isPublished ? t("published") : t("draft")}
                    </span>
                  </CardHeader>

                  <div className="mt-auto flex items-center gap-2 border-t border-border/70 px-4 py-3">
                    <Link
                      href={`/editor/${webtoon.id}`}
                      className={cn(
                        buttonVariants({ variant: "outline", size: "sm" }),
                        "h-8 flex-1 gap-1.5 focus-visible:ring-2 focus-visible:ring-foreground/60",
                      )}
                    >
                      <PenLine aria-hidden="true" className="size-3.5" />
                      {t("edit")}
                    </Link>
                    {isPublished && (
                      <Link
                        href={`/read/${webtoon.id}`}
                        className={cn(
                          buttonVariants({ variant: "outline", size: "sm" }),
                          "h-8 flex-1 gap-1.5 focus-visible:ring-2 focus-visible:ring-foreground/60",
                        )}
                      >
                        <BookOpen aria-hidden="true" className="size-3.5" />
                        {t("read")}
                      </Link>
                    )}
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      <Dialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) closeDeleteDialog();
        }}
      >
        <DialogContent data-testid="delete-dialog" className="sm:max-w-md">
          <DialogHeader>
            <span className="flex size-10 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <Trash2 aria-hidden="true" className="size-4" />
            </span>
            <DialogTitle className="text-lg leading-snug">
              {t("delete")}
            </DialogTitle>
            <DialogDescription>{t("confirm")}</DialogDescription>
          </DialogHeader>
          {pendingDelete && (
            <p className="truncate rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm font-medium text-foreground">
              {pendingDelete.title}
            </p>
          )}
          {deleteError && (
            <div
              role="alert"
              data-testid="delete-error"
              className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              <AlertCircle
                className="mt-0.5 size-4 shrink-0"
                aria-hidden="true"
              />
              {deleteError}
            </div>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={closeDeleteDialog}
              disabled={deleting}
            >
              {t("cancel")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              data-testid="confirm-delete"
              onClick={handleConfirmDelete}
              disabled={deleting}
            >
              {tc("delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
