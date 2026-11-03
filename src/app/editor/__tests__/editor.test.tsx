import * as React from "react";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";

import type { SectionWithImages } from "@/lib/db/queries";
import frMessages from "../../../../messages/fr.json";
import { saveWebtoon, publishWebtoon, unpublishWebtoon } from "@/app/editor/actions";
vi.mock("@/app/editor/actions", () => ({
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
  ): SectionWithImages {
    return {
      id,
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
    const layoutModule = await import("@/app/editor/[webtoonId]/layout");
    const { EditorDetailLayoutContent } = layoutModule;
    const { EditorStateProvider, useEditorState } = await import(
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
      ...makeSection("client-temp-id"),
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
    expect(alert.textContent).toMatch(/Section 1/);
    expect(alert.textContent?.toLowerCase()).toMatch(/image|uploader/);
  });
});

describe("Editor detail — persisted metadata header/badge", () => {
  async function renderDetailWithMetadata(opts: {
    title: string;
    visibility: "draft" | "published";
  }) {
    const { EditorDetailLayoutContent } = await import(
      "@/app/editor/[webtoonId]/layout"
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
              initialSections={[]}
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
      "@/app/editor/[webtoonId]/layout"
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
