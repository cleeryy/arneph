import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { PanXStep } from "../PanXStep";
import type { PanXSectionConfig } from "@/types/webtoon";
import { makeImage, makeSection, wrap } from "./fixtures";

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

function panSection(
  configOverrides: Partial<PanXSectionConfig> = {},
  sectionOverrides: Parameters<typeof makeSection>[2] = {},
) {
  const config: PanXSectionConfig = {
    type: "pan-x",
    imagePath: "test/pan.webp",
    width: 3000,
    height: 800,
    ...configOverrides,
  };
  return makeSection("pan-x", config, {
    id: "sec-pan",
    images: [makeImage({ storagePath: "test/pan.webp", width: 3000, height: 800 })],
    ...sectionOverrides,
  });
}

/**
 * Formule attendue : `100%` = largeur rendue de l'image (hauteur plein écran),
 * `100cqw` = largeur du viewport. Le terme `max` recentre une image plus étroite
 * que l'écran ; le terme `min` borne le pan à 0 dans ce même cas.
 */
function expectedTransform(progress: number, direction: "ltr" | "rtl"): string {
  // Zones mortes de 8 % en entrée et en sortie : le pan ne commence qu'après
  // la première et se termine avant la seconde.
  const lead = 0.08;
  const effective = Math.min(1, Math.max(0, (progress - lead) / (1 - lead * 2)));
  const coefficient = Number((direction === "rtl" ? 1 - effective : effective).toFixed(5));
  return `translateX(calc(max(0px, (100cqw - 100%) / 2) + min(0px, (100cqw - 100%) * ${coefficient})))`;
}

describe("PanXStep — sens du panoramique", () => {
  test("ltr : démarre bord gauche (translation 0) et glisse vers la gauche jusqu'au bout", () => {
    const { rerender } = render(
      wrap(<PanXStep section={panSection({ direction: "ltr" })} progress={0} />),
    );

    const root = screen.getByTestId("pan-x-step");
    expect(root).toHaveAttribute("data-section-id", "sec-pan");
    expect(root).toHaveAttribute("data-direction", "ltr");
    expect(root.className).toContain("h-full");

    expect(screen.getByTestId("pan-x-step-image").style.transform).toBe(
      expectedTransform(0, "ltr"),
    );

    rerender(
      wrap(<PanXStep section={panSection({ direction: "ltr" })} progress={0.5} />),
    );
    expect(screen.getByTestId("pan-x-step-image").style.transform).toBe(
      expectedTransform(0.5, "ltr"),
    );

    rerender(
      wrap(<PanXStep section={panSection({ direction: "ltr" })} progress={1} />),
    );
    expect(screen.getByTestId("pan-x-step-image").style.transform).toBe(
      expectedTransform(1, "ltr"),
    );
  });

  test("rtl : démarre bord droit (translation maximale) et revient vers la gauche", () => {
    const { rerender } = render(
      wrap(<PanXStep section={panSection({ direction: "rtl" })} progress={0} />),
    );

    const root = screen.getByTestId("pan-x-step");
    expect(root).toHaveAttribute("data-direction", "rtl");
    expect(screen.getByTestId("pan-x-step-image").style.transform).toBe(
      expectedTransform(0, "rtl"),
    );

    rerender(
      wrap(<PanXStep section={panSection({ direction: "rtl" })} progress={1} />),
    );
    expect(screen.getByTestId("pan-x-step-image").style.transform).toBe(
      expectedTransform(1, "rtl"),
    );
  });

  test("sens absent ou inconnu → ltr", () => {
    render(wrap(<PanXStep section={panSection()} progress={0} />));
    expect(screen.getByTestId("pan-x-step")).toHaveAttribute("data-direction", "ltr");

    cleanup();

    render(
      wrap(
        <PanXStep
          section={panSection({ direction: "up" as PanXSectionConfig["direction"] })}
          progress={0}
        />,
      ),
    );
    expect(screen.getByTestId("pan-x-step")).toHaveAttribute("data-direction", "ltr");
  });

  test("progress borné à [0, 1]", () => {
    const { rerender } = render(
      wrap(<PanXStep section={panSection({ direction: "ltr" })} progress={-2} />),
    );
    expect(screen.getByTestId("pan-x-step-image").style.transform).toBe(
      expectedTransform(0, "ltr"),
    );

    rerender(
      wrap(<PanXStep section={panSection({ direction: "ltr" })} progress={4} />),
    );
    expect(screen.getByTestId("pan-x-step-image").style.transform).toBe(
      expectedTransform(1, "ltr"),
    );
  });
});

describe("PanXStep — image plus étroite que l'écran", () => {
  test("le pan est borné à 0px (min) et l'image est recentrée (max), sans saut", () => {
    render(wrap(<PanXStep section={panSection({ direction: "ltr" })} progress={1} />));

    const transform = screen.getByTestId("pan-x-step-image").style.transform;
    // min(0px, …) : toute translation positive (image étroite) est ramenée à 0.
    expect(transform).toContain("min(0px,");
    // max(0px, …) : centrage uniquement quand l'image est plus étroite.
    expect(transform).toContain("max(0px,");
    expect(transform).toBe(expectedTransform(1, "ltr"));
  });

  test("rtl : même bornage, aucune translation quand l'image tient dans l'écran", () => {
    render(wrap(<PanXStep section={panSection({ direction: "rtl" })} progress={0} />));

    const transform = screen.getByTestId("pan-x-step-image").style.transform;
    expect(transform).toContain("min(0px,");
    expect(transform).toContain("max(0px,");
    expect(transform).toBe(expectedTransform(0, "rtl"));
  });
});

describe("PanXStep — rendu", () => {
  test("image épinglée : hauteur plein écran, largeur auto, transform uniquement", () => {
    render(wrap(<PanXStep section={panSection()} progress={0.25} />));

    const img = screen.getByTestId("pan-x-step-image");
    expect(img.tagName).toBe("IMG");
    expect(img.className).toContain("h-full");
    expect(img.className).toContain("w-auto");
    expect(img.className).toContain("max-w-none");
    expect(img.className).not.toContain("transition");
    expect(img.style.left).toBe("");
    expect(img.style.top).toBe("");
    expect(img.style.transition).toContain("transform");
    expect(img.style.transform).toBe(expectedTransform(0.25, "ltr"));
  });

  test("alt i18n et URL storage publique", () => {
    render(wrap(<PanXStep section={panSection()} progress={0} />));

    const img = screen.getByTestId("pan-x-step-image");
    expect(img).toHaveAttribute("alt", "Section panoramique");
    expect(img).toHaveAttribute("src", expect.stringContaining("test/pan.webp"));
  });

  test("média absent → placeholder, aucune image", () => {
    const section = panSection({ imagePath: "" }, { images: [] });
    const { container } = render(wrap(<PanXStep section={section} progress={0} />));

    expect(screen.getByTestId("pan-x-step-placeholder")).toBeInTheDocument();
    expect(container.querySelector("img")).toBeNull();
  });
});
