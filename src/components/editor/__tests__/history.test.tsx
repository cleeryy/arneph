import * as React from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";

import {
  EditorStateProvider,
  duplicateSection,
  insertDuplicateSection,
  useEditorState,
  type EditorState,
} from "../EditorStateContext";
import { EditorCanvas } from "../EditorCanvas";
import { SectionLayersPanel } from "../SectionLayersPanel";
import type { SectionWithImages } from "@/lib/db/queries";
import frMessages from "../../../../messages/fr.json";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function makeSection(
  id: string,
  position: number,
  type: "image" | "animation" = "image",
): SectionWithImages {
  const config =
    type === "image"
      ? {
          type: "image" as const,
          imagePath: `webtoons/sections/${id}/page.webp`,
          width: 800,
          height: 1200,
          audioPath: `webtoons/sections/${id}/audio.mp3`,
          fxPath: `webtoons/sections/${id}/fx.webp`,
          fxConfig: {
            position: { x: "center" as const, y: "center" as const },
            size: { mode: "percent" as const, width: 100 },
            opacity: 1,
          },
        }
      : {
          type: "animation" as const,
          spritePath: `webtoons/sections/${id}/sprite.webp`,
          frameWidth: 100,
          frameHeight: 100,
          columns: 4,
          rows: 3,
          frameCount: 10,
          audioPath: `webtoons/sections/${id}/audio.mp3`,
        };

  return {
    id,
    webtoonId: "w1",
    position,
    type,
    config,
    audioPath: `webtoons/sections/${id}/audio.mp3`,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    images: [
      {
        id: `img-${id}`,
        sectionId: id,
        webtoonId: "w1",
        storagePath: `webtoons/sections/${id}/page.webp`,
        width: 800,
        height: 1200,
        mimeType: "image/webp",
        position: 0,
      },
    ],
  };
}

interface HistoryApi {
  current: EditorState | null;
}

function HistoryProbe({ onState }: { onState: (state: EditorState) => void }) {
  const state = useEditorState();
  React.useEffect(() => {
    onState(state);
  }, [state, onState]);
  const { sections, canUndo, canRedo, isDirty, selectedSectionId } = state;
  return (
    <div
      data-testid="history-probe"
      data-ids={JSON.stringify(sections.map((section) => section.id))}
      data-can-undo={String(canUndo)}
      data-can-redo={String(canRedo)}
      data-dirty={String(isDirty)}
      data-selected={selectedSectionId ?? ""}
    />
  );
}

function renderWithHistory(
  seed: SectionWithImages[],
  extra?: React.ReactNode,
): HistoryApi {
  const api: HistoryApi = { current: null };
  const onState = (state: EditorState) => {
    api.current = state;
  };

  function Seeder() {
    const { setSections } = useEditorState();
    React.useEffect(() => {
      setSections(seed);
    }, [seed, setSections]);
    return null;
  }

  render(
    <NextIntlClientProvider locale="fr" messages={frMessages}>
      <EditorStateProvider>
        <Seeder />
        <HistoryProbe onState={onState} />
        {extra}
      </EditorStateProvider>
    </NextIntlClientProvider>,
  );

  return api;
}

function CanvasHost() {
  const { sections } = useEditorState();
  return (
    <EditorCanvas
      sections={sections}
      onSectionsChange={vi.fn()}
      webtoonId="w1"
    />
  );
}

function LayersHost() {
  const { sections, selectedSectionId, setSelectedSectionId } = useEditorState();
  return (
    <SectionLayersPanel
      sections={sections}
      selectedId={selectedSectionId}
      onSelect={setSelectedSectionId}
      onSectionsChange={vi.fn()}
    />
  );
}

function sectionIds(api: HistoryApi): string[] {
  return api.current!.sections.map((section) => section.id);
}

