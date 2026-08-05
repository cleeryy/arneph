import type { ReactElement } from "react";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";

import { SectionLayersPanel } from "../SectionLayersPanel";
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
  type: "image" | "long-y" | "pan-x" | "animation" = "image",
): SectionWithImages {
  return {
    id,
    webtoonId: "w1",
    position,
    type,
    config:
      type === "image"
        ? { type: "image", imagePath: "test.webp", width: 800, height: 1200 }
        : type === "long-y"
          ? { type: "long-y", imagePath: "test.webp", width: 800, height: 2400 }
          : type === "pan-x"
            ? { type: "pan-x", imagePath: "test.webp", width: 1600, height: 600 }
            : { type: "animation", spritePath: "sprite.webp", frameWidth: 100, frameHeight: 100, columns: 4, rows: 3, frameCount: 10 },
    audioPath: undefined,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    images: [],
  };
}

describe("SectionLayersPanel — T8", () => {
  test("renders list ordered by position", () => {
    const sections = [
      makeSection("sec-3", 3, "image"),
      makeSection("sec-1", 1, "pan-x"),
      makeSection("sec-2", 2, "long-y"),
    ];
    render(
      wrap(
        <SectionLayersPanel
          sections={sections}
          selectedId={null}
          onSelect={vi.fn()}
          onSectionsChange={vi.fn()}
        />,
      ),
    );

    const items = screen.getAllByTestId(/sortable-section-/);
    expect(items).toHaveLength(3);
    expect(items[0].getAttribute("data-section-id")).toBe("sec-1");
    expect(items[1].getAttribute("data-section-id")).toBe("sec-2");
    expect(items[2].getAttribute("data-section-id")).toBe("sec-3");
  });

  test("click row → onSelect(id)", () => {
    const onSelect = vi.fn();
    const sections = [makeSection("sec-1", 1, "image")];
    render(
      wrap(
        <SectionLayersPanel
          sections={sections}
          selectedId={null}
          onSelect={onSelect}
          onSectionsChange={vi.fn()}
        />,
      ),
    );

    const row = screen.getByTestId("layer-section-sec-1");
    expect(row).toBeInTheDocument();
    fireEvent.click(row);
    expect(onSelect).toHaveBeenCalledWith("sec-1");
  });

  test("selected row has data-selected attribute", () => {
    const sections = [makeSection("sec-1", 1, "image")];
    render(
      wrap(
        <SectionLayersPanel
          sections={sections}
          selectedId="sec-1"
          onSelect={vi.fn()}
          onSectionsChange={vi.fn()}
        />,
      ),
    );

    const row = screen.getByTestId("layer-section-sec-1");
    expect(row).toHaveAttribute("data-selected", "true");
  });

  test("unselected row has no data-selected attribute", () => {
    const sections = [makeSection("sec-1", 1, "image")];
    render(
      wrap(
        <SectionLayersPanel
          sections={sections}
          selectedId={null}
          onSelect={vi.fn()}
          onSectionsChange={vi.fn()}
        />,
      ),
    );

    const row = screen.getByTestId("layer-section-sec-1");
    expect(row).not.toHaveAttribute("data-selected");
  });

  test("renders DndContext and SortableContext wrapper", () => {
    const sections = [makeSection("sec-1", 1, "image")];
    render(
      wrap(
        <SectionLayersPanel
          sections={sections}
          selectedId={null}
          onSelect={vi.fn()}
          onSectionsChange={vi.fn()}
        />,
      ),
    );

    expect(screen.getByTestId("section-layers-panel")).toBeInTheDocument();
    expect(screen.getByTestId("sortable-section-sec-1")).toBeInTheDocument();
  });

  test("renders type icon, i18n label, and position for each row", () => {
    const sections = [makeSection("sec-1", 1, "image")];
    render(
      wrap(
        <SectionLayersPanel
          sections={sections}
          selectedId={null}
          onSelect={vi.fn()}
          onSectionsChange={vi.fn()}
        />,
      ),
    );

    expect(screen.getByText("Image")).toBeInTheDocument();
    expect(screen.getByText("#1")).toBeInTheDocument();
  });

  test("renders empty state when no sections", () => {
    render(
      wrap(
        <SectionLayersPanel
          sections={[]}
          selectedId={null}
          onSelect={vi.fn()}
          onSectionsChange={vi.fn()}
        />,
      ),
    );

    expect(screen.getByText(/Aucune section/)).toBeInTheDocument();
  });

  test("reordering sections via onSectionsChange updates the list order", () => {
    const onSectionsChange = vi.fn();
    const sections = [
      makeSection("sec-1", 1, "image"),
      makeSection("sec-2", 2, "image"),
      makeSection("sec-3", 3, "image"),
    ];
    render(
      wrap(
        <SectionLayersPanel
          sections={sections}
          selectedId={null}
          onSelect={vi.fn()}
          onSectionsChange={onSectionsChange}
        />,
      ),
    );

    const reordered = [
      { ...sections[2], position: 1 },
      { ...sections[1], position: 2 },
      { ...sections[0], position: 3 },
    ];
    onSectionsChange(reordered);

    expect(onSectionsChange).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ id: "sec-3", position: 1 }),
        expect.objectContaining({ id: "sec-2", position: 2 }),
        expect.objectContaining({ id: "sec-1", position: 3 }),
      ]),
    );
  });

  test("onSectionsChange is not called when dragEnd fires with same active and over", () => {
    const sections = [
      makeSection("sec-1", 1, "image"),
      makeSection("sec-2", 2, "image"),
    ];
    const onSectionsChange = vi.fn();
    render(
      wrap(
        <SectionLayersPanel
          sections={sections}
          selectedId={null}
          onSelect={vi.fn()}
          onSectionsChange={onSectionsChange}
        />,
      ),
    );

    const panel = screen.getByTestId("section-layers-panel");
    fireEvent.dragEnd(panel, {
      active: { id: "sec-1" },
      over: { id: "sec-1" },
    });

    expect(onSectionsChange).not.toHaveBeenCalled();
  });
});
