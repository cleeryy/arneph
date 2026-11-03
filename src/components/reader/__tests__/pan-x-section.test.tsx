import type { ReactElement } from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";

import PanXSection from "../PanXSection";
import { SCROLL_DISTANCES } from "@/lib/scroll/constants";
import type { SectionWithImages } from "@/lib/db/queries";
import type { PanXSectionConfig } from "@/types/webtoon";
import frMessages from "../../../../messages/fr.json";

const { mockUseScroll, mockUseTransform, mockUseReducedMotion } = vi.hoisted(() => ({
  mockUseScroll: vi.fn(),
  mockUseTransform: vi.fn(),
  mockUseReducedMotion: vi.fn(),
}));

vi.mock("motion/react", async () => {
  const React = await import("react");
  return {
    useScroll: mockUseScroll,
    useTransform: mockUseTransform,
    useReducedMotion: mockUseReducedMotion,
    motion: {
      div: (props: Record<string, unknown>) => React.createElement("div", props),
      img: (props: Record<string, unknown>) => React.createElement("img", props),
    },
  };
});

const mockObserve = vi.fn();
const mockDisconnect = vi.fn();
const resizeCallbacks: Array<(entries: unknown[]) => void> = [];

vi.stubGlobal("ResizeObserver", class {
  constructor(callback: (entries: unknown[]) => void) {
    resizeCallbacks.push(callback);
  }
  observe(_target: Element, _options?: ResizeObserverOptions) {
    void _target;
    void _options;
    mockObserve();
  }
  disconnect() {
    mockDisconnect();
  }
  takeRecords() {
    return [];
  }
});

function triggerResizeObserver(width: number) {
  act(() => {
    resizeCallbacks.forEach((cb) => cb([{ contentRect: { width } }]));
  });
}

/** URLs d'assets réellement demandées par le DOM rendu. */
function requestedAssetUrls(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll("img")).flatMap((el) => {
    const src = el.getAttribute("src");
    return src ? [src] : [];
  });
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

beforeEach(() => {
  mockUseScroll.mockReturnValue({ scrollYProgress: 0 });
  mockUseTransform.mockImplementation((value, a, b) => {
    if (typeof a === "function") return a(value);
    return Array.isArray(b) ? b[b.length - 1] : b;
  });
  mockUseReducedMotion.mockReturnValue(false);
  mockObserve.mockClear();
  mockDisconnect.mockClear();
  // Les callbacks ResizeObserver sont accumulés entre tests : on repart d'une
  // liste vide pour ne jamais piloter un composant démonté.
  resizeCallbacks.length = 0;
});

function wrap(ui: ReactElement) {
  return (
    <NextIntlClientProvider locale="fr" messages={frMessages}>
      {ui}
    </NextIntlClientProvider>
  );
}

function makePanXSection(
  overrides: Partial<SectionWithImages> = {},
  configOverrides: Partial<PanXSectionConfig> = {},
): SectionWithImages {
  const config: PanXSectionConfig = {
    type: "pan-x",
    imagePath: "test/pan.webp",
    width: 3000,
    height: 800,
    ...configOverrides,
  };
  return {
    id: "sec-pan",
    webtoonId: "w1",
    position: 1,
    type: "pan-x",
    config,
    audioPath: undefined,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    images: [
      {
        id: "img-pan",
        sectionId: "sec-pan",
        webtoonId: "w1",
        storagePath: "test/pan.webp",
        width: 3000,
        height: 800,
        mimeType: "image/webp",
        position: 0,
      },
    ],
    ...overrides,
  };
}

