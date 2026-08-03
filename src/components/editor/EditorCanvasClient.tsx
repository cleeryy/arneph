"use client";

import * as React from "react";
import { EditorCanvas } from "./EditorCanvas";
import { useEditorState } from "./EditorStateContext";
import type { SectionWithImages } from "@/lib/db/queries";

interface EditorCanvasClientProps {
  initialSections: SectionWithImages[];
}

export function EditorCanvasClient({
  initialSections,
}: EditorCanvasClientProps) {
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
    <EditorCanvas
      sections={sections}
      onSectionsChange={handleSectionsChange}
    />
  );
}
