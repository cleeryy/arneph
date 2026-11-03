"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { AlertCircle, Save } from "lucide-react";

import { updateWebtoonMetadataAction } from "@/app/editor/actions";
import { useEditorState } from "@/components/editor/EditorStateContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface WebtoonMetadataFormProps {
  webtoonId: string;
}

export function WebtoonMetadataForm({ webtoonId }: WebtoonMetadataFormProps) {
  const t = useTranslations("editor");
  const { webtoonTitle, webtoonDescription, setWebtoonTitle, setWebtoonDescription } =
    useEditorState();

  const [title, setTitle] = React.useState(webtoonTitle ?? "");
  const [description, setDescription] = React.useState(
    webtoonDescription ?? "",
  );
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;

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
      setWebtoonTitle(nextTitle);
      setWebtoonDescription(nextDescription);
      setTitle(nextTitle);
      setDescription(nextDescription);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("metadataError"));
    } finally {
      setSaving(false);
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
        <div className="grid gap-1.5">
          <Label htmlFor="webtoon-metadata-title">{t("metadataTitle")}</Label>
          <Input
            id="webtoon-metadata-title"
            data-testid="metadata-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            disabled={saving}
            maxLength={200}
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
            onChange={(event) => setDescription(event.target.value)}
            disabled={saving}
            rows={2}
            maxLength={2000}
          />
        </div>
        <div className="flex items-center gap-3 sm:col-span-2">
          <Button
            type="submit"
            data-testid="metadata-save"
            disabled={saving}
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
