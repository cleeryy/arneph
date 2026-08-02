import type { ReactElement } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import { NextIntlClientProvider } from "next-intl";

import ReaderShell from "../ReaderShell";
import type { SectionWithImages } from "@/lib/db/queries";
import type { ReaderPageData } from "@/app/read/[webtoonId]/page";
import type { SectionConfig, SectionType } from "@/types/webtoon";
import frMessages from "../../../../messages/fr.json";

afterEach(cleanup);

function wrap(ui: ReactElement) {
  return (
    <NextIntlClientProvider locale="fr" messages={frMessages}>
      {ui}
    </NextIntlClientProvider>
  );
}

function makeSection(
  position: number,
  type: SectionType,
  config: SectionConfig,
  id = `sec-${position}`,
): SectionWithImages {
  return {
    id,
    webtoonId: "w1",
    position,
    type,
    config,
    audioPath: undefined,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    images: [],
  };
}

const baseWebtoon = {
  id: "w1",
  title: "Webtoon Test",
  visibility: "published",
  settings: {},
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
} as const;

function renderShell(sections: SectionWithImages[]) {
  const data: ReaderPageData = { webtoon: { ...baseWebtoon, sections } };
  return render(wrap(<ReaderShell data={data} />));
}

describe("ReaderShell — conteneur lecteur (T15)", () => {
  test("rend les sections dans l'ordre des positions (défensif, même si la liste arrive désordonnée)", () => {
    renderShell([
      makeSection(3, "animation", {
        type: "animation",
        spritePath: "c.webp",
        frameWidth: 100,
        frameHeight: 100,
        columns: 10,
        rows: 2,
        frameCount: 20,
      }),
      makeSection(1, "image", { type: "image", imagePath: "a.webp", width: 800, height: 1200 }),
      makeSection(2, "pan-x", {
        type: "pan-x",
        imagePath: "b.webp",
        width: 1600,
        height: 600,
      }),
    ]);

    const stubs = screen.getAllByTestId(/^section-stub-/);
    expect(stubs.map((el) => el.dataset.sectionPosition)).toEqual(["1", "2", "3"]);
  });

  test("expose un data-testid distinct par type de section", () => {
    renderShell([
      makeSection(1, "image", { type: "image", imagePath: "a.webp", width: 800, height: 1200 }),
      makeSection(2, "long-y", {
        type: "long-y",
        imagePath: "b.webp",
        width: 800,
        height: 4000,
      }),
      makeSection(3, "pan-x", {
        type: "pan-x",
        imagePath: "c.webp",
        width: 1600,
        height: 600,
      }),
      makeSection(4, "animation", {
        type: "animation",
        spritePath: "d.webp",
        frameWidth: 100,
        frameHeight: 100,
        columns: 10,
        rows: 2,
        frameCount: 20,
      }),
    ]);

    for (const type of ["image", "long-y", "pan-x", "animation"]) {
      expect(screen.getByTestId(`section-stub-${type}`)).toBeInTheDocument();
    }
  });

  test("layout mobile-first : conteneur max-w-[800px] centré + min-h-dvh", () => {
    const { container } = renderShell([
      makeSection(1, "image", { type: "image", imagePath: "a.webp", width: 800, height: 1200 }),
    ]);

    const main = container.querySelector("main");
    expect(main?.className).toContain("min-h-dvh");
    expect(main?.className).toContain("bg-background");

    const readerContainer = screen.getByTestId("reader-container");
    expect(readerContainer.className).toContain("max-w-[800px]");
    expect(readerContainer.className).toContain("mx-auto");
  });

  test("affiche le titre du webtoon et le compteur de sections", () => {
    renderShell([
      makeSection(1, "image", { type: "image", imagePath: "a.webp", width: 800, height: 1200 }),
      makeSection(2, "image", {
        type: "image",
        imagePath: "b.webp",
        width: 800,
        height: 1200,
        audioPath: "t.ogg",
      }),
    ]);

    expect(screen.getByText("Webtoon Test")).toBeInTheDocument();
    expect(screen.getByText("2 sections")).toBeInTheDocument();
  });

  test("le stub image respecte le ratio d'aspect de la config (pas d'<img> natif)", () => {
    const { container } = renderShell([
      makeSection(1, "image", { type: "image", imagePath: "a.webp", width: 800, height: 1200 }),
    ]);

    const stub = screen.getByTestId("section-stub-image");
    expect(stub.style.aspectRatio).toBe("800 / 1200");
    // MUST NOT T15 : aucun <img> natif — next/image uniquement (T16+).
    expect(container.querySelector("img")).toBeNull();
  });
});
