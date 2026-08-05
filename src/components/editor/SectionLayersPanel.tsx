"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { GripVertical, Image, FileText, ArrowLeftRight, Play } from "lucide-react";
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

import {
  SidebarMenu,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { SectionSortableItem } from "./SectionSortableItem";
import { EditorStateContext } from "./EditorStateContext";
import type { SectionWithImages } from "@/lib/db/queries";
import type { SectionType } from "@/types/webtoon";

interface SectionLayersPanelProps {
  sections: SectionWithImages[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onSectionsChange: (sections: SectionWithImages[]) => void;
}

function renumberSections(sections: SectionWithImages[]): SectionWithImages[] {
  return sections.map((section, index) => ({
    ...section,
    position: index + 1,
  }));
}

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

function getSectionTypeLabel(
  t: ReturnType<typeof useTranslations>,
  type: SectionType,
) {
  switch (type) {
    case "image":
      return t("sectionTypeImage");
    case "long-y":
      return t("sectionTypeLongY");
    case "pan-x":
      return t("sectionTypePanX");
    case "animation":
      return t("sectionTypeAnimation");
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
  const setIsDirty = editorState?.setIsDirty ?? (() => {});

  const sorted = React.useMemo(
    () => [...sections].sort((a, b) => a.position - b.position),
    [sections],
  );

  const sortedIds = React.useMemo(
    () => sorted.map((s) => s.id),
    [sorted],
  );

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragEnd = React.useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (active.id !== over?.id) {
        const oldIndex = sortedIds.indexOf(active.id as string);
        const newIndex = sortedIds.indexOf(over?.id as string);
        if (oldIndex < 0 || newIndex < 0) return;
        onSectionsChange(renumberSections(arrayMove(sorted, oldIndex, newIndex)));
        setIsDirty(true);
      }
    },
    [sorted, sortedIds, onSectionsChange, setIsDirty],
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
            const typeLabel = getSectionTypeLabel(t, section.type);

            return (
              <SidebarMenuItem key={section.id}>
                <SectionSortableItem section={section}>
                  <div
                    data-testid={`layer-section-${section.id}`}
                    data-section-id={section.id}
                    data-selected={isSelected ? "true" : undefined}
                    className={
                      "relative flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors group " +
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
