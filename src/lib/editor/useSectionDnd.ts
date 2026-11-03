"use client";

import * as React from "react";
import {
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";

import type { SectionWithImages } from "@/lib/db/queries";
import { renumberSections } from "./sections";

export interface SectionDndController {
  /** Sections triées par position croissante. */
  sorted: SectionWithImages[];
  /** Ids des sections triées, pour `SortableContext`. */
  sortedIds: string[];
  /** Capteurs dnd-kit : pointeur (distance 6px) + clavier. */
  sensors: ReturnType<typeof useSensors>;
  /** Réordonne au drop et délègue le résultat renuméroté à `onReorder`. */
  handleDragEnd: (event: DragEndEvent) => void;
}

/**
 * Comportement dnd-kit partagé par le canevas et la liste des calques.
 *
 * Le tri, les capteurs et la résolution `active`/`over` étaient dupliqués à
 * l'identique dans les deux composants ; la seule différence était le
 * callback de mise à jour des sections, désormais injecté via `onReorder`.
 */
export function useSectionDnd(
  sections: SectionWithImages[],
  onReorder: (sections: SectionWithImages[]) => void,
): SectionDndController {
  const sorted = React.useMemo(
    () => [...sections].sort((a, b) => a.position - b.position),
    [sections],
  );

  const sortedIds = React.useMemo(
    () => sorted.map((s) => s.id),
    [sorted],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
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
        onReorder(renumberSections(arrayMove(sorted, oldIndex, newIndex)));
      }
    },
    [sorted, sortedIds, onReorder],
  );

  return { sorted, sortedIds, sensors, handleDragEnd };
}
