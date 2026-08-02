"use client";

import * as React from "react";
import type { SectionWithImages } from "@/lib/db/queries";

interface EditorState {
  sections: SectionWithImages[];
  setSections: (sections: SectionWithImages[]) => void;
  isDirty: boolean;
  setIsDirty: (dirty: boolean) => void;
}

export const EditorStateContext = React.createContext<EditorState | null>(null);

export function EditorStateProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sections, setSections] = React.useState<SectionWithImages[]>([]);
  const [isDirty, setIsDirty] = React.useState(false);

  return (
    <EditorStateContext.Provider
      value={{ sections, setSections, isDirty, setIsDirty }}
    >
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
