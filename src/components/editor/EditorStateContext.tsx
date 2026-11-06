"use client";

import * as React from "react";
import type { SectionWithImages } from "@/lib/db/queries";
import { renumberSections } from "@/lib/editor/sections";
import type {
  SectionConfig,
  SectionVisibility,
} from "@/types/webtoon";

/** Nombre maximum d'instantanés conservés pour annuler/rétablir. */
export const HISTORY_LIMIT = 50;

export interface EditorState {
  sections: SectionWithImages[];
  /**
   * Remplace les sections sans créer d'entrée d'historique : utilisé pour
   * l'hydratation serveur et le remap des ids après sauvegarde.
   */
  setSections: (sections: SectionWithImages[]) => void;
  /** Applique une édition utilisateur et empile un instantané d'historique. */
  commitSections: (sections: SectionWithImages[]) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  isDirty: boolean;
  setIsDirty: (dirty: boolean) => void;
  webtoonTitle: string | null;
  setWebtoonTitle: (title: string | null) => void;
  webtoonDescription: string | null;
  setWebtoonDescription: (description: string | null) => void;
  visibility: SectionVisibility | null;
  setVisibility: (visibility: SectionVisibility | null) => void;
  /** Selection is shared between the sidebar layers panel and the canvas. */
  selectedSectionId: string | null;
  setSelectedSectionId: React.Dispatch<React.SetStateAction<string | null>>;
}

interface SectionsHistoryState {
  sections: SectionWithImages[];
  past: SectionWithImages[][];
  future: SectionWithImages[][];
  isDirty: boolean;
}

type SectionsHistoryAction =
  | { type: "setSections"; sections: SectionWithImages[] }
  | { type: "setDirty"; isDirty: boolean }
  | { type: "commit"; sections: SectionWithImages[] }
  | { type: "undo" }
  | { type: "redo" };

const INITIAL_HISTORY_STATE: SectionsHistoryState = {
  sections: [],
  past: [],
  future: [],
  isDirty: false,
};

function pushBounded(
  stack: SectionWithImages[][],
  entry: SectionWithImages[],
): SectionWithImages[][] {
  const next = [...stack, entry];
  return next.length > HISTORY_LIMIT
    ? next.slice(next.length - HISTORY_LIMIT)
    : next;
}

