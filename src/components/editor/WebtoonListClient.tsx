"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { AlertCircle, Plus, Trash2 } from "lucide-react";

import { createWebtoonAction, deleteWebtoonAction } from "@/app/editor/actions";
import {
  Card,
  CardDescription,
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

export function WebtoonListClient({ title, webtoons }: WebtoonListClientProps) {
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-heading text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          {title}
        </h1>
        <Button
          type="button"
          size="lg"
          className="h-12 gap-2 text-base"
          onClick={handleCreate}
          disabled={creating}
        >
          <Plus aria-hidden="true" />
          {t("newWebtoon")}
        </Button>
      </div>

      {createError && (
        <div
          data-testid="create-error"
          className="mt-4 flex items-center gap-2 rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive"
        >
          <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
          {createError}
        </div>
      )}

      {webtoons.length === 0 ? (
        <p
          data-testid="editor-empty"
          className="mx-auto mt-24 text-center text-base text-muted-foreground"
        >
          {t("empty")}
        </p>
      ) : (
        <ul className="mx-auto mt-8 grid w-full grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {webtoons.map((webtoon) => (
            <li key={webtoon.id}>
              <Card className="h-full transition-colors hover:bg-accent/50">
                <CardHeader>
                  <CardTitle>{webtoon.title}</CardTitle>
                  <CardDescription>
                    {webtoon.visibility === "draft"
                      ? t("draft")
                      : t("published")}
                  </CardDescription>
                </CardHeader>
                <div className="flex items-center gap-2 px-6 pb-4">
                  <Link
                    href={`/editor/${webtoon.id}`}
                    className={cn(
                      buttonVariants({ variant: "outline", size: "sm" }),
                      "flex-1",
                    )}
                  >
                    {t("edit")}
                  </Link>
                  {webtoon.visibility === "published" && (
                    <Link
                      href={`/read/${webtoon.id}`}
                      className={cn(
                        buttonVariants({ variant: "outline", size: "sm" }),
                        "flex-1",
                      )}
                    >
                      {t("read")}
                    </Link>
                  )}
                  <button
                    type="button"
                    data-testid={`delete-${webtoon.id}`}
                    aria-label={t("delete")}
                    onClick={() => requestDelete(webtoon)}
                    className="inline-flex size-9 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors hover:bg-destructive hover:text-destructive-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                  >
                    <Trash2 aria-hidden="true" className="size-4" />
                  </button>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <Dialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) closeDeleteDialog();
        }}
      >
        <DialogContent data-testid="delete-dialog">
          <DialogHeader>
            <DialogTitle>{t("delete")}</DialogTitle>
            <DialogDescription>{t("confirm")}</DialogDescription>
          </DialogHeader>
          {pendingDelete && (
            <p className="text-sm font-medium text-foreground">
              {pendingDelete.title}
            </p>
          )}
          {deleteError && (
            <div
              data-testid="delete-error"
              className="flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
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
