"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { ArrowUp, ArrowDown, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { SectionPreview } from "./SectionPreview";
import type { SectionWithImages } from "@/lib/db/queries";

interface EditorCanvasProps {
  sections: SectionWithImages[];
  onSectionsChange: (sections: SectionWithImages[]) => void;
}

export function EditorCanvas({ sections, onSectionsChange }: EditorCanvasProps) {
  const t = useTranslations("editor");
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [dirty, setDirty] = React.useState(false);

  const sorted = React.useMemo(
    () => [...sections].sort((a, b) => a.position - b.position),
    [sections],
  );

  const handleSelect = React.useCallback((id: string) => {
    setSelectedId((prev) => (prev === id ? null : id));
  }, []);

  const handleDelete = React.useCallback(
    (id: string) => {
      const next = sections.filter((s) => s.id !== id);
      onSectionsChange(next);
      setDirty(true);
      setSelectedId((prev) => (prev === id ? null : prev));
    },
    [sections, onSectionsChange],
  );

  const handleMoveUp = React.useCallback(
    (id: string) => {
      const idx = sections.findIndex((s) => s.id === id);
      if (idx <= 0) return;
      const next = [...sections];
      const temp = next[idx];
      next[idx] = next[idx - 1];
      next[idx - 1] = temp;
      next.forEach((s, i) => {
        s.position = i + 1;
      });
      onSectionsChange(next);
      setDirty(true);
    },
    [sections, onSectionsChange],
  );

  const handleMoveDown = React.useCallback(
    (id: string) => {
      const idx = sections.findIndex((s) => s.id === id);
      if (idx < 0 || idx >= sections.length - 1) return;
      const next = [...sections];
      const temp = next[idx];
      next[idx] = next[idx + 1];
      next[idx + 1] = temp;
      next.forEach((s, i) => {
        s.position = i + 1;
      });
      onSectionsChange(next);
      setDirty(true);
    },
    [sections, onSectionsChange],
  );

  if (sorted.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center text-muted-foreground">
        {t("canvasEmpty")}
      </div>
    );
  }

  return (
    <div data-testid="editor-canvas" className="flex flex-1 flex-col gap-4 p-4">
      {sorted.map((section) => {
        const isSelected = selectedId === section.id;
        const isFirst = section.position === 1;
        const isLast = section.position === sections.length;

        return (
            <div
            key={section.id}
            data-testid={`editor-section-${section.id}`}
            data-section-id={section.id}
            data-selected={isSelected ? "true" : undefined}
            className={`relative rounded-lg border transition-colors ${
              isSelected
                ? "border-primary ring-2 ring-primary/20"
                : "border-border hover:border-muted-foreground/30"
            }`}
            onClick={() => handleSelect(section.id)}
          >
            {isSelected && (
              <div className="absolute -top-2 -right-2 z-10 rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">
                {t("selected")}
              </div>
            )}

            <SectionPreview section={section} />

            <div className="flex items-center gap-1 border-t border-border bg-muted/30 px-2 py-1.5">
              <Button
                variant="ghost"
                size="icon"
                aria-label={t("moveUp")}
                title={t("moveUp")}
                disabled={isFirst}
                onClick={(e) => {
                  e.stopPropagation();
                  handleMoveUp(section.id);
                }}
                className="size-7"
              >
                <ArrowUp className="size-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label={t("moveDown")}
                title={t("moveDown")}
                disabled={isLast}
                onClick={(e) => {
                  e.stopPropagation();
                  handleMoveDown(section.id);
                }}
                className="size-7"
              >
                <ArrowDown className="size-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label={t("deleteSection")}
                title={t("deleteSection")}
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete(section.id);
                }}
                className="size-7 text-destructive hover:text-destructive"
              >
                <Trash2 className="size-3.5" />
              </Button>
              <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                #{section.position}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