describe("PanXSection — path statique (reduceMotion)", () => {
  test("rend un <img> natif, pas next/image", () => {
    mockUseReducedMotion.mockReturnValue(true);
    render(wrap(<PanXSection section={makePanXSection()} />));
    expect(screen.getByTestId("pan-x-image").tagName).toBe("IMG");
  });

  test("n'a pas d'attribut sizes (plus de plafond 800px via webtoonSizes)", () => {
    mockUseReducedMotion.mockReturnValue(true);
    render(wrap(<PanXSection section={makePanXSection()} />));
    expect(screen.getByTestId("pan-x-image")).not.toHaveAttribute("sizes");
  });

  test("affiche la largeur réelle imageWidth (3000px), pas un plafond 800px", () => {
    mockUseReducedMotion.mockReturnValue(true);
    render(wrap(<PanXSection section={makePanXSection()} />));
    const img = screen.getByTestId("pan-x-image");
    expect(img.style.width).toBe("3000px");
    expect(img.style.maxWidth).toBe("100%");
  });

  test("a height dans le style pour préserver le ratio", () => {
    mockUseReducedMotion.mockReturnValue(true);
    render(wrap(<PanXSection section={makePanXSection()} />));
    expect(screen.getByTestId("pan-x-image").style.height).toBe("800px");
  });
});

describe("PanXSection — path statique (maxPan ≤ 0)", () => {
  test("rend un <img> natif quand l'image tient dans le viewport", () => {
    const { rerender } = render(wrap(<PanXSection section={makePanXSection()} />));
    triggerResizeObserver(3000);
    rerender(wrap(<PanXSection section={makePanXSection()} />));
    expect(screen.getByTestId("pan-x-image").tagName).toBe("IMG");
  });
});

describe("PanXSection — path scroll (régression)", () => {
  test("motion.img conserve width: imageWidth (pas de shrink 800px)", () => {
    mockUseReducedMotion.mockReturnValue(false);
    const { rerender } = render(wrap(<PanXSection section={makePanXSection()} />));
    triggerResizeObserver(800);
    rerender(wrap(<PanXSection section={makePanXSection()} />));
    expect(screen.getByTestId("pan-x-image").style.width).toBe("3000px");
  });
});

describe("PanXSection — maxPan calcul", () => {
  test("maxPan = 0 quand imageWidth ≤ viewportWidth → path statique", () => {
    const { rerender } = render(wrap(<PanXSection section={makePanXSection()} />));
    triggerResizeObserver(3000);
    rerender(wrap(<PanXSection section={makePanXSection()} />));
    expect(screen.getByTestId("pan-x-image").tagName).toBe("IMG");
  });

  test("maxPan > 0 quand imageWidth > viewportWidth → path scroll", () => {
    const { rerender } = render(wrap(<PanXSection section={makePanXSection()} />));
    triggerResizeObserver(800);
    rerender(wrap(<PanXSection section={makePanXSection()} />));
    expect(screen.getByTestId("pan-x-section")).toBeInTheDocument();
  });
});

describe("PanXSection — état neutre avant mesure du viewport", () => {
  test("avant mesure : aucun bloc sticky 300vh, aucun défilement synthétique réservé", () => {
    mockUseReducedMotion.mockReturnValue(false);
    render(wrap(<PanXSection section={makePanXSection()} />));

    const section = screen.getByTestId("pan-x-section");
    expect(screen.queryByTestId("pan-x-sticky")).not.toBeInTheDocument();
    expect(screen.getByTestId("pan-x-neutral")).toBeInTheDocument();
    // La hauteur synthétique n'est appliquée qu'une fois la mesure faite.
    expect(section.style.height).not.toBe(`${SCROLL_DISTANCES["pan-x"]}vh`);
    expect(section.style.height).toBe("");
  });

  test("avant mesure : l'image n'est jamais rendue en mode statique écrasé (maxWidth 100%)", () => {
    mockUseReducedMotion.mockReturnValue(false);
    render(wrap(<PanXSection section={makePanXSection()} />));

    const img = screen.getByTestId("pan-x-image");
    // Path statique = image rétrécie dans le flux (3000px → viewport). Le
    // mode neutre garde la largeur réelle : c'est exactement ce qui évite le
    // saut de mise en page quand le ResizeObserver se déclenche.
    expect(img.style.maxWidth).not.toBe("100%");
    expect(img.style.width).toBe("3000px");
    expect(img.style.height).toBe("800px");
  });

  test("la bascule neutre → scroll conserve la même boîte visible (un écran, overflow caché)", () => {
    mockUseReducedMotion.mockReturnValue(false);
    render(wrap(<PanXSection section={makePanXSection()} />));

    const neutral = screen.getByTestId("pan-x-neutral");
    expect(neutral.className).toContain("h-screen");
    expect(neutral.className).toContain("overflow-hidden");

    triggerResizeObserver(800);

    const sticky = screen.getByTestId("pan-x-sticky");
    expect(sticky.className).toContain("h-screen");
    expect(sticky.className).toContain("overflow-hidden");
    expect(screen.queryByTestId("pan-x-neutral")).not.toBeInTheDocument();
    // Une seule transition de hauteur : auto (un écran) → 300vh, jamais de
    // passage par une hauteur intermédiaire.
    expect(screen.getByTestId("pan-x-section").style.height).toBe(
      `${SCROLL_DISTANCES["pan-x"]}vh`,
    );
    // L'image garde ses dimensions réelles : rien ne bouge dans le premier écran.
    expect(screen.getByTestId("pan-x-image").style.width).toBe("3000px");
  });

  test("après mesure le mode scroll reste stable sur un nouveau déclenchement identique", () => {
    mockUseReducedMotion.mockReturnValue(false);
    render(wrap(<PanXSection section={makePanXSection()} />));

    triggerResizeObserver(800);
    const firstHeight = screen.getByTestId("pan-x-section").style.height;

    triggerResizeObserver(800);
    expect(screen.getByTestId("pan-x-section").style.height).toBe(firstHeight);
    expect(screen.getByTestId("pan-x-sticky")).toBeInTheDocument();
  });
});

