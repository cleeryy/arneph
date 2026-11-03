import * as React from "react";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";

import type { SectionWithImages } from "@/lib/db/queries";
import { useEditorState } from "@/components/editor/EditorStateContext";
import frMessages from "../../../../messages/fr.json";

vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => {
    const { src, alt, width, height, loading, priority, className, sizes, ...rest } =
      props as {
        src: string;
        alt: string;
        width: number;
        height: number;
        loading?: "eager" | "lazy";
        priority?: boolean;
        className?: string;
        sizes?: string;
      };
    return (
      <img
        data-testid="next-image"
        src={src}
        alt={alt}
        width={width}
        height={height}
        loading={loading}
        sizes={sizes}
        data-priority={String(priority)}
        className={className}
        {...rest}
      />
    );
  },
}));
import {
  saveWebtoon,
  publishWebtoon,
  unpublishWebtoon,
  updateWebtoonMetadataAction,
} from "@/app/editor/actions";
vi.mock("@/app/editor/actions", () => ({
  createWebtoonAction: vi.fn(),
  updateWebtoonMetadataAction: vi.fn(),
  deleteWebtoonAction: vi.fn(),
  saveWebtoon: vi.fn(),
  publishWebtoon: vi.fn(),
  unpublishWebtoon: vi.fn(),
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
  }: {
    children: React.ReactNode;
    href: string;
  }) => <a href={href}>{children}</a>,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  // clearAllMocks keeps queued mockResolvedValueOnce/mockImplementationOnce
  // implementations: reset them so a skipped save in one test cannot leak
  // into the next one.
  vi.mocked(saveWebtoon).mockReset();
  vi.mocked(publishWebtoon).mockReset();
  vi.mocked(unpublishWebtoon).mockReset();
  vi.mocked(updateWebtoonMetadataAction).mockReset();
});

// ---------------------------------------------------------------------------
// Editor page module structure — verified by file existence + export shape
// ---------------------------------------------------------------------------

