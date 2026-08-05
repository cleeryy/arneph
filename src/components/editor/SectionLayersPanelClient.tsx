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
  const { sections, setSections, setIsDirty } = useEditorState();

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

  return (
    <SectionLayersPanel
      sections={sections}
      selectedId={null}
      onSelect={() => {}}
      onSectionsChange={handleSectionsChange}
    />
  );
}
