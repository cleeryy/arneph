import type { ReactElement } from "react";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";

import { SectionSortableItem } from "../SectionSortableItem";
import { EditorCanvas } from "../EditorCanvas";
import type { SectionWithImages } from "@/lib/db/queries";
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

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

function wrap(ui: ReactElement) {
  return (
    <NextIntlClientProvider locale="fr" messages={frMessages}>
      {ui}
    </NextIntlClientProvider>
  );
}

function makeSection(
  id: string,
  position: number,
  type: "image" | "pan-x" | "animation" = "image",
): SectionWithImages {
  return {
    id,
    webtoonId: "w1",
    position,
    type,
    config:
      type === "image"
        ? { type: "image", imagePath: "test.webp", width: 800, height: 1200 }
        : type === "pan-x"
          ? { type: "pan-x", imagePath: "test.webp", width: 1600, height: 600 }
          : { type: "animation", spritePath: "sprite.webp", frameWidth: 100, frameHeight: 100, columns: 4, rows: 3, frameCount: 10 },
    audioPath: undefined,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    images: [],
  };
}

describe("SectionSortableItem — T24", () => {
  test("renders drag handle and children", () => {
    const section = makeSection("sec-1", 1, "image");
    render(
      wrap(
        <SectionSortableItem section={section}>
          <div data-testid="child-content">Preview</div>
        </SectionSortableItem>,
      ),
    );

    expect(screen.getByTestId("sortable-section-sec-1")).toBeInTheDocument();
    expect(screen.getByTestId("child-content")).toBeInTheDocument();
  });

  test("drag handle has correct accessibility attributes", () => {
    const section = makeSection("sec-1", 1, "image");
    render(
      wrap(
        <SectionSortableItem section={section}>
          <div>Preview</div>
        </SectionSortableItem>,
      ),
    );

    const handle = screen.getByRole("button", { name: "Glisser pour réorganiser" });
    expect(handle).toBeInTheDocument();
  });

  test("clicking drag handle does not trigger parent onClick (no selection conflict)", () => {
    const section = makeSection("sec-1", 1, "image");
    const onSelect = vi.fn();

    render(
      wrap(
        <div onClick={() => onSelect(section.id)}>
          <SectionSortableItem section={section}>
            <div data-testid="child-content">Preview</div>
          </SectionSortableItem>
        </div>
      ),
    );

    const handle = screen.getByRole("button", { name: "Glisser pour réorganiser" });
    fireEvent.click(handle);

    expect(onSelect).not.toHaveBeenCalled();
  });
});

describe("EditorCanvas — DndContext integration", () => {
  test("renders DndContext and SortableContext wrapper", () => {
    const sections = [makeSection("sec-1", 1, "image")];
    render(wrap(<EditorCanvas sections={sections} onSectionsChange={vi.fn()} />));

    expect(screen.getByTestId("editor-canvas")).toBeInTheDocument();
    expect(screen.getByTestId("sortable-section-sec-1")).toBeInTheDocument();
  });

  test("renders SectionSortableItem for each section", () => {
    const sections = [
      makeSection("sec-1", 1, "image"),
      makeSection("sec-2", 2, "pan-x"),
    ];
    render(wrap(<EditorCanvas sections={sections} onSectionsChange={vi.fn()} />));

    expect(screen.getByTestId("sortable-section-sec-1")).toBeInTheDocument();
    expect(screen.getByTestId("sortable-section-sec-2")).toBeInTheDocument();
  });

  test("drag handle does not trigger section selection", () => {
    const sections = [makeSection("sec-1", 1, "image")];
    render(wrap(<EditorCanvas sections={sections} onSectionsChange={vi.fn()} />));

    const handle = screen.getByRole("button", { name: "Glisser pour réorganiser" });
    fireEvent.click(handle);

    const sectionEl = screen.getByTestId("editor-section-sec-1");
    expect(sectionEl).not.toHaveAttribute("data-selected", "true");
  });

  test("onDragEnd reorders sections when active and over differ", () => {
    const sections = [
      makeSection("sec-1", 1, "image"),
      makeSection("sec-2", 2, "image"),
      makeSection("sec-3", 3, "image"),
    ];
    const onChange = vi.fn();
    render(wrap(<EditorCanvas sections={sections} onSectionsChange={onChange} />));

    const canvas = screen.getByTestId("editor-canvas");
    expect(canvas).toBeInTheDocument();

    expect(screen.getByTestId("sortable-section-sec-1")).toBeInTheDocument();
    expect(screen.getByTestId("sortable-section-sec-2")).toBeInTheDocument();
    expect(screen.getByTestId("sortable-section-sec-3")).toBeInTheDocument();

    const dndContext = canvas.closest('[data-testid="editor-canvas"]');
    expect(dndContext).toBeInTheDocument();
  });

  test("onDragEnd does not reorder when active and over are the same", () => {
    const sections = [
      makeSection("sec-1", 1, "image"),
      makeSection("sec-2", 2, "image"),
    ];
    const onChange = vi.fn();
    render(wrap(<EditorCanvas sections={sections} onSectionsChange={onChange} />));

    const canvas = screen.getByTestId("editor-canvas");
    fireEvent.dragEnd(canvas, {
      active: { id: "sec-1" },
      over: { id: "sec-1" },
    });

    expect(onChange).not.toHaveBeenCalled();
  });
});