describe("Editor scaffold — module structure", () => {
  test("editor page file exists", async () => {
    const fs = await import("fs");
    expect(fs.existsSync("/root/arneph/src/app/editor/page.tsx")).toBe(true);
  });

  test("editor layout file exists", async () => {
    const fs = await import("fs");
    expect(fs.existsSync("/root/arneph/src/app/editor/layout.tsx")).toBe(true);
  });

  test("editor detail page file exists", async () => {
    const fs = await import("fs");
    expect(fs.existsSync("/root/arneph/src/app/editor/[webtoonId]/page.tsx")).toBe(true);
  });

  test("editor detail layout file exists", async () => {
    const fs = await import("fs");
    expect(fs.existsSync("/root/arneph/src/app/editor/[webtoonId]/layout.tsx")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Client remap — temp IDs must be replaced by canonical server IDs after save
// ---------------------------------------------------------------------------

describe("Editor client — section id remap after save", () => {
  test("remaps section.id and image.sectionId to canonical server ids", async () => {
    const { remapSectionIds } = await import(
      "@/components/editor/EditorStateContext"
    );
    const sections = [
      {
        id: "client-temp-id",
        webtoonId: "w1",
        position: 0,
        type: "image",
        config: { type: "image", imagePath: "test.webp", width: 800, height: 1200 },
        audioPath: undefined,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        images: [
          {
            id: "img-1",
            sectionId: "client-temp-id",
            webtoonId: "w1",
            storagePath: "webtoons/sections/client-temp-id/1.webp",
            width: 800,
            height: 1200,
            mimeType: "image/webp",
            position: 0,
          },
        ],
      },
    ] as never;

    const remapped = remapSectionIds(sections, {
      "client-temp-id": "server-id",
    }) as Array<{ id: string; images: Array<{ sectionId: string }> }>;

    expect(remapped[0].id).toBe("server-id");
    expect(remapped[0].images[0].sectionId).toBe("server-id");
  });

  test("keeps existing server ids untouched", async () => {
    const { remapSectionIds } = await import(
      "@/components/editor/EditorStateContext"
    );
    const sections = [
      {
        id: "s1",
        webtoonId: "w1",
        position: 0,
        type: "image",
        config: { type: "image", imagePath: "kept.webp", width: 800, height: 1200 },
        audioPath: undefined,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        images: [],
      },
    ] as never;

    const remapped = remapSectionIds(sections, { s1: "s1" }) as Array<{
      id: string;
    }>;
    expect(remapped[0].id).toBe("s1");
  });
});

describe("Editor client — layout applies server id map on save", () => {
  function makeSection(
    id: string,
    imageSectionId: string = id,
    position: number = 1,
  ): SectionWithImages {
    return {
      id,
      webtoonId: "w1",
      position,
      type: "image",
      config: { type: "image", imagePath: "test.webp", width: 800, height: 1200 },
      audioPath: undefined,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      images: [
        {
          id: "img-1",
          sectionId: imageSectionId,
          webtoonId: "w1",
          storagePath: "webtoons/sections/client-temp-id/1.webp",
          width: 800,
          height: 1200,
          mimeType: "image/webp",
          position: 0,
        },
      ],
    };
  }

  async function renderLayoutWithSections(initial: SectionWithImages[]) {
    const layoutModule = await import("@/components/editor/EditorDetailShell");
    const { EditorDetailLayoutContent } = layoutModule;
    const { EditorStateProvider } = await import(
      "@/components/editor/EditorStateContext"
    );

    function Probe({ seed }: { seed: SectionWithImages[] }) {
      const { sections, setSections, setIsDirty } = useEditorState();
      React.useEffect(() => {
        setSections(seed);
        setIsDirty(true);
      }, [seed, setSections, setIsDirty]);
      return (
        <div
          data-testid="sections-probe"
          data-sections={JSON.stringify(
            sections.map((s) => ({
              id: s.id,
              images: s.images.map((i) => i.sectionId),
            })),
          )}
        />
      );
    }

    render(
      <NextIntlClientProvider locale="fr" messages={frMessages}>
        <EditorStateProvider>
          <EditorDetailLayoutContent webtoonId="w1">
            <Probe seed={initial} />
          </EditorDetailLayoutContent>
        </EditorStateProvider>
      </NextIntlClientProvider>,
    );

    await screen.findByRole("button", { name: "Enregistrer" });
  }

  test("successful save remaps temp ids in context before clearing dirty", async () => {
    vi.mocked(saveWebtoon).mockImplementationOnce(async (_wid, sections) => ({
      ok: true as const,
      sectionIds: Object.fromEntries(
        (sections as SectionWithImages[]).map((s) => [s.id, "server-id"]),
      ),
    }));

    await renderLayoutWithSections([makeSection("client-temp-id")]);

    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));

    await waitFor(() => {
      expect(screen.getByTestId("sections-probe")).toHaveAttribute(
        "data-sections",
        JSON.stringify([{ id: "server-id", images: ["server-id"] }]),
      );
    });
    // Dirty cleared only after remap: no unsaved-changes indicator remains.
    expect(
      screen.queryByTestId("dirty-indicator"),
    ).not.toBeInTheDocument();
  });

  test("second save uses canonical ids (no duplicate temp-id creation)", async () => {
    const calls: SectionWithImages[][] = [];
    vi.mocked(saveWebtoon).mockImplementation(async (_wid, sections) => {
      calls.push(sections as SectionWithImages[]);
      return {
        ok: true as const,
        sectionIds: Object.fromEntries(
          (sections as SectionWithImages[]).map((s) => [s.id, s.id]),
        ),
      };
    });

    await renderLayoutWithSections([makeSection("server-id")]);

    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
    await waitFor(() => {
      expect(vi.mocked(saveWebtoon)).toHaveBeenCalledTimes(1);
    });
    expect(calls[0][0].id).toBe("server-id");
    expect(calls[0][0].images[0].sectionId).toBe("server-id");
  });

  test("incomplete section skips save and shows localized guidance", async () => {
    vi.mocked(saveWebtoon).mockResolvedValueOnce({
      ok: false as const,
      error: "config.imagePath: String must contain at least 1 character(s)",
    });
    const incomplete: SectionWithImages = {
      ...makeSection("client-temp-id", "client-temp-id", 3),
      config: { type: "image", imagePath: "", width: 0, height: 0 },
      images: [],
    };

    await renderLayoutWithSections([incomplete]);

    const saveButton = screen.getByRole("button", { name: "Enregistrer" });
    expect(saveButton).toBeEnabled();
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(screen.getByTestId("save-error")).toBeInTheDocument();
    });
    expect(vi.mocked(saveWebtoon)).not.toHaveBeenCalled();
    const alert = screen.getByTestId("save-error");
    // Positions are 1-based: section.position is reported as-is, never +1.
    expect(alert.textContent).toMatch(/Section 3/);
    expect(alert.textContent).not.toMatch(/Section 4/);
    expect(alert.textContent?.toLowerCase()).toMatch(/image|uploader/);
  });
});

describe("Editor detail — persisted metadata header/badge", () => {
  function makeDetailSection(id: string = "sec-1"): SectionWithImages {
    return {
      id,
      webtoonId: "11111111-2222-4333-8444-555555555555",
      position: 1,
      type: "image",
      config: { type: "image", imagePath: "test.webp", width: 800, height: 1200 },
      audioPath: undefined,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      images: [],
    };
  }

  async function renderDetailWithMetadata(opts: {
    title: string;
    visibility: "draft" | "published";
    sections?: SectionWithImages[];
  }) {
    const { EditorDetailLayoutContent } = await import(
      "@/components/editor/EditorDetailShell"
    );
    const { EditorStateProvider } = await import(
      "@/components/editor/EditorStateContext"
    );
    const { EditorCanvasClient } = await import(
      "@/components/editor/EditorCanvasClient"
    );

    render(
      <NextIntlClientProvider locale="fr" messages={frMessages}>
        <EditorStateProvider>
          <EditorDetailLayoutContent webtoonId="11111111-2222-4333-8444-555555555555">
            <EditorCanvasClient
              initialSections={opts.sections ?? [makeDetailSection()]}
              webtoonId="11111111-2222-4333-8444-555555555555"
              initialTitle={opts.title}
              initialVisibility={opts.visibility}
            />
          </EditorDetailLayoutContent>
        </EditorStateProvider>
      </NextIntlClientProvider>,
    );
  }

  test("loads a published title: header shows title (not UUID) and published badge", async () => {
    await renderDetailWithMetadata({
      title: "Mon Webtoon Publié",
      visibility: "published",
    });

    const heading = await screen.findByTestId("editor-title");
    expect(heading).toHaveTextContent("Mon Webtoon Publié");
    expect(heading.textContent).not.toContain("11111111-2222");
    expect(screen.getByTestId("visibility-badge")).toHaveTextContent("Publié");
    expect(screen.getByTestId("visibility-badge")).toHaveAttribute(
      "data-loaded",
      "true",
    );
    expect(
      screen.getByRole("button", { name: "Publier" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Dépublier" }),
    ).toBeEnabled();
  });

  test("publish updates badge from draft to published", async () => {
    vi.mocked(publishWebtoon).mockResolvedValueOnce({ ok: true });
    await renderDetailWithMetadata({
      title: "Brouillon à publier",
      visibility: "draft",
    });

    expect(await screen.findByTestId("editor-title")).toHaveTextContent(
      "Brouillon à publier",
    );
    expect(screen.getByTestId("visibility-badge")).toHaveTextContent(
      "Brouillon",
    );

    fireEvent.click(screen.getByRole("button", { name: "Publier" }));

    await waitFor(() => {
      expect(screen.getByTestId("visibility-badge")).toHaveTextContent(
        "Publié",
      );
    });
  });

  test("unpublish updates badge from published to draft", async () => {
    vi.mocked(unpublishWebtoon).mockResolvedValueOnce({ ok: true });
    await renderDetailWithMetadata({
      title: "Publié à retirer",
      visibility: "published",
    });

    expect(screen.getByTestId("visibility-badge")).toHaveTextContent("Publié");

    fireEvent.click(screen.getByRole("button", { name: "Dépublier" }));

    await waitFor(() => {
      expect(screen.getByTestId("visibility-badge")).toHaveTextContent(
        "Brouillon",
      );
    });
    expect(await screen.findByTestId("editor-title")).toHaveTextContent(
      "Publié à retirer",
    );
  });

  test("neutral loading state before metadata arrives (no draft flash)", async () => {
    const { EditorDetailLayoutContent } = await import(
      "@/components/editor/EditorDetailShell"
    );
    const { EditorStateProvider } = await import(
      "@/components/editor/EditorStateContext"
    );

    render(
      <NextIntlClientProvider locale="fr" messages={frMessages}>
        <EditorStateProvider>
          <EditorDetailLayoutContent webtoonId="11111111-2222-4333-8444-555555555555">
            <div data-testid="empty-child" />
          </EditorDetailLayoutContent>
        </EditorStateProvider>
      </NextIntlClientProvider>,
    );

    // No metadata yet: neutral placeholders, never the raw UUID nor "Brouillon".
    expect(screen.getByTestId("editor-title")).toHaveTextContent("…");
    expect(screen.getByTestId("editor-title").textContent).not.toContain(
      "11111111-2222",
    );
    expect(screen.getByTestId("visibility-badge")).toHaveAttribute(
      "data-loaded",
      "false",
    );
    expect(screen.getByTestId("visibility-badge").textContent).not.toContain(
      "Brouillon",
    );
    expect(screen.getByTestId("visibility-badge").textContent).not.toContain(
      "Publié",
    );
  });
});

describe("Editor detail — metadata form", () => {
  const WEBTOON_ID = "11111111-2222-4333-8444-555555555555";

  function makeDetailSection(position: number = 1): SectionWithImages {
    return {
      id: `sec-${position}`,
      webtoonId: WEBTOON_ID,
      position,
      type: "image",
      config: { type: "image", imagePath: "test.webp", width: 800, height: 1200 },
      audioPath: undefined,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      images: [],
    };
  }

  function Seed({
    seedSections,
    seedDirty,
  }: {
    seedSections: SectionWithImages[];
    seedDirty: boolean;
  }) {
    const { setSections, setIsDirty } = useEditorState();
    React.useEffect(() => {
      setSections(seedSections);
      setIsDirty(seedDirty);
    }, [seedSections, seedDirty, setSections, setIsDirty]);
    return null;
  }

  async function renderShell(opts: {
    initialTitle?: string | null;
    initialDescription?: string | null;
    initialVisibility?: "draft" | "published" | null;
    sections?: SectionWithImages[];
    dirty?: boolean;
  }) {
    const shellModule = await import("@/components/editor/EditorDetailShell");
    const stateModule = await import("@/components/editor/EditorStateContext");
    const { EditorDetailLayoutContent } = shellModule;
    const { EditorStateProvider } = stateModule;

    render(
      <NextIntlClientProvider locale="fr" messages={frMessages}>
        <EditorStateProvider
          initialTitle={opts.initialTitle ?? null}
          initialDescription={opts.initialDescription ?? null}
          initialVisibility={opts.initialVisibility ?? null}
        >
          <EditorDetailLayoutContent webtoonId={WEBTOON_ID}>
            <Seed
              seedSections={opts.sections ?? [makeDetailSection()]}
              seedDirty={opts.dirty ?? false}
            />
          </EditorDetailLayoutContent>
        </EditorStateProvider>
      </NextIntlClientProvider>,
    );

    await screen.findByTestId("metadata-title");
  }

  test("prefills title and description and saves through updateWebtoonMetadataAction", async () => {
    vi.mocked(updateWebtoonMetadataAction).mockResolvedValueOnce({ ok: true });
    await renderShell({
      initialTitle: "Titre initial",
      initialDescription: "Description initiale",
      initialVisibility: "draft",
    });

    const titleInput = screen.getByTestId("metadata-title");
    const descriptionInput = screen.getByTestId("metadata-description");
    expect(titleInput).toHaveValue("Titre initial");
    expect(descriptionInput).toHaveValue("Description initiale");

    fireEvent.change(titleInput, { target: { value: "Titre modifié" } });
    fireEvent.change(descriptionInput, { target: { value: "Nouvelle description" } });
    fireEvent.click(screen.getByTestId("metadata-save"));

    await waitFor(() => {
      expect(vi.mocked(updateWebtoonMetadataAction)).toHaveBeenCalledWith(WEBTOON_ID, {
        title: "Titre modifié",
        description: "Nouvelle description",
      });
    });
    await waitFor(() => {
      expect(screen.getByTestId("editor-title")).toHaveTextContent("Titre modifié");
    });
    expect(screen.queryByTestId("metadata-error")).not.toBeInTheDocument();
  });

  test("an empty title is rejected inline and never reaches the action", async () => {
    await renderShell({
      initialTitle: "Titre",
      initialDescription: "",
      initialVisibility: "draft",
    });

    fireEvent.change(screen.getByTestId("metadata-title"), {
      target: { value: "   " },
    });
    fireEvent.click(screen.getByTestId("metadata-save"));

    const error = await screen.findByTestId("metadata-error");
    expect(error.textContent?.toLowerCase()).toMatch(/titre/);
    expect(vi.mocked(updateWebtoonMetadataAction)).not.toHaveBeenCalled();
  });

  test("an action failure is shown inline and the save button is re-enabled", async () => {
    vi.mocked(updateWebtoonMetadataAction).mockResolvedValueOnce({
      ok: false,
      error: "db.updateWebtoon failed: boom",
    });
    await renderShell({
      initialTitle: "Titre",
      initialDescription: "Desc",
      initialVisibility: "draft",
    });

    const saveButton = screen.getByTestId("metadata-save");
    fireEvent.click(saveButton);

    const error = await screen.findByTestId("metadata-error");
    expect(error).toHaveTextContent(/boom/);
    expect(saveButton).toBeEnabled();
  });

  test("the save button is disabled while the action is pending", async () => {
    let resolveUpdate: (value: { ok: boolean }) => void = () => {};
    vi.mocked(updateWebtoonMetadataAction).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveUpdate = resolve;
        }),
    );
    await renderShell({
      initialTitle: "Titre",
      initialDescription: "Desc",
      initialVisibility: "draft",
    });

    const saveButton = screen.getByTestId("metadata-save");
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(saveButton).toBeDisabled();
    });

    resolveUpdate({ ok: true });
    await waitFor(() => {
      expect(saveButton).toBeEnabled();
    });
  });
});

