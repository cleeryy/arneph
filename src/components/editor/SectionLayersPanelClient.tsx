"use client";

import * as React from "react";
import { SectionLayersPanel } from "./SectionLayersPanel";
import { useEditorState } from "./EditorStateContext";
import type { SectionWithImages } from "@/lib/db/queries";

interface SectionLayersPanelClientProps {
  initialSections: SectionWithImages[];
}

export function SectionLayersPanelClient({
  initialSections,
}: SectionLayersPanelClientProps) {
  const {
    sections,
    setSections,
    setIsDirty,
    selectedSectionId,
    setSelectedSectionId,
  } = useEditorState();

  React.useEffect(() => {
    setSections(initialSections);
  }, [initialSections, setSections]);

  const handleSectionsChange = React.useCallback(
    (next: SectionWithImages[]) => {
      setSections(next);
      setIsDirty(true);
    },
    [setSections, setIsDirty],
  );

  const handleSelect = React.useCallback(
    (id: string) => {
      setSelectedSectionId(id);
      // Scope to the canvas: layer rows and sortable wrappers also carry
      // data-section-id, so target the rendered section card explicitly.
      const target =
        document.querySelector<HTMLElement>(
          `[data-testid="editor-canvas"] [data-testid="editor-section-${id}"]`,
        ) ??
        document.querySelector<HTMLElement>(
          `[data-testid="editor-canvas"] [data-section-id="${id}"]`,
        );
      target?.scrollIntoView?.({ behavior: "smooth", block: "center" });
    },
    [setSelectedSectionId],
  );

  return (
    <SectionLayersPanel
      sections={sections}
      selectedId={selectedSectionId}
      onSelect={handleSelect}
      onSectionsChange={handleSectionsChange}
    />
  );
}
