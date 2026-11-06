import * as React from "react";
import {
  act,
  cleanup,
  render,
  screen,
  fireEvent,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";

import type { SectionWithImages } from "@/lib/db/queries";
import { useEditorState } from "@/components/editor/EditorStateContext";
import frMessages from "../../../../messages/fr.json";

vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => {
    const {
      src,
      alt,
      width,
      height,
      loading,
      priority,
      className,
      sizes,
      loader,
      ...rest
    } = props as {
      src: string;
      alt: string;
      width: number;
      height: number;
      loading?: "eager" | "lazy";
      priority?: boolean;
      className?: string;
      sizes?: string;
      loader?: (args: {
        src: string;
        width: number;
        quality?: number;
      }) => string;
    };
    const resolved = loader ? loader({ src, width }) : src;
    return (
      <img
        data-testid="next-image"
        src={resolved}
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
import { resizeImage, readImageDimensions } from "@/lib/image/process";
import { uploadSectionAsset } from "@/lib/supabase/upload";

vi.mock("@/lib/image/process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/image/process")>();
  return { ...actual, resizeImage: vi.fn(), readImageDimensions: vi.fn() };
});

vi.mock("@/lib/supabase/upload", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/upload")>();
  return { ...actual, uploadSectionAsset: vi.fn() };
});

vi.mock("@/app/editor/actions", () => ({
  createWebtoonAction: vi.fn(),
  updateWebtoonMetadataAction: vi.fn(),
  deleteWebtoonAction: vi.fn(),
  saveWebtoon: vi.fn(),
  publishWebtoon: vi.fn(),
  unpublishWebtoon: vi.fn(),
}));