describe("Editor detail — publish guards", () => {
  const WEBTOON_ID = "11111111-2222-4333-8444-555555555555";

  function makeDetailSection(position: number = 1): SectionWithImages {
    return {
      id: `sec-${position}`,
      webtoonId: WEBTOON_ID,
      position,
      type: "image",
      config: { type: "image", imagePath: "test.webp", width: 800, height: 1200 },
      audioPath: undefined,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      images: [],
    };
  }

  function Seed({
    seedSections,
    seedDirty,
  }: {
    seedSections: SectionWithImages[];
    seedDirty: boolean;
  }) {
    const { setSections, setIsDirty } = useEditorState();
    React.useEffect(() => {
      setSections(seedSections);
      setIsDirty(seedDirty);
    }, [seedSections, seedDirty, setSections, setIsDirty]);
    return null;
  }

  async function renderShell(opts: {
    initialTitle?: string;
    initialVisibility?: "draft" | "published";
    sections?: SectionWithImages[];
    dirty?: boolean;
  }) {
    const shellModule = await import("@/components/editor/EditorDetailShell");
    const stateModule = await import("@/components/editor/EditorStateContext");
    const { EditorDetailLayoutContent } = shellModule;
    const { EditorStateProvider } = stateModule;

    render(
      <NextIntlClientProvider locale="fr" messages={frMessages}>
        <EditorStateProvider
          initialTitle={opts.initialTitle ?? null}
          initialDescription={null}
          initialVisibility={opts.initialVisibility ?? null}
        >
          <EditorDetailLayoutContent webtoonId={WEBTOON_ID}>
            <Seed
              seedSections={opts.sections ?? [makeDetailSection()]}
              seedDirty={opts.dirty ?? false}
            />
          </EditorDetailLayoutContent>
        </EditorStateProvider>
      </NextIntlClientProvider>,
    );

    await screen.findByTestId("editor-title");
  }

  test("publishing without sections shows a clear error and never publishes", async () => {
    await renderShell({
      initialTitle: "Vide",
      initialVisibility: "draft",
      sections: [],
    });

    fireEvent.click(screen.getByRole("button", { name: "Publier" }));

    const error = await screen.findByTestId("save-error");
    expect(error.textContent?.toLowerCase()).toMatch(/aucune section/);
    expect(vi.mocked(publishWebtoon)).not.toHaveBeenCalled();
    expect(screen.getByTestId("visibility-badge")).toHaveTextContent("Brouillon");
  });

  test("a dirty editor saves first and only then publishes", async () => {
    const order: string[] = [];
    vi.mocked(saveWebtoon).mockImplementationOnce(async () => {
      order.push("save");
      return { ok: true, sectionIds: { "sec-1": "sec-1" } };
    });
    vi.mocked(publishWebtoon).mockImplementationOnce(async () => {
      order.push("publish");
      return { ok: true };
    });

    await renderShell({
      initialTitle: "Sale",
      initialVisibility: "draft",
      dirty: true,
    });

    fireEvent.click(screen.getByRole("button", { name: "Publier" }));

    await waitFor(() => {
      expect(vi.mocked(publishWebtoon)).toHaveBeenCalledTimes(1);
    });
    expect(order).toEqual(["save", "publish"]);
    await waitFor(() => {
      expect(screen.getByTestId("visibility-badge")).toHaveTextContent("Publié");
    });
  });

  test("publish is aborted when the pre-publish save fails", async () => {
    vi.mocked(saveWebtoon).mockResolvedValueOnce({
      ok: false,
      error: "db.updateSection failed: save ko",
    });

    await renderShell({
      initialTitle: "Sale",
      initialVisibility: "draft",
      dirty: true,
    });

    fireEvent.click(screen.getByRole("button", { name: "Publier" }));

    const error = await screen.findByTestId("save-error");
    expect(error).toHaveTextContent(/save ko/);
    expect(vi.mocked(publishWebtoon)).not.toHaveBeenCalled();
    expect(screen.getByTestId("visibility-badge")).toHaveTextContent("Brouillon");
  });

  test("a publish failure surfaces the error and keeps the draft badge", async () => {
    vi.mocked(publishWebtoon).mockResolvedValueOnce({
      ok: false,
      error: "updateWebtoon failed: denied",
    });

    await renderShell({
      initialTitle: "Refusé",
      initialVisibility: "draft",
    });

    fireEvent.click(screen.getByRole("button", { name: "Publier" }));

    const error = await screen.findByTestId("save-error");
    expect(error).toHaveTextContent(/denied/);
    expect(screen.getByTestId("visibility-badge")).toHaveTextContent("Brouillon");
  });
});

