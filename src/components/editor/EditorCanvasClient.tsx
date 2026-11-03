"use client";

import * as React from "react";
import { EditorCanvas } from "./EditorCanvas";
import { useEditorState } from "./EditorStateContext";
import type { SectionWithImages } from "@/lib/db/queries";

interface EditorCanvasClientProps {
  initialSections: SectionWithImages[];
  webtoonId: string;
  initialTitle?: string;
  initialVisibility?: "draft" | "published";
}

export function EditorCanvasClient({ initialSections, webtoonId, initialTitle, initialVisibility }: EditorCanvasClientProps) {
  const { sections, setSections, setIsDirty, setWebtoonTitle, setVisibility } = useEditorState();

  React.useEffect(() => {
    setSections(initialSections);
  }, [initialSections, setSections]);

  React.useEffect(() => {
    if (initialTitle !== undefined) setWebtoonTitle(initialTitle);
  }, [initialTitle, setWebtoonTitle]);

  React.useEffect(() => {
    if (initialVisibility !== undefined) setVisibility(initialVisibility);
  }, [initialVisibility, setVisibility]);

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
      webtoonId={webtoonId}
    />
  );
}
