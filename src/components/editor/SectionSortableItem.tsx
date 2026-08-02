"use client";

import type { ReactNode } from "react";
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
      className="relative"
    >
      <div
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        onClick={(e) => e.stopPropagation()}
        className="absolute left-2 top-2 z-10 cursor-grab rounded bg-muted/80 p-1 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
        role="button"
        aria-label="Glisser pour réorganiser"
      >
        <GripVertical className="size-4" />
      </div>

      {children}
    </div>
  );
}