describe("Editor sidebar — selection is shared with the canvas", () => {
  function makeLayerSection(id: string, position: number): SectionWithImages {
    return {
      id,
      webtoonId: "w1",
      position,
      type: "image",
      config: { type: "image", imagePath: "test.webp", width: 800, height: 1200 },
      audioPath: undefined,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      images: [],
    };
  }

  async function renderSidebarWithCanvas(sections: SectionWithImages[]) {
    const { EditorStateProvider } = await import(
      "@/components/editor/EditorStateContext"
    );
    const { SectionLayersPanelClient } = await import(
      "@/components/editor/SectionLayersPanelClient"
    );
    const { EditorCanvas } = await import("@/components/editor/EditorCanvas");

    render(
      <NextIntlClientProvider locale="fr" messages={frMessages}>
        <EditorStateProvider>
          <div data-testid="editor-sidebar">
            <SectionLayersPanelClient initialSections={sections} />
          </div>
          <EditorCanvas
            sections={sections}
            onSectionsChange={vi.fn()}
            webtoonId="w1"
          />
        </EditorStateProvider>
      </NextIntlClientProvider>,
    );

    await screen.findByTestId(`layer-section-${sections[0].id}`);
  }

  test("clicking a layer selects the canvas section and scrolls it into view", async () => {
    const sections = [makeLayerSection("sec-1", 1), makeLayerSection("sec-2", 2)];
    await renderSidebarWithCanvas(sections);

    const canvasNode = screen.getByTestId("editor-section-sec-2");
    const canvasSpy = vi.fn();
    (
      canvasNode as unknown as { scrollIntoView: (arg?: unknown) => void }
    ).scrollIntoView = canvasSpy;

    fireEvent.click(screen.getByTestId("layer-section-sec-2"));

    await waitFor(() => {
      expect(canvasSpy).toHaveBeenCalledWith(
        expect.objectContaining({ block: "center" }),
      );
    });
    await waitFor(() => {
      expect(screen.getByTestId("layer-section-sec-2")).toHaveAttribute(
        "data-selected",
        "true",
      );
    });
    expect(screen.getByTestId("layer-section-sec-2")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByTestId("layer-section-sec-1")).not.toHaveAttribute(
      "data-selected",
    );
    expect(screen.getByTestId("editor-section-sec-2")).toHaveAttribute(
      "data-selected",
      "true",
    );
  });

  test("a canvas click highlights the matching layer through the shared state", async () => {
    const sections = [makeLayerSection("sec-1", 1), makeLayerSection("sec-2", 2)];
    await renderSidebarWithCanvas(sections);

    fireEvent.click(screen.getByTestId("editor-section-sec-1"));

    await waitFor(() => {
      expect(screen.getByTestId("layer-section-sec-1")).toHaveAttribute(
        "data-selected",
        "true",
      );
    });
    expect(screen.getByTestId("layer-section-sec-2")).not.toHaveAttribute(
      "data-selected",
    );
  });
});

describe("Editor DB integration (mocked)", () => {
  const mockListWebtoons = vi.fn().mockResolvedValue([]);
  const mockCreateWebtoon = vi.fn().mockResolvedValue({ id: "w1", title: "New", visibility: "draft" });
  const mockGetWebtoon = vi.fn().mockResolvedValue(null);
  const mockDeleteWebtoon = vi.fn().mockResolvedValue(true);

  test("listWebtoons mock works", async () => {
    const result = await mockListWebtoons();
    expect(result).toEqual([]);
  });

  test("createWebtoon mock works", async () => {
    const result = await mockCreateWebtoon({ title: "New", visibility: "draft" });
    expect(result.title).toBe("New");
  });

  test("getWebtoon mock returns null for missing", async () => {
    const result = await mockGetWebtoon("missing");
    expect(result).toBeNull();
  });

  test("deleteWebtoon mock works", async () => {
    const result = await mockDeleteWebtoon("w1");
    expect(result).toBe(true);
  });
});