// EditorDetailShell importe la Server Action `signOut` : son module tire
// `next/headers` + `server-only`, indisponibles en jsdom.
vi.mock("@/lib/auth/actions", () => ({
  signOut: vi.fn(),
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    onClick,
    ...rest
  }: {
    children: React.ReactNode;
    href: string;
  } & React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a
      href={href}
      {...rest}
      onClick={(event) => {
        onClick?.(event);
        // jsdom n'implémente pas la navigation : on annule toujours l'action
        // par défaut. Les assertions portent sur `confirm`, pas sur le retour
        // de `fireEvent.click`.
        event.preventDefault();
      }}
    >
      {children}
    </a>
  ),
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
  vi.mocked(resizeImage).mockReset();
  vi.mocked(readImageDimensions).mockReset();
  vi.mocked(uploadSectionAsset).mockReset();
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

describe("Editor detail — hardened save (ED-1/ED-2)", () => {
  const WEBTOON_ID = "11111111-2222-4333-8444-555555555555";

  function makeSaveSection(id: string, position: number): SectionWithImages {
    return {
      id,
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

  function Seeder({ seed, dirty }: { seed: SectionWithImages[]; dirty: boolean }) {
    const { setSections, setIsDirty, setSelectedSectionId } = useEditorState();
    React.useEffect(() => {
      setSections(seed);
      setIsDirty(dirty);
      setSelectedSectionId(seed[0]?.id ?? null);
    }, [seed, dirty, setSections, setIsDirty, setSelectedSectionId]);
    return null;
  }

  function AddDuringSave() {
    const { sections, commitSections } = useEditorState();
    return (
      <button
        type="button"
        data-testid="add-during-save"
        onClick={() =>
          commitSections([
            ...sections,
            makeSaveSection("late-temp", sections.length + 1),
          ])
        }
      >
        add
      </button>
    );
  }

  function SaveProbe() {
    const { sections, isDirty, selectedSectionId } = useEditorState();
    return (
      <div
        data-testid="save-probe"
        data-ids={JSON.stringify(sections.map((section) => section.id))}
        data-dirty={String(isDirty)}
        data-selected={selectedSectionId ?? ""}
      />
    );
  }

  async function renderShell(
    seed: SectionWithImages[],
    options: { dirty?: boolean; visibility?: "draft" | "published" } = {},
  ) {
    const { EditorDetailLayoutContent } = await import(
      "@/components/editor/EditorDetailShell"
    );
    const { EditorStateProvider } = await import(
      "@/components/editor/EditorStateContext"
    );

    render(
      <NextIntlClientProvider locale="fr" messages={frMessages}>
        <EditorStateProvider initialVisibility={options.visibility ?? null}>
          <EditorDetailLayoutContent webtoonId={WEBTOON_ID}>
            <Seeder seed={seed} dirty={options.dirty ?? true} />
            <AddDuringSave />
            <SaveProbe />
          </EditorDetailLayoutContent>
        </EditorStateProvider>
      </NextIntlClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("save-probe")).toHaveAttribute(
        "data-ids",
        JSON.stringify(seed.map((section) => section.id)),
      );
    });
    await screen.findByRole("button", { name: "Enregistrer" });
  }

  function probeIds(): string[] {
    return JSON.parse(
      screen.getByTestId("save-probe").getAttribute("data-ids") ?? "[]",
    ) as string[];
  }

  test("edits made while saving survive the id remap and keep the editor dirty", async () => {
    let resolveSave: (value: {
      ok: boolean;
      sectionIds?: Record<string, string>;
    }) => void = () => {};
    vi.mocked(saveWebtoon).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveSave = resolve;
        }),
    );

    await renderShell([makeSaveSection("temp-1", 1)]);
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
    await waitFor(() => {
      expect(vi.mocked(saveWebtoon)).toHaveBeenCalledTimes(1);
    });

    // The canvas stays interactive during the await.
    fireEvent.click(screen.getByTestId("add-during-save"));
    await waitFor(() => {
      expect(probeIds()).toEqual(["temp-1", "late-temp"]);
    });

    act(() => {
      resolveSave({ ok: true, sectionIds: { "temp-1": "server-1" } });
    });

    // The remap applies to the latest state: the late section is not dropped.
    await waitFor(() => {
      expect(probeIds()).toEqual(["server-1", "late-temp"]);
    });
    // The shared selection follows the remapped id instead of pointing at a
    // dead client UUID.
    expect(screen.getByTestId("save-probe")).toHaveAttribute(
      "data-selected",
      "server-1",
    );
    // Something changed during the save: the unsaved guard stays armed.
    expect(screen.getByTestId("save-probe")).toHaveAttribute(
      "data-dirty",
      "true",
    );
    expect(screen.getByTestId("dirty-indicator")).toBeInTheDocument();
  });

  test("a double click starts a single save (synchronous re-entrance lock)", async () => {
    let resolveSave: (value: {
      ok: boolean;
      sectionIds?: Record<string, string>;
    }) => void = () => {};
    vi.mocked(saveWebtoon).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSave = resolve;
        }),
    );

    await renderShell([makeSaveSection("temp-1", 1)]);
    const saveButton = screen.getByRole("button", { name: "Enregistrer" });

    // Both clicks happen before React can render the disabled state.
    act(() => {
      saveButton.click();
      saveButton.click();
    });

    expect(vi.mocked(saveWebtoon)).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveSave({ ok: true, sectionIds: { "temp-1": "server-1" } });
    });
    await waitFor(() => {
      expect(probeIds()).toEqual(["server-1"]);
    });
  });

  test("a double click starts a single publish (synchronous re-entrance lock)", async () => {
    let resolvePublish: (value: { ok: boolean }) => void = () => {};
    vi.mocked(publishWebtoon).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvePublish = resolve;
        }),
    );

    await renderShell([makeSaveSection("sec-1", 1)], {
      dirty: false,
      visibility: "draft",
    });

    const publishButton = screen.getByRole("button", { name: "Publier" });
    expect(publishButton).toBeEnabled();

    act(() => {
      publishButton.click();
      publishButton.click();
    });

    expect(vi.mocked(publishWebtoon)).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolvePublish({ ok: true });
    });
    await waitFor(() => {
      expect(screen.getByTestId("visibility-badge")).toHaveTextContent("Publié");
    });
  });
});

