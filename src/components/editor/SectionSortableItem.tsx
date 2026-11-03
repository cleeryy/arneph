"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import type { SectionWithImages } from "@/lib/db/queries";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";

interface SectionSortableItemProps {
  section: SectionWithImages;
  children: ReactNode;
}

export function SectionSortableItem({
  section,
  children,
}: SectionSortableItemProps) {
  const t = useTranslations("editor");
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: section.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-testid={`sortable-section-${section.id}`}
      data-section-id={section.id}
      data-dragging={isDragging ? "true" : undefined}
      className={
        "group relative rounded-lg transition-shadow " +
        (isDragging ? "z-20 shadow-lg ring-2 ring-primary/30" : "")
      }
    >
      <div
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        tabIndex={0}
        onClick={(e) => e.stopPropagation()}
        className="absolute left-2 top-2 z-10 flex size-8 cursor-grab touch-none items-center justify-center rounded-md bg-background/90 text-muted-foreground opacity-100 shadow-sm ring-1 ring-border backdrop-blur transition-all hover:text-foreground hover:ring-muted-foreground/30 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing lg:opacity-0 lg:group-hover:opacity-100 lg:group-focus-within:opacity-100"
        role="button"
        aria-label={t("dragHandle")}
        title={t("dragHandle")}
      >
        <GripVertical className="size-4" />
      </div>

      {children}
    </div>
  );
}