describe("EditorStateProvider — section history", () => {
  test("hydration through setSections creates neither history nor dirty state", () => {
    const api = renderWithHistory([makeSection("s0", 1)]);

    expect(sectionIds(api)).toEqual(["s0"]);
    expect(api.current!.canUndo).toBe(false);
    expect(api.current!.canRedo).toBe(false);
    expect(api.current!.isDirty).toBe(false);
  });

  test("commitSections snapshots sections and undo/redo traverse them", () => {
    const api = renderWithHistory([makeSection("s0", 1)]);

    act(() => api.current!.commitSections([makeSection("s1", 1)]));
    expect(sectionIds(api)).toEqual(["s1"]);
    expect(api.current!.canUndo).toBe(true);
    expect(api.current!.canRedo).toBe(false);
    expect(api.current!.isDirty).toBe(true);

    act(() => api.current!.commitSections([makeSection("s2", 1)]));

    act(() => api.current!.undo());
    expect(sectionIds(api)).toEqual(["s1"]);
    expect(api.current!.canUndo).toBe(true);
    expect(api.current!.canRedo).toBe(true);
    expect(api.current!.isDirty).toBe(true);

    act(() => api.current!.undo());
    expect(sectionIds(api)).toEqual(["s0"]);
    expect(api.current!.canUndo).toBe(false);

    act(() => api.current!.redo());
    expect(sectionIds(api)).toEqual(["s1"]);

    act(() => api.current!.redo());
    expect(sectionIds(api)).toEqual(["s2"]);
    expect(api.current!.canRedo).toBe(false);
    expect(api.current!.isDirty).toBe(true);
  });

  test("a fresh commit discards the redo branch", () => {
    const api = renderWithHistory([makeSection("s0", 1)]);

    act(() => api.current!.commitSections([makeSection("s1", 1)]));
    act(() => api.current!.undo());
    expect(api.current!.canRedo).toBe(true);

    act(() => api.current!.commitSections([makeSection("s2", 1)]));
    expect(api.current!.canRedo).toBe(false);
    expect(sectionIds(api)).toEqual(["s2"]);
  });

  test("history is bounded to 50 snapshots", () => {
    const api = renderWithHistory([makeSection("s0", 1)]);

    for (let index = 1; index <= 55; index += 1) {
      act(() => api.current!.commitSections([makeSection(`s${index}`, 1)]));
    }

    let undone = 0;
    while (api.current!.canUndo && undone < 60) {
      act(() => api.current!.undo());
      undone += 1;
    }

    expect(undone).toBe(50);
    // s0..s54 fall out of the window: the oldest reachable snapshot is s5.
    expect(sectionIds(api)).toEqual(["s5"]);
  });

  test("the server remap through setSections clears history", () => {
    const api = renderWithHistory([makeSection("temp-1", 1)]);

    act(() =>
      api.current!.commitSections([
        makeSection("temp-1", 1),
        makeSection("temp-2", 2),
      ]),
    );
    expect(api.current!.canUndo).toBe(true);

    // Successful save → canonical ids replace the client UUIDs.
    act(() =>
      api.current!.setSections([
        makeSection("server-1", 1),
        makeSection("server-2", 2),
      ]),
    );
    expect(sectionIds(api)).toEqual(["server-1", "server-2"]);

    // Les instantanés antérieurs référencent des ids temporaires : annuler
    // recréerait des sections dupliquées, l'historique doit être vidé.
    expect(api.current!.canUndo).toBe(false);
    expect(api.current!.canRedo).toBe(false);
    act(() => api.current!.undo());
    expect(sectionIds(api)).toEqual(["server-1", "server-2"]);
  });

  test("undo and redo keep isDirty true", () => {
    const api = renderWithHistory([makeSection("s0", 1)]);

    act(() => api.current!.commitSections([makeSection("s1", 1)]));
    act(() => api.current!.setIsDirty(false));
    expect(api.current!.isDirty).toBe(false);

    act(() => api.current!.undo());
    expect(api.current!.isDirty).toBe(true);

    act(() => api.current!.setIsDirty(false));
    act(() => api.current!.redo());
    expect(api.current!.isDirty).toBe(true);
  });
});

