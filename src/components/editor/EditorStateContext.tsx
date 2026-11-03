"use client";

import * as React from "react";
import type { SectionWithImages } from "@/lib/db/queries";
import type { SectionVisibility } from "@/types/webtoon";

interface EditorState {
  sections: SectionWithImages[];
  setSections: (sections: SectionWithImages[]) => void;
  isDirty: boolean;
  setIsDirty: (dirty: boolean) => void;
  webtoonTitle: string | null;
  setWebtoonTitle: (title: string | null) => void;
  visibility: SectionVisibility | null;
  setVisibility: (visibility: SectionVisibility | null) => void;
}

/**
 * Replace client-temporary section ids with canonical server ids.
 * Immutable: returns new section/image objects, never mutates inputs.
 * Sections without a mapping entry keep their existing id.
 */
export function remapSectionIds(
  sections: SectionWithImages[],
  sectionIds: Record<string, string>,
): SectionWithImages[] {
  return sections.map((section) => {
    const nextId = sectionIds[section.id] ?? section.id;
    return {
      ...section,
      id: nextId,
      images: section.images.map((image) => ({
        ...image,
        sectionId: sectionIds[image.sectionId] ?? image.sectionId,
      })),
    };
  });
}

export const EditorStateContext = React.createContext<EditorState | null>(null);

export function EditorStateProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sections, setSections] = React.useState<SectionWithImages[]>([]);
  const [isDirty, setIsDirty] = React.useState(false);
  const [webtoonTitle, setWebtoonTitle] = React.useState<string | null>(null);
  const [visibility, setVisibility] = React.useState<SectionVisibility | null>(null);

  const value = React.useMemo(
    () => ({ sections, setSections, isDirty, setIsDirty, webtoonTitle, setWebtoonTitle, visibility, setVisibility }),
    [sections, isDirty, webtoonTitle, visibility],
  );

  return (
    <EditorStateContext.Provider value={value}>
      {children}
    </EditorStateContext.Provider>
  );
}

export function useEditorState(): EditorState {
  const ctx = React.useContext(EditorStateContext);
  if (!ctx) {
    throw new Error("useEditorState must be used within EditorStateProvider");
  }
  return ctx;
}
