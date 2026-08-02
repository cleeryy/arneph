import type { ReactElement } from "react";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";

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

describe("EditorCanvas — T23", () => {
  test("rend empty state when no sections", () => {
    render(wrap(<EditorCanvas sections={[]} onSectionsChange={vi.fn()} />));
    expect(screen.getByText(/Aucune section/)).toBeInTheDocument();
  });

  test("rend sections via SectionPreview", () => {
    const sections = [makeSection("sec-1", 1, "image")];
    render(wrap(<EditorCanvas sections={sections} onSectionsChange={vi.fn()} />));
    expect(screen.getByTestId("editor-canvas")).toBeInTheDocument();
  });

  test("click section → selection (outline + badge)", () => {
    const sections = [makeSection("sec-1", 1, "image")];
    render(wrap(<EditorCanvas sections={sections} onSectionsChange={vi.fn()} />));

    const sectionEl = screen.getByTestId("editor-section-sec-1");
    fireEvent.click(sectionEl);

    expect(sectionEl).toHaveAttribute("data-selected", "true");
    expect(screen.getByText("Sélectionnée")).toBeInTheDocument();
  });

  test("click same section again → deselect", () => {
    const sections = [makeSection("sec-1", 1, "image")];
    render(wrap(<EditorCanvas sections={sections} onSectionsChange={vi.fn()} />));

    const sectionEl = screen.getByTestId("editor-section-sec-1");
    fireEvent.click(sectionEl);
    fireEvent.click(sectionEl);

    expect(sectionEl).not.toHaveAttribute("data-selected");
  });

  test("move up button calls onSectionsChange with reordered sections", () => {
    const sections = [makeSection("sec-1", 1, "image"), makeSection("sec-2", 2, "image")];
    const onChange = vi.fn();
    render(wrap(<EditorCanvas sections={sections} onSectionsChange={onChange} />));

    // sec-1 is first (disabled), sec-2 is second (enabled)
    const moveUpBtns = screen.getAllByRole("button", { name: "Monter" });
    expect(moveUpBtns[0]).toBeDisabled();
    fireEvent.click(moveUpBtns[1]);

    expect(onChange).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ id: "sec-2", position: 1 }),
        expect.objectContaining({ id: "sec-1", position: 2 }),
      ]),
    );
  });

  test("move down button calls onSectionsChange with reordered sections", () => {
    const sections = [makeSection("sec-1", 1, "image"), makeSection("sec-2", 2, "image")];
    const onChange = vi.fn();
    render(wrap(<EditorCanvas sections={sections} onSectionsChange={onChange} />));

    // sec-1 is first (enabled for move down), sec-2 is last (disabled)
    const moveDownBtns = screen.getAllByRole("button", { name: "Descendre" });
    expect(moveDownBtns[0]).not.toBeDisabled();
    fireEvent.click(moveDownBtns[0]);

    expect(onChange).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ id: "sec-2", position: 1 }),
        expect.objectContaining({ id: "sec-1", position: 2 }),
      ]),
    );
  });

  test("delete button calls onSectionsChange without deleted section", () => {
    const sections = [makeSection("sec-1", 1, "image"), makeSection("sec-2", 2, "image")];
    const onChange = vi.fn();
    render(wrap(<EditorCanvas sections={sections} onSectionsChange={onChange} />));

    const deleteBtns = screen.getAllByRole("button", { name: "Supprimer la section" });
    // Delete the first section (sec-1)
    fireEvent.click(deleteBtns[0]);

    expect(onChange).toHaveBeenCalledWith(
      expect.not.arrayContaining([
        expect.objectContaining({ id: "sec-1" }),
      ]),
    );
  });

  test("move up disabled for first section", () => {
    const sections = [makeSection("sec-1", 1, "image")];
    render(wrap(<EditorCanvas sections={sections} onSectionsChange={vi.fn()} />));

    const moveUpBtn = screen.getByRole("button", { name: "Monter" });
    expect(moveUpBtn).toBeDisabled();
  });

  test("move down disabled for last section", () => {
    const sections = [makeSection("sec-1", 1, "image")];
    render(wrap(<EditorCanvas sections={sections} onSectionsChange={vi.fn()} />));

    const moveDownBtn = screen.getByRole("button", { name: "Descendre" });
    expect(moveDownBtn).toBeDisabled();
  });
});