describe("duplicateSection", () => {
  test("clones type/config into a new id but strips storage-backed media", () => {
    const source = makeSection("src", 2, "animation");
    const copy = duplicateSection(source);

    expect(copy.id).not.toBe(source.id);
    expect(copy.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(copy.position).toBe(3);
    expect(copy.type).toBe("animation");
    expect(copy.config.type).toBe("animation");
    if (copy.config.type === "animation") {
      expect(copy.config.spritePath).toBe("");
    }
    expect(copy.images).toEqual([]);
    expect(copy.audioPath).toBeUndefined();

    const imageCopy = duplicateSection(makeSection("img", 1));
    expect(imageCopy.config.type).toBe("image");
    if (imageCopy.config.type === "image") {
      expect(imageCopy.config.imagePath).toBe("");
      expect(imageCopy.config.fxPath).toBeUndefined();
      expect(imageCopy.config.audioPath).toBeUndefined();
      expect(imageCopy.config.width).toBe(0);
      expect(imageCopy.config.height).toBe(0);
    }
  });

  test("insertDuplicateSection places the copy right after its source and renumbers", () => {
    const sections = [
      makeSection("a", 1),
      makeSection("b", 2),
      makeSection("c", 3),
    ];

    const { sections: next, duplicated } = insertDuplicateSection(sections, "b");

    expect(duplicated).not.toBeNull();
    expect(next.map((section) => section.id)).toEqual([
      "a",
      "b",
      duplicated!.id,
      "c",
    ]);
    expect(next.map((section) => section.position)).toEqual([1, 2, 3, 4]);
  });

  test("canvas duplicate action inserts after the source, selects the copy and marks dirty", () => {
    const api = renderWithHistory(
      [makeSection("a", 1), makeSection("b", 2), makeSection("c", 3)],
      <CanvasHost />,
    );

    fireEvent.click(
      within(screen.getByTestId("editor-section-b")).getByRole("button", {
        name: "Dupliquer la section",
      }),
    );

    const ids = sectionIds(api);
    expect(ids).toHaveLength(4);
    expect(ids[0]).toBe("a");
    expect(ids[1]).toBe("b");
    expect(ids[3]).toBe("c");
    expect(ids[2]).not.toBe("b");
    expect(api.current!.selectedSectionId).toBe(ids[2]);
    expect(api.current!.isDirty).toBe(true);
    expect(api.current!.canUndo).toBe(true);

    const duplicated = api.current!.sections[2];
    expect(duplicated.images).toEqual([]);
    if (duplicated.config.type === "image") {
      expect(duplicated.config.imagePath).toBe("");
      expect(duplicated.config.fxPath).toBeUndefined();
    }
  });

  test("layers panel duplicate action inserts and selects the copy", () => {
    const api = renderWithHistory(
      [makeSection("a", 1), makeSection("b", 2), makeSection("c", 3)],
      <LayersHost />,
    );

    fireEvent.click(
      within(screen.getByTestId("layer-section-b")).getByRole("button", {
        name: "Dupliquer la section",
      }),
    );

    const ids = sectionIds(api);
    expect(ids).toHaveLength(4);
    expect(ids[0]).toBe("a");
    expect(ids[1]).toBe("b");
    expect(ids[3]).toBe("c");
    expect(ids[2]).not.toBe("b");
    expect(api.current!.selectedSectionId).toBe(ids[2]);
    expect(api.current!.isDirty).toBe(true);
  });
});

describe("editor history keyboard shortcuts", () => {
  test("Ctrl/Cmd+Z undoes and Ctrl/Cmd+Shift+Z or Ctrl+Y redoes", () => {
    const api = renderWithHistory([makeSection("s0", 1)]);
    act(() => api.current!.commitSections([makeSection("s1", 1)]));

    fireEvent.keyDown(window, { key: "z", ctrlKey: true });
    expect(sectionIds(api)).toEqual(["s0"]);

    fireEvent.keyDown(window, { key: "z", ctrlKey: true, shiftKey: true });
    expect(sectionIds(api)).toEqual(["s1"]);

    fireEvent.keyDown(window, { key: "z", ctrlKey: true });
    fireEvent.keyDown(window, { key: "y", ctrlKey: true });
    expect(sectionIds(api)).toEqual(["s1"]);

    fireEvent.keyDown(window, { key: "z", metaKey: true });
    expect(sectionIds(api)).toEqual(["s0"]);
  });

  test("shortcuts are ignored inside inputs, textareas and contentEditable", () => {
    const api = renderWithHistory(
      [makeSection("s0", 1)],
      <>
        <input data-testid="text-input" />
        <textarea data-testid="text-area" />
        <div
          data-testid="editable"
          contentEditable
          suppressContentEditableWarning
        />
      </>,
    );
    act(() => api.current!.commitSections([makeSection("s1", 1)]));

    for (const testId of ["text-input", "text-area", "editable"]) {
      fireEvent.keyDown(screen.getByTestId(testId), {
        key: "z",
        ctrlKey: true,
      });
      expect(sectionIds(api)).toEqual(["s1"]);
      expect(api.current!.canUndo).toBe(true);
    }

    fireEvent.keyDown(document.body, { key: "z", ctrlKey: true });
    expect(sectionIds(api)).toEqual(["s0"]);
  });
});