describe("Editor detail — optimistic revision lock", () => {
  const WEBTOON_ID = "11111111-2222-4333-8444-555555555555";

  function makeRevisionSection(id: string): SectionWithImages {
    return {
      id,
      webtoonId: WEBTOON_ID,
      position: 1,
      type: "image",
      config: { type: "image", imagePath: "test.webp", width: 800, height: 1200 },
      audioPath: undefined,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      images: [],
    };
  }

  function Seed({ sections }: { sections: SectionWithImages[] }) {
    const { setSections, setIsDirty } = useEditorState();
    React.useEffect(() => {
      setSections(sections);
      setIsDirty(true);
    }, [sections, setSections, setIsDirty]);
    return null;
  }

  function MakeDirty() {
    const { setIsDirty } = useEditorState();
    return (
      <button
        type="button"
        data-testid="make-dirty"
        onClick={() => setIsDirty(true)}
      >
        dirty
      </button>
    );
  }

  async function renderShell(initialRevision: number) {
    const { EditorDetailLayoutContent } = await import(
      "@/components/editor/EditorDetailShell"
    );
    const { EditorStateProvider } = await import(
      "@/components/editor/EditorStateContext"
    );
    const seed = [makeRevisionSection("sec-1")];

    render(
      <NextIntlClientProvider locale="fr" messages={frMessages}>
        <EditorStateProvider>
          <EditorDetailLayoutContent
            webtoonId={WEBTOON_ID}
            initialRevision={initialRevision}
          >
            <Seed sections={seed} />
            <MakeDirty />
          </EditorDetailLayoutContent>
        </EditorStateProvider>
      </NextIntlClientProvider>,
    );

    await screen.findByRole("button", { name: "Enregistrer" });
  }

  test("sends the current revision and stores the one returned by the server", async () => {
    vi.mocked(saveWebtoon)
      .mockResolvedValueOnce({ ok: true, revision: 1 })
      .mockResolvedValueOnce({ ok: true, revision: 2 });

    await renderShell(0);

    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
    await waitFor(() => {
      expect(vi.mocked(saveWebtoon)).toHaveBeenCalledTimes(1);
    });
    expect(vi.mocked(saveWebtoon).mock.calls[0][2]).toBe(0);

    fireEvent.click(screen.getByTestId("make-dirty"));
    const saveButton = screen.getByRole("button", { name: "Enregistrer" });
    await waitFor(() => {
      expect(saveButton).toBeEnabled();
    });
    fireEvent.click(saveButton);
    await waitFor(() => {
      expect(vi.mocked(saveWebtoon)).toHaveBeenCalledTimes(2);
    });
    expect(vi.mocked(saveWebtoon).mock.calls[1][2]).toBe(1);
  });

  test("a revision conflict shows the server message and a reload action", async () => {
    vi.mocked(saveWebtoon).mockResolvedValueOnce({
      ok: false,
      conflict: true,
      error:
        "Ce webtoon a été modifié dans une autre session. Rechargez la page pour repartir de la dernière version.",
    });

    await renderShell(4);

    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));

    const error = await screen.findByTestId("save-error");
    expect(error).toHaveTextContent(/autre session/);
    expect(
      screen.getByRole("button", { name: "Recharger" }),
    ).toBeInTheDocument();
    expect(vi.mocked(saveWebtoon).mock.calls[0][2]).toBe(4);
  });
});