function sectionsHistoryReducer(
  state: SectionsHistoryState,
  action: SectionsHistoryAction,
): SectionsHistoryState {
  switch (action.type) {
    case "setSections":
      // Synchronisation externe (hydratation, remap post-sauvegarde) : les
      // instantanés précédents référencent des ids obsolètes, on vide donc
      // l'historique pour ne jamais pouvoir annuler vers eux.
      return { ...state, sections: action.sections, past: [], future: [] };
    case "setDirty":
      return state.isDirty === action.isDirty
        ? state
        : { ...state, isDirty: action.isDirty };
    case "commit":
      return {
        sections: action.sections,
        past: pushBounded(state.past, state.sections),
        future: [],
        isDirty: true,
      };
    case "undo": {
      if (state.past.length === 0) return state;
      const previous = state.past[state.past.length - 1];
      return {
        sections: previous,
        past: state.past.slice(0, -1),
        future: [state.sections, ...state.future].slice(0, HISTORY_LIMIT),
        isDirty: true,
      };
    }
    case "redo": {
      if (state.future.length === 0) return state;
      const next = state.future[0];
      return {
        sections: next,
        past: pushBounded(state.past, state.sections),
        future: state.future.slice(1),
        isDirty: true,
      };
    }
  }
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

/**
 * Copie de config sans aucun chemin Storage : deux sections ne doivent jamais
 * partager un fichier, car supprimer l'une effacerait le média de l'autre.
 */
function stripMediaFromConfig(config: SectionConfig): SectionConfig {
  switch (config.type) {
    case "animation":
      return {
        type: "animation",
        spritePath: "",
        frameWidth: 0,
        frameHeight: 0,
        columns: 0,
        rows: 0,
        frameCount: 0,
        scrollHeight: config.scrollHeight,
      };
    case "pan-x":
      return {
        type: "pan-x",
        imagePath: "",
        width: 0,
        height: 0,
        panSpeed: config.panSpeed,
      };
    case "image":
    case "long-y":
      return {
        type: config.type,
        imagePath: "",
        width: 0,
        height: 0,
      };
  }
}

/**
 * Duplique une section sous un nouvel id client (UUID), position+1.
 * Le type et les réglages non média sont conservés ; `images`, `audioPath`,
 * `imagePath`/`spritePath` et l'overlay FX sont vidés pour ne jamais réutiliser
 * un fichier Storage appartenant à la section source.
 */
export function duplicateSection(section: SectionWithImages): SectionWithImages {
  const now = new Date().toISOString();
  return {
    ...section,
    id: crypto.randomUUID(),
    position: section.position + 1,
    config: stripMediaFromConfig(section.config),
    images: [],
    audioPath: undefined,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Insère la copie juste après sa source puis renumérote les positions.
 * Retourne `duplicated: null` si la source n'existe pas.
 */
export function insertDuplicateSection(
  sections: SectionWithImages[],
  sourceId: string,
): { sections: SectionWithImages[]; duplicated: SectionWithImages | null } {
  const source = sections.find((section) => section.id === sourceId);
  if (!source) return { sections, duplicated: null };

  const duplicated = duplicateSection(source);
  const ordered = [...sections].sort((a, b) => a.position - b.position);
  const sourceIndex = ordered.findIndex((section) => section.id === sourceId);
  ordered.splice(sourceIndex + 1, 0, duplicated);

  return { sections: renumberSections(ordered), duplicated };
}

/**
 * Le raccourci clavier doit être ignoré dans tout champ de saisie, y compris
 * `contentEditable` (éditeurs riches).
 */
export function isEditableShortcutTarget(
  target: EventTarget | null,
): boolean {
  if (typeof HTMLElement === "undefined" || !(target instanceof HTMLElement)) {
    return false;
  }
  if (target.isContentEditable) return true;
  // jsdom n'implémente pas `isContentEditable` : l'attribut reste la source
  // fiable, y compris pour un événement émis depuis un enfant de l'éditeur.
  const editableHost = target.closest("[contenteditable]");
  if (editableHost && editableHost.getAttribute("contenteditable") !== "false") {
    return true;
  }
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

export const EditorStateContext = React.createContext<EditorState | null>(null);

export function EditorStateProvider({
  children,
  initialTitle = null,
  initialDescription = null,
  initialVisibility = null,
}: {
  children: React.ReactNode;
  initialTitle?: string | null;
  initialDescription?: string | null;
  initialVisibility?: SectionVisibility | null;
}) {
  const [history, dispatch] = React.useReducer(
    sectionsHistoryReducer,
    INITIAL_HISTORY_STATE,
  );
  const [webtoonTitle, setWebtoonTitle] = React.useState<string | null>(
    initialTitle,
  );
  const [webtoonDescription, setWebtoonDescription] = React.useState<
    string | null
  >(initialDescription);
  const [visibility, setVisibility] = React.useState<SectionVisibility | null>(
    initialVisibility,
  );
  const [selectedSectionId, setSelectedSectionId] = React.useState<
    string | null
  >(null);

  const setSections = React.useCallback(
    (sections: SectionWithImages[]) => {
      dispatch({ type: "setSections", sections });
    },
    [],
  );

  const commitSections = React.useCallback(
    (sections: SectionWithImages[]) => {
      dispatch({ type: "commit", sections });
    },
    [],
  );

  const undo = React.useCallback(() => {
    dispatch({ type: "undo" });
  }, []);

  const redo = React.useCallback(() => {
    dispatch({ type: "redo" });
  }, []);

  const setIsDirty = React.useCallback((dirty: boolean) => {
    dispatch({ type: "setDirty", isDirty: dirty });
  }, []);

  // Raccourcis globaux de l'éditeur : Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z, Ctrl+Y.
  React.useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
      if (isEditableShortcutTarget(event.target)) return;

      const key = event.key.toLowerCase();
      if (key === "z") {
        event.preventDefault();
        if (event.shiftKey) {
          redo();
        } else {
          undo();
        }
        return;
      }
      if (key === "y") {
        event.preventDefault();
        redo();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [undo, redo]);

  const value = React.useMemo(
    () => ({
      sections: history.sections,
      setSections,
      commitSections,
      undo,
      redo,
      canUndo: history.past.length > 0,
      canRedo: history.future.length > 0,
      isDirty: history.isDirty,
      setIsDirty,
      webtoonTitle,
      setWebtoonTitle,
      webtoonDescription,
      setWebtoonDescription,
      visibility,
      setVisibility,
      selectedSectionId,
      setSelectedSectionId,
    }),
    [
      history.sections,
      history.past.length,
      history.future.length,
      history.isDirty,
      setSections,
      commitSections,
      undo,
      redo,
      setIsDirty,
      webtoonTitle,
      webtoonDescription,
      visibility,
      selectedSectionId,
    ],
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
