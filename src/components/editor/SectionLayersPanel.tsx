"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Image, FileText, ArrowLeftRight, Play } from "lucide-react";
import {
  DndContext,
  closestCenter,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";

import {
  SidebarMenu,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { SectionSortableItem } from "./SectionSortableItem";
import { EditorStateContext } from "./EditorStateContext";
import { useSectionDnd } from "@/lib/editor/useSectionDnd";
import { sectionTypeLabel } from "@/lib/editor/section-labels";
import type { SectionWithImages } from "@/lib/db/queries";
import type { SectionType } from "@/types/webtoon";

interface SectionLayersPanelProps {
  sections: SectionWithImages[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onSectionsChange: (sections: SectionWithImages[]) => void;
}

function noopSetIsDirty(): void {}

function getSectionTypeIcon(type: SectionType) {
  switch (type) {
    case "image":
      return Image;
    case "long-y":
      return FileText;
    case "pan-x":
      return ArrowLeftRight;
    case "animation":
      return Play;
  }
}

export function SectionLayersPanel({
  sections,
  selectedId,
  onSelect,
  onSectionsChange,
}: SectionLayersPanelProps) {
  const t = useTranslations("editor");
  const editorState = React.useContext(EditorStateContext);
  const setIsDirty = React.useMemo(
    () => editorState?.setIsDirty ?? noopSetIsDirty,
    [editorState],
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

  if (sorted.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("noSections")}</p>;
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={sortedIds} strategy={verticalListSortingStrategy}>
        <SidebarMenu data-testid="section-layers-panel">
          {sorted.map((section) => {
            const isSelected = selectedId === section.id;
            const TypeIcon = getSectionTypeIcon(section.type);
            const typeLabel = sectionTypeLabel(t, section.type);

            return (
              <SidebarMenuItem key={section.id}>
                <SectionSortableItem section={section}>
                  <div
                    data-testid={`layer-section-${section.id}`}
                    data-section-id={section.id}
                    data-selected={isSelected ? "true" : undefined}
                    role="button"
                    tabIndex={0}
                    aria-pressed={isSelected}
                    aria-label={`${typeLabel} #${section.position}`}
                    onKeyDown={(e) => {
                      if (e.target !== e.currentTarget) return;
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onSelect(section.id);
                      }
                    }}
                    className={
                      "relative flex min-h-10 cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 " +
                      (isSelected
                        ? "border border-primary ring-2 ring-primary/20 bg-primary/5"
                        : "border border-transparent hover:bg-muted/50"
                      )
                    }
                    onClick={() => onSelect(section.id)}
                  >
                    <TypeIcon className="size-4 shrink-0 text-muted-foreground" />
                    <span className="flex-1 truncate font-medium capitalize">
                      {typeLabel}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                      #{section.position}
                    </span>
                  </div>
                </SectionSortableItem>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SortableContext>
    </DndContext>
  );
}
