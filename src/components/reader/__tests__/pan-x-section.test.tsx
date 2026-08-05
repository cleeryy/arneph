import type { ReactElement } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";

import PanXSection from "../PanXSection";
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
  resizeCallbacks.forEach((cb) => cb([{ contentRect: { width } }]));
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
});

function wrap(ui: ReactElement) {
  return (
    <NextIntlClientProvider locale="fr" messages={frMessages}>
      {ui}
    </NextIntlClientProvider>
  );
}

function makePanXSection(overrides: Omit<Partial<SectionWithImages>, "config"> = {}): SectionWithImages {
  const config: PanXSectionConfig = {
    type: "pan-x",
    imagePath: "test/pan.webp",
    width: 3000,
    height: 800,
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