describe("PanXSection — média manquant", () => {
  function makeSectionWithoutMedia(): SectionWithImages {
    return makePanXSection({ images: [] }, { imagePath: "" });
  }

  test("sans chemin d'image : placeholder borné rendu, image/sticky absents", () => {
    mockUseReducedMotion.mockReturnValue(false);
    render(wrap(<PanXSection section={makeSectionWithoutMedia()} />));

    expect(screen.getByTestId("pan-x-placeholder")).toBeInTheDocument();
    expect(screen.queryByTestId("pan-x-image")).not.toBeInTheDocument();
    expect(screen.queryByTestId("pan-x-sticky")).not.toBeInTheDocument();
    expect(screen.queryByTestId("pan-x-neutral")).not.toBeInTheDocument();
    expect(screen.getByTestId("pan-x-section").style.height).toBe("");
  });

  test("sans média, une mesure de viewport ne déclenche jamais le scroll de 300vh", () => {
    mockUseReducedMotion.mockReturnValue(false);
    render(wrap(<PanXSection section={makeSectionWithoutMedia()} />));

    triggerResizeObserver(800);

    expect(screen.getByTestId("pan-x-placeholder")).toBeInTheDocument();
    expect(screen.queryByTestId("pan-x-sticky")).not.toBeInTheDocument();
    expect(screen.getByTestId("pan-x-section").style.height).not.toBe(
      `${SCROLL_DISTANCES["pan-x"]}vh`,
    );
  });

  test("sans média : aucune requête vers la racine du bucket storage", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://localhost:54321");
    mockUseReducedMotion.mockReturnValue(false);
    const { container } = render(
      wrap(<PanXSection section={makeSectionWithoutMedia()} />),
    );

    expect(requestedAssetUrls(container)).toEqual([]);
    expect(
      requestedAssetUrls(container).some((url) => url.endsWith("/webtoon-images/")),
    ).toBe(false);
  });

  test("chemin d'image vide sur l'ImageRecord mais média en config : repli config conservé", () => {
    mockUseReducedMotion.mockReturnValue(false);
    const section = makePanXSection({
      images: [
        {
          id: "img-empty",
          sectionId: "sec-pan",
          webtoonId: "w1",
          storagePath: "",
          width: 3000,
          height: 800,
          mimeType: "image/webp",
          position: 0,
        },
      ],
    });

    render(wrap(<PanXSection section={section} />));

    expect(screen.queryByTestId("pan-x-placeholder")).not.toBeInTheDocument();
    expect(screen.getByTestId("pan-x-image")).toHaveAttribute(
      "src",
      expect.stringContaining("test/pan.webp"),
    );
  });
});