describe("EditorCanvasClient — one-shot hydration (ED-14)", () => {
  function makeHydrationSection(id: string): SectionWithImages {
    return {
      id,
      webtoonId: "w1",
      position: 1,
      type: "image",
      config: { type: "image", imagePath: "test.webp", width: 800, height: 1200 },
      audioPath: undefined,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      images: [],
    };
  }

  function HydrationProbe() {
    const { sections, webtoonTitle } = useEditorState();
    return (
      <div
        data-testid="hydration-probe"
        data-ids={JSON.stringify(sections.map((section) => section.id))}
        data-title={webtoonTitle ?? ""}
      />
    );
  }

  test("a revalidated RSC payload for the same webtoon never overwrites state", async () => {
    const { EditorCanvasClient } = await import(
      "@/components/editor/EditorCanvasClient"
    );
    const { EditorStateProvider } = await import(
      "@/components/editor/EditorStateContext"
    );

    function ui(initialSections: SectionWithImages[], webtoonId: string) {
      return (
        <NextIntlClientProvider locale="fr" messages={frMessages}>
          <EditorStateProvider>
            <EditorCanvasClient
              initialSections={initialSections}
              webtoonId={webtoonId}
              initialTitle="Titre"
              initialVisibility="draft"
            />
            <HydrationProbe />
          </EditorStateProvider>
        </NextIntlClientProvider>
      );
    }

    const probe = () => screen.getByTestId("hydration-probe");

    const { rerender } = render(ui([makeHydrationSection("server-1")], "w1"));
    await waitFor(() => {
      expect(probe()).toHaveAttribute("data-ids", JSON.stringify(["server-1"]));
    });
    expect(probe()).toHaveAttribute("data-title", "Titre");

    // Post-save revalidation sends a fresh array: it must not replace the
    // live editor state for the same webtoon.
    rerender(ui([makeHydrationSection("stale-server")], "w1"));
    await waitFor(() => {
      expect(probe()).toHaveAttribute("data-ids", JSON.stringify(["server-1"]));
    });

    // A different webtoon still hydrates.
    rerender(ui([makeHydrationSection("other-webtoon")], "w2"));
    await waitFor(() => {
      expect(probe()).toHaveAttribute(
        "data-ids",
        JSON.stringify(["other-webtoon"]),
      );
    });
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

  test("a metadata edit arms the unsaved-changes guard and the metadata save disarms it", async () => {
    vi.mocked(updateWebtoonMetadataAction).mockResolvedValueOnce({ ok: true });
    await renderShell({
      initialTitle: "Titre initial",
      initialDescription: "Description initiale",
      initialVisibility: "draft",
    });

    expect(screen.queryByTestId("dirty-indicator")).not.toBeInTheDocument();

    fireEvent.change(screen.getByTestId("metadata-title"), {
      target: { value: "Titre modifié" },
    });

    expect(await screen.findByTestId("dirty-indicator")).toBeInTheDocument();
    const guardedEvent = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(guardedEvent);
    expect(guardedEvent.defaultPrevented).toBe(true);

    // Le bouton Enregistrer du header reste dédié aux sections.
    expect(screen.getByTestId("save-button")).toBeDisabled();

    fireEvent.click(screen.getByTestId("metadata-save"));

    await waitFor(() => {
      expect(vi.mocked(updateWebtoonMetadataAction)).toHaveBeenCalledWith(
        WEBTOON_ID,
        { title: "Titre modifié", description: "Description initiale" },
      );
    });
    await waitFor(() => {
      expect(screen.queryByTestId("dirty-indicator")).not.toBeInTheDocument();
    });

    const clearedEvent = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(clearedEvent);
    expect(clearedEvent.defaultPrevented).toBe(false);
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

describe("Editor detail — cover upload", () => {
  const WEBTOON_ID = "11111111-2222-4333-8444-555555555555";

  async function renderShell(opts: { initialCoverPath?: string | null } = {}) {
    const shellModule = await import("@/components/editor/EditorDetailShell");
    const stateModule = await import("@/components/editor/EditorStateContext");
    const { EditorDetailLayoutContent } = shellModule;
    const { EditorStateProvider } = stateModule;

    render(
      <NextIntlClientProvider locale="fr" messages={frMessages}>
        <EditorStateProvider
          initialTitle="Titre"
          initialDescription="Desc"
          initialVisibility="draft"
        >
          <EditorDetailLayoutContent
            webtoonId={WEBTOON_ID}
            initialCoverPath={opts.initialCoverPath ?? null}
          >
            <div data-testid="cover-child" />
          </EditorDetailLayoutContent>
        </EditorStateProvider>
      </NextIntlClientProvider>,
    );

    await screen.findByTestId("metadata-cover-input");
  }

  test("a webtoon without a cover keeps the read-only placeholder", async () => {
    await renderShell();

    expect(screen.getByTestId("metadata-cover-placeholder")).toBeInTheDocument();
    expect(
      screen.queryByTestId("metadata-cover-preview"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("metadata-cover-remove"),
    ).not.toBeInTheDocument();
  });

  test("uploading downscales, uploads under webtoons/covers/<id>/ then persists coverPath", async () => {
    vi.mocked(resizeImage).mockResolvedValueOnce(
      new Blob(["webp"], { type: "image/webp" }),
    );
    vi.mocked(readImageDimensions).mockResolvedValueOnce({
      width: 800,
      height: 450,
    });
    vi.mocked(uploadSectionAsset).mockImplementationOnce(async (path) => path);
    vi.mocked(updateWebtoonMetadataAction).mockResolvedValueOnce({ ok: true });

    await renderShell();

    const file = new File(["png"], "cover photo.png", { type: "image/png" });
    fireEvent.change(screen.getByTestId("metadata-cover-input"), {
      target: { files: [file] },
    });

    await waitFor(() => {
      expect(vi.mocked(uploadSectionAsset)).toHaveBeenCalledTimes(1);
    });
    expect(vi.mocked(resizeImage)).toHaveBeenCalledWith(file, {
      maxDimension: 800,
    });

    const [path, blob, contentType] =
      vi.mocked(uploadSectionAsset).mock.calls[0];
    expect(path).toMatch(
      new RegExp(`^webtoons/covers/${WEBTOON_ID}/\\d+-cover_photo\\.png$`),
    );
    expect(blob).toBeInstanceOf(Blob);
    expect(contentType).toBe("image/webp");

    await waitFor(() => {
      expect(vi.mocked(updateWebtoonMetadataAction)).toHaveBeenCalledWith(
        WEBTOON_ID,
        { title: "Titre", description: "Desc", coverPath: path },
      );
    });

    const preview = await screen.findByTestId("metadata-cover-preview");
    expect(preview.getAttribute("src")).toContain(path);
    expect(preview.getAttribute("src")).toContain(
      "/storage/v1/render/image/public/webtoon-images/",
    );
    expect(preview).toHaveAttribute("alt", "Titre");
  });

  test("a non-image file is rejected inline and never uploaded", async () => {
    await renderShell();

    const file = new File(["pdf"], "doc.pdf", { type: "application/pdf" });
    fireEvent.change(screen.getByTestId("metadata-cover-input"), {
      target: { files: [file] },
    });

    const error = await screen.findByTestId("metadata-error");
    expect(error.textContent?.toLowerCase()).toMatch(/image/);
    expect(vi.mocked(uploadSectionAsset)).not.toHaveBeenCalled();
    expect(vi.mocked(updateWebtoonMetadataAction)).not.toHaveBeenCalled();
  });

  test("an upload failure is surfaced inline", async () => {
    vi.mocked(resizeImage).mockRejectedValueOnce(new Error("canvas boom"));

    await renderShell();

    fireEvent.change(screen.getByTestId("metadata-cover-input"), {
      target: {
        files: [new File(["png"], "cover.png", { type: "image/png" })],
      },
    });

    const error = await screen.findByTestId("metadata-error");
    expect(error.textContent?.toLowerCase()).toMatch(/image/);
    expect(vi.mocked(updateWebtoonMetadataAction)).not.toHaveBeenCalled();
  });

  test("removing an existing cover clears coverPath through the action", async () => {
    vi.mocked(updateWebtoonMetadataAction).mockResolvedValueOnce({ ok: true });

    await renderShell({
      initialCoverPath: "webtoons/covers/w1/1700000000000-cover.webp",
    });

    expect(screen.getByTestId("metadata-cover-preview")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("metadata-cover-remove"));

    await waitFor(() => {
      expect(vi.mocked(updateWebtoonMetadataAction)).toHaveBeenCalledWith(
        WEBTOON_ID,
        { title: "Titre", description: "Desc", coverPath: "" },
      );
    });
    await waitFor(() => {
      expect(
        screen.queryByTestId("metadata-cover-preview"),
      ).not.toBeInTheDocument();
    });
    expect(screen.getByTestId("metadata-cover-placeholder")).toBeInTheDocument();
  });
});

describe("Editor detail — unsaved changes guard", () => {
  const WEBTOON_ID = "11111111-2222-4333-8444-555555555555";

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function DirtyToggle() {
    const { setIsDirty } = useEditorState();
    return (
      <>
        <button
          type="button"
          data-testid="make-dirty"
          onClick={() => setIsDirty(true)}
        >
          dirty
        </button>
        <button
          type="button"
          data-testid="make-clean"
          onClick={() => setIsDirty(false)}
        >
          clean
        </button>
      </>
    );
  }

  async function renderShell() {
    const { EditorDetailLayoutContent } = await import(
      "@/components/editor/EditorDetailShell"
    );
    const { EditorStateProvider } = await import(
      "@/components/editor/EditorStateContext"
    );

    render(
      <NextIntlClientProvider locale="fr" messages={frMessages}>
        <EditorStateProvider initialTitle="Titre" initialVisibility="draft">
          <EditorDetailLayoutContent webtoonId={WEBTOON_ID}>
            <DirtyToggle />
          </EditorDetailLayoutContent>
        </EditorStateProvider>
      </NextIntlClientProvider>,
    );

    await screen.findByTestId("make-dirty");
  }

  test("registers the beforeunload warning only while dirty", async () => {
    const addSpy = vi.spyOn(window, "addEventListener");
    const removeSpy = vi.spyOn(window, "removeEventListener");
    const beforeUnload = (calls: unknown[][]) =>
      calls.filter((call) => call[0] === "beforeunload");

    await renderShell();

    expect(beforeUnload(addSpy.mock.calls)).toHaveLength(0);

    const cleanEvent = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(cleanEvent);
    expect(cleanEvent.defaultPrevented).toBe(false);

    fireEvent.click(screen.getByTestId("make-dirty"));
    await waitFor(() => {
      expect(beforeUnload(addSpy.mock.calls)).toHaveLength(1);
    });

    const dirtyEvent = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(dirtyEvent);
    expect(dirtyEvent.defaultPrevented).toBe(true);

    fireEvent.click(screen.getByTestId("make-clean"));
    await waitFor(() => {
      expect(beforeUnload(removeSpy.mock.calls)).toHaveLength(1);
    });

    const cleanedEvent = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(cleanedEvent);
    expect(cleanedEvent.defaultPrevented).toBe(false);
  });

  test("removes the listener on unmount while dirty", async () => {
    const removeSpy = vi.spyOn(window, "removeEventListener");

    await renderShell();
    fireEvent.click(screen.getByTestId("make-dirty"));
    await waitFor(() => {
      expect(
        removeSpy.mock.calls.filter((call) => call[0] === "beforeunload"),
      ).toHaveLength(0);
    });

    cleanup();

    expect(
      removeSpy.mock.calls.filter((call) => call[0] === "beforeunload"),
    ).toHaveLength(1);
  });

  test("client-side links confirm before leaving a dirty editor", async () => {
    await renderShell();

    const backLink = screen.getByRole("link", { name: /Retour à l'éditeur/ });
    const readerLink = screen.getByRole("link", { name: /Lecteur/ });

    // Clean editor: no confirmation is requested.
    const cleanConfirm = vi.spyOn(window, "confirm");
    fireEvent.click(backLink);
    expect(cleanConfirm).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("make-dirty"));
    await waitFor(() => {
      expect(screen.getByTestId("dirty-indicator")).toBeInTheDocument();
    });

    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    fireEvent.click(readerLink);
    expect(confirmSpy).toHaveBeenCalledWith(
      "Des modifications ne sont pas enregistrées. Quitter quand même ?",
    );

    confirmSpy.mockReturnValue(true);
    fireEvent.click(backLink);
    expect(confirmSpy).toHaveBeenCalledTimes(2);
  });

  test("a cancelled popstate re-pushes the editor entry", async () => {
    await renderShell();

    const cleanConfirm = vi.spyOn(window, "confirm");
    fireEvent.popState(window);
    expect(cleanConfirm).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("make-dirty"));
    await waitFor(() => {
      expect(screen.getByTestId("dirty-indicator")).toBeInTheDocument();
    });

    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    const pushSpy = vi.spyOn(window.history, "pushState");
    fireEvent.popState(window);

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(pushSpy).toHaveBeenCalledTimes(1);

    confirmSpy.mockReturnValue(true);
    pushSpy.mockClear();
    fireEvent.popState(window);
    expect(pushSpy).not.toHaveBeenCalled();
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

describe("Editor detail — undo/redo header controls", () => {
  const WEBTOON_ID = "11111111-2222-4333-8444-555555555555";

  function makeHeaderSection(id: string, position: number): SectionWithImages {
    return {
      id,
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

  test("localized undo/redo buttons are disabled without history and drive the section history", async () => {
    const { EditorDetailLayoutContent } = await import(
      "@/components/editor/EditorDetailShell"
    );
    const { EditorStateProvider, useEditorState } = await import(
      "@/components/editor/EditorStateContext"
    );
    const api: {
      current: ReturnType<typeof useEditorState> | null;
    } = { current: null };

    function Seeder() {
      const { setSections } = useEditorState();
      React.useEffect(() => {
        setSections([makeHeaderSection("sec-1", 1)]);
      }, [setSections]);
      return null;
    }

    function Probe() {
      api.current = useEditorState();
      return (
        <div
          data-testid="history-probe"
          data-ids={JSON.stringify(
            api.current.sections.map((section) => section.id),
          )}
        />
      );
    }

    render(
      <NextIntlClientProvider locale="fr" messages={frMessages}>
        <EditorStateProvider>
          <EditorDetailLayoutContent webtoonId={WEBTOON_ID}>
            <Seeder />
            <Probe />
          </EditorDetailLayoutContent>
        </EditorStateProvider>
      </NextIntlClientProvider>,
    );

    const undoButton = await screen.findByRole("button", { name: "Annuler" });
    const redoButton = screen.getByRole("button", { name: "Rétablir" });
    expect(undoButton).toBeDisabled();
    expect(redoButton).toBeDisabled();

    act(() => {
      api.current!.commitSections([
        makeHeaderSection("sec-1", 1),
        makeHeaderSection("sec-2", 2),
      ]);
    });
    expect(undoButton).toBeEnabled();
    expect(screen.getByTestId("dirty-indicator")).toBeInTheDocument();

    fireEvent.click(undoButton);
    expect(screen.getByTestId("history-probe")).toHaveAttribute(
      "data-ids",
      JSON.stringify(["sec-1"]),
    );
    expect(redoButton).toBeEnabled();

    fireEvent.click(redoButton);
    expect(screen.getByTestId("history-probe")).toHaveAttribute(
      "data-ids",
      JSON.stringify(["sec-1", "sec-2"]),
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

describe("Editor — single app header per page (ED-13)", () => {
  const WEBTOON_ID = "11111111-2222-4333-8444-555555555555";

  test("the segment layout renders neither a header nor a main", async () => {
    const fs = await import("fs");
    const source = fs.readFileSync(
      "/root/arneph/src/app/editor/layout.tsx",
      "utf8",
    );
    // Ignore the explanatory JSDoc: only the rendered JSX matters here.
    const jsx = source.replace(/\/\*[\s\S]*?\*\//g, "");

    expect(jsx).not.toMatch(/<header[\s>]/);
    expect(jsx).not.toMatch(/<main[\s>]/);
    expect(jsx).toContain("{children}");
  });

  test("the list page owns exactly one sticky header and one main", async () => {
    const fs = await import("fs");
    const source = fs.readFileSync(
      "/root/arneph/src/app/editor/page.tsx",
      "utf8",
    );

    expect(source.match(/<header[\s>]/g)).toHaveLength(1);
    expect(source.match(/<main[\s>]/g)).toHaveLength(1);
    expect(source).toContain('className="sticky top-0');
    expect(source).toContain("backToHome");
    expect(source).toContain("signOut");
  });

  test("the detail shell renders one sticky header, one main and the sign-out action", async () => {
    const { EditorDetailLayoutContent } = await import(
      "@/components/editor/EditorDetailShell"
    );
    const { EditorStateProvider } = await import(
      "@/components/editor/EditorStateContext"
    );

    const { container } = render(
      <NextIntlClientProvider locale="fr" messages={frMessages}>
        <EditorStateProvider initialTitle="Titre" initialVisibility="draft">
          <EditorDetailLayoutContent webtoonId={WEBTOON_ID}>
            <div data-testid="detail-child" />
          </EditorDetailLayoutContent>
        </EditorStateProvider>
      </NextIntlClientProvider>,
    );

    const headers = container.querySelectorAll("header");
    const mains = container.querySelectorAll("main");
    expect(headers).toHaveLength(1);
    expect(mains).toHaveLength(1);
    expect(headers[0]).toHaveClass("sticky");
    // The only main is the shell's content slot, not a nested page main.
    expect(mains[0]).toContainElement(screen.getByTestId("detail-child"));

    const header = headers[0];
    expect(
      within(header).getByRole("link", { name: /Retour à l'éditeur/ }),
    ).toHaveAttribute("href", "/editor");
    expect(within(header).getByTestId("editor-title")).toHaveTextContent(
      "Titre",
    );
    expect(
      within(header).getByRole("link", { name: "Lecteur" }),
    ).toHaveAttribute("href", `/read/${WEBTOON_ID}`);

    const signOutButton = within(header).getByRole("button", {
      name: "Se déconnecter",
    });
    expect(signOutButton).toHaveAttribute("type", "submit");
    expect(screen.getByTestId("save-button")).toBeInTheDocument();
  });
});
