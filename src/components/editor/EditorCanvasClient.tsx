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
  // Hydrate exactly once per webtoon: the RSC payload revalidated after a save
  // must not overwrite edits made while the request was in flight.
  const hydratedForRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (hydratedForRef.current === webtoonId) return;
    hydratedForRef.current = webtoonId;
    setSections(initialSections);
    if (initialTitle !== undefined) setWebtoonTitle(initialTitle);
    if (initialVisibility !== undefined) setVisibility(initialVisibility);
  }, [
    webtoonId,
    initialSections,
    initialTitle,
    initialVisibility,
    setSections,
    setWebtoonTitle,
    setVisibility,
  ]);

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
