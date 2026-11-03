"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { ArrowUp, ArrowDown, Trash2, Plus } from "lucide-react";
import { DndContext, closestCenter } from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Edit3 } from "lucide-react";
import { SectionPreview } from "./SectionPreview";
import { SectionSortableItem } from "./SectionSortableItem";
import { EditorStateContext } from "./EditorStateContext";
import { SectionConfigPanel, createDefaultConfig } from "./SectionConfigPanel";
import { NewSectionDialog } from "./NewSectionDialog";
import { useSectionDnd } from "@/lib/editor/useSectionDnd";
import { renumberSections } from "@/lib/editor/sections";
import type { SectionWithImages } from "@/lib/db/queries";
import type { SectionType } from "@/types/webtoon";

interface EditorCanvasProps {
  sections: SectionWithImages[];
  onSectionsChange: (sections: SectionWithImages[]) => void;
  webtoonId: string;
}

const noop = () => {};

export function EditorCanvas({ sections, onSectionsChange, webtoonId }: EditorCanvasProps) {
  const t = useTranslations("editor");
  const [localSelectedId, setLocalSelectedId] = React.useState<string | null>(null);
  const editorState = React.useContext(EditorStateContext);
  const setIsDirty = editorState?.setIsDirty ?? noop;
  // Selection lives in the editor context so the sidebar and the canvas agree.
  // Without a provider (isolated canvas tests) it falls back to local state.
  const selectedId = editorState ? editorState.selectedSectionId : localSelectedId;
  const contextSetSelectedId = editorState?.setSelectedSectionId;
  const setSelectedId = React.useCallback(
    (next: string | null) => {
      if (contextSetSelectedId) {
        contextSetSelectedId(next);
      } else {
        setLocalSelectedId(next);
      }
    },
    [contextSetSelectedId],
  );
  const [configPanelSection, setConfigPanelSection] = React.useState<SectionWithImages | null>(null);
  const [newSectionOpen, setNewSectionOpen] = React.useState(false);
  const [scrollTargetId, setScrollTargetId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!scrollTargetId) return;
    const raf = requestAnimationFrame(() => {
      document
        .querySelector(`[data-testid="editor-canvas"] [data-section-id="${scrollTargetId}"]`)
        ?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      setScrollTargetId(null);
    });
    return () => cancelAnimationFrame(raf);
  }, [scrollTargetId]);

  const handleAddSection = React.useCallback(() => {
    setNewSectionOpen(true);
  }, []);

  const handleCreateSection = React.useCallback(
    (type: SectionType) => {
      const now = new Date().toISOString();
      const nextPosition =
        sections.reduce((max, section) => Math.max(max, section.position), 0) + 1;
      const newId = crypto.randomUUID();
      const newSection = {
        id: newId,
        webtoonId,
        position: nextPosition,
        type,
        config: createDefaultConfig(type),
        images: [],
        audioPath: undefined,
        createdAt: now,
        updatedAt: now,
      } satisfies SectionWithImages;
      onSectionsChange([...sections, newSection]);
      setIsDirty(true);
      setNewSectionOpen(false);
      setSelectedId(newId);
      setScrollTargetId(newId);
    },
    [sections, onSectionsChange, setIsDirty, setSelectedId, webtoonId],
  );

  const handleReorder = React.useCallback(
    (next: SectionWithImages[]) => {
      onSectionsChange(next);
      setIsDirty(true);
    },
    [onSectionsChange, setIsDirty],
  );

  const { sorted, sortedIds, sensors, handleDragEnd } = useSectionDnd(
    sections,
    handleReorder,
  );

  const handleSelect = React.useCallback(
    (id: string) => {
      setSelectedId(selectedId === id ? null : id);
    },
    [selectedId, setSelectedId],
  );

  const handleConfigSectionChange = React.useCallback((section: SectionWithImages) => {
    onSectionsChange(sections.map((current) => (current.id === section.id ? section : current)));
    setConfigPanelSection(section);
    setIsDirty(true);
  }, [sections, onSectionsChange, setIsDirty]);

  const handleDelete = React.useCallback(
    (id: string) => {
      onSectionsChange(
        renumberSections(sections.filter((section) => section.id !== id)),
      );
      setIsDirty(true);
      if (selectedId === id) setSelectedId(null);
    },
    [sections, onSectionsChange, setIsDirty, selectedId, setSelectedId],
  );

  const handleMoveUp = React.useCallback(
    (id: string) => {
      const idx = sections.findIndex((s) => s.id === id);
      if (idx <= 0) return;
      onSectionsChange(
        renumberSections(arrayMove(sections, idx, idx - 1)),
      );
      setIsDirty(true);
    },
    [sections, onSectionsChange, setIsDirty],
  );

  const handleMoveDown = React.useCallback(
    (id: string) => {
      const idx = sections.findIndex((s) => s.id === id);
      if (idx < 0 || idx >= sections.length - 1) return;
      onSectionsChange(
        renumberSections(arrayMove(sections, idx, idx + 1)),
      );
      setIsDirty(true);
    },
    [sections, onSectionsChange, setIsDirty],
  );

  if (sorted.length === 0) {
    return (
      <>
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center text-muted-foreground sm:p-8">
          <p className="max-w-sm text-sm">{t("canvasEmpty")}</p>
          <Button onClick={handleAddSection}>
            <Plus className="mr-2 h-4 w-4" />
            {t("addSection")}
          </Button>
        </div>
        <NewSectionDialog
          open={newSectionOpen}
          onOpenChange={setNewSectionOpen}
          onConfirm={handleCreateSection}
        />
      </>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 px-3 sm:px-4">
        <h3 className="font-heading text-sm font-semibold text-foreground">
          {t("sections")}
          <span className="ml-2 font-body text-xs font-normal text-muted-foreground tabular-nums">
            {sorted.length}
          </span>
        </h3>
        <Button size="sm" onClick={handleAddSection}>
          <Plus className="mr-2 h-4 w-4" />
          {t("addSection")}
        </Button>
      </div>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={sortedIds} strategy={verticalListSortingStrategy}>
          <div data-testid="editor-canvas" className="flex flex-1 flex-col gap-3 p-3 sm:gap-4 sm:p-4">
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
                    role="group"
                    aria-label={`Section #${section.position}`}
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.target !== e.currentTarget) return;
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        handleSelect(section.id);
                      }
                    }}
                    className={"relative cursor-pointer rounded-lg border transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 " +
                      (isSelected
                        ? "border-primary ring-2 ring-primary/20"
                        : "border-border hover:border-muted-foreground/30"
                    )}
                    onClick={() => handleSelect(section.id)}
                  >
                    {isSelected && (
                      <div className="absolute -top-2 -right-2 z-10 rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">
                        {t("selected")}
                      </div>
                    )}
                    <SectionPreview section={section} />
                    <div className="flex flex-wrap items-center gap-1 border-t border-border bg-muted/30 px-2 py-1.5">
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
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={t("editSection")}
                        title={t("editSection")}
                        onClick={(e) => {
                          e.stopPropagation();
                          setConfigPanelSection(section);
                        }}
                        className="size-7"
                      >
                        <Edit3 className="size-3.5" />
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

       {configPanelSection && (
         <Dialog
           open={!!configPanelSection}
           onOpenChange={(open) => {
             if (!open) setConfigPanelSection(null);
           }}
         >
           <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
             <DialogHeader>
               <DialogTitle>{t("configPanelTitle")}</DialogTitle>
             </DialogHeader>
             <SectionConfigPanel
               section={configPanelSection}
               onSectionChange={handleConfigSectionChange}
               onClose={() => setConfigPanelSection(null)}
             />
           </DialogContent>
         </Dialog>
       )}

       <NewSectionDialog
         open={newSectionOpen}
         onOpenChange={setNewSectionOpen}
         onConfirm={handleCreateSection}
       />
     </div>
  );
}
