"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { ArrowUp, ArrowDown, Trash2 } from "lucide-react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";

import { Button } from "@/components/ui/button";
import { SectionPreview } from "./SectionPreview";
import { SectionSortableItem } from "./SectionSortableItem";
import { EditorStateContext } from "./EditorStateContext";
import type { SectionWithImages } from "@/lib/db/queries";

interface EditorCanvasProps {
  sections: SectionWithImages[];
  onSectionsChange: (sections: SectionWithImages[]) => void;
}

export function EditorCanvas({ sections, onSectionsChange }: EditorCanvasProps) {
  const t = useTranslations("editor");
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const editorState = React.useContext(EditorStateContext);
  const isDirty = editorState?.isDirty ?? false;
  const setIsDirty = editorState?.setIsDirty ?? (() => {});

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const sorted = React.useMemo(
    () => [...sections].sort((a, b) => a.position - b.position),
    [sections],
  );

  const sortedIds = React.useMemo(
    () => sorted.map((s) => s.id),
    [sorted],
  );

  const handleSelect = React.useCallback((id: string) => {
    setSelectedId((prev) => (prev === id ? null : id));
  }, []);

  const handleDelete = React.useCallback(
    (id: string) => {
      const next = sections.filter((s) => s.id !== id);
      onSectionsChange(next);
      setIsDirty(true);
      setSelectedId((prev) => (prev === id ? null : prev));
    },
    [sections, onSectionsChange, setIsDirty],
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
      setIsDirty(true);
    },
    [sections, onSectionsChange, setIsDirty],
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
      setIsDirty(true);
    },
    [sections, onSectionsChange, setIsDirty],
  );

  const handleDragEnd = React.useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (active.id !== over?.id) {
        const oldIndex = sortedIds.indexOf(active.id as string);
        const newIndex = sortedIds.indexOf(over?.id as string);
        if (oldIndex < 0 || newIndex < 0) return;
        const reordered = arrayMove(sorted, oldIndex, newIndex);
        const next = reordered.map((s, i) => ({
          ...s,
          position: i + 1,
        }));
        onSectionsChange(next);
        setIsDirty(true);
      }
    },
    [sorted, sortedIds, onSectionsChange, setIsDirty],
  );

  if (sorted.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center text-muted-foreground">
        {t("canvasEmpty")}
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={sortedIds} strategy={verticalListSortingStrategy}>
        <div data-testid="editor-canvas" className="flex flex-1 flex-col gap-4 p-4">
          {sorted.map((section) => {
            const isSelected = selectedId === section.id;
            const isFirst = section.position === 1;
            const isLast = section.position === sections.length;

            return (
              <SectionSortableItem
                key={section.id}
                section={section}
              >
                <div
                  data-testid={`editor-section-${section.id}`}
                  data-section-id={section.id}
                  data-selected={isSelected ? "true" : undefined}
                  className={`relative rounded-lg border transition-colors group ${
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
              </SectionSortableItem>
            );
          })}
        </div>
      </SortableContext>
    </DndContext>
  );
}
