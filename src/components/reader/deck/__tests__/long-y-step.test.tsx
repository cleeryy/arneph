import type { CSSProperties } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { LongYStep } from "../LongYStep";
import type { LongYSectionConfig } from "@/types/webtoon";
import { makeImage, makeSection, wrap } from "./fixtures";

vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => {
    const {
      src,
      alt,
      width,
      height,
      loading,
      unoptimized,
      className,
      style,
      ...rest
    } = props as {
      src: string;
      alt: string;
      width: number;
      height: number;
      loading?: "eager" | "lazy";
      unoptimized?: boolean;
      className?: string;
      style?: CSSProperties;
    };
    return (
      <img
        src={src}
        alt={alt}
        width={width}
        height={height}
        loading={loading}
        className={className}
        style={style}
        data-unoptimized={String(unoptimized)}
        {...rest}
      />
    );
  },
}));

vi.mock("motion/react", () => ({
  useReducedMotion: () => false,
}));

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

function longSection(
  configOverrides: Partial<LongYSectionConfig> = {},
  sectionOverrides: Parameters<typeof makeSection>[2] = {},
) {
  const config: LongYSectionConfig = {
    type: "long-y",
    imagePath: "test/long.webp",
    width: 800,
    height: 4000,
    ...configOverrides,
  };
  return makeSection("long-y", config, {
    id: "sec-long",
    images: [makeImage({ storagePath: "test/long.webp", height: 4000 })],
    ...sectionOverrides,
  });
}

/** jsdom n'implémente pas le scroll : on fixe les métriques du conteneur. */
function setScrollMetrics(
  el: HTMLElement,
  metrics: { scrollTop: number; clientHeight: number; scrollHeight: number },
) {
  Object.defineProperty(el, "scrollTop", {
    value: metrics.scrollTop,
    writable: true,
    configurable: true,
  });
  Object.defineProperty(el, "clientHeight", {
    value: metrics.clientHeight,
    configurable: true,
  });
  Object.defineProperty(el, "scrollHeight", {
    value: metrics.scrollHeight,
    configurable: true,
  });
}

describe("LongYStep — conteneur de scroll", () => {
  test("écran plein avec son propre défilement borné (overscroll-contain)", () => {
    render(wrap(<LongYStep section={longSection()} onBoundary={vi.fn()} />));

    const root = screen.getByTestId("long-y-step");
    expect(root).toHaveAttribute("data-section-id", "sec-long");

    const scroller = screen.getByTestId("long-y-scroll");
    expect(scroller.className).toContain("h-full");
    expect(scroller.className).toContain("overflow-y-auto");
    expect(scroller.className).toContain("overscroll-contain");
  });

  test("image pleine largeur, hauteur naturelle (pas de recadrage)", () => {
    render(wrap(<LongYStep section={longSection()} onBoundary={vi.fn()} />));

    const img = screen.getByTestId("long-y-step-image");
    expect(img.className).toContain("w-full");
    expect(img.className).toContain("h-auto");
    expect(img).toHaveAttribute("data-unoptimized", "true");
    expect(img).toHaveAttribute("alt", "Section défilement long");
  });

  test("FX overlay rendu avec l'image", () => {
    render(
      wrap(
        <LongYStep
          section={longSection({ fxPath: "fx/rain.webp" })}
          onBoundary={vi.fn()}
        />,
      ),
    );

    expect(screen.getByTestId("fx-overlay")).toHaveAttribute(
      "src",
      expect.stringContaining("fx/rain.webp"),
    );
  });
});

describe("LongYStep — frontières", () => {
  test("wheel vers le haut en butée haute → onBoundary('top')", () => {
    const onBoundary = vi.fn();
    render(wrap(<LongYStep section={longSection()} onBoundary={onBoundary} />));

    const scroller = screen.getByTestId("long-y-scroll");
    setScrollMetrics(scroller, { scrollTop: 0, clientHeight: 800, scrollHeight: 4000 });

    fireEvent.wheel(scroller, { deltaY: -120 });

    expect(onBoundary).toHaveBeenCalledTimes(1);
    expect(onBoundary).toHaveBeenCalledWith("top");
  });

  test("wheel vers le bas en butée basse → onBoundary('bottom')", () => {
    const onBoundary = vi.fn();
    render(wrap(<LongYStep section={longSection()} onBoundary={onBoundary} />));

    const scroller = screen.getByTestId("long-y-scroll");
    setScrollMetrics(scroller, { scrollTop: 3200, clientHeight: 800, scrollHeight: 4000 });

    fireEvent.wheel(scroller, { deltaY: 120 });

    expect(onBoundary).toHaveBeenCalledTimes(1);
    expect(onBoundary).toHaveBeenCalledWith("bottom");
  });

  test("wheel au milieu du contenu → aucun appel (le scroll natif suffit)", () => {
    const onBoundary = vi.fn();
    render(wrap(<LongYStep section={longSection()} onBoundary={onBoundary} />));

    const scroller = screen.getByTestId("long-y-scroll");
    setScrollMetrics(scroller, { scrollTop: 1200, clientHeight: 800, scrollHeight: 4000 });

    fireEvent.wheel(scroller, { deltaY: 120 });
    fireEvent.wheel(scroller, { deltaY: -120 });

    expect(onBoundary).not.toHaveBeenCalled();
  });

  test("un geste en butée ne déclenche qu'un seul passage (pas de saut multiple)", () => {
    const onBoundary = vi.fn();
    render(wrap(<LongYStep section={longSection()} onBoundary={onBoundary} />));

    const scroller = screen.getByTestId("long-y-scroll");
    setScrollMetrics(scroller, { scrollTop: 0, clientHeight: 800, scrollHeight: 4000 });

    fireEvent.wheel(scroller, { deltaY: -80 });
    fireEvent.wheel(scroller, { deltaY: -80 });
    fireEvent.wheel(scroller, { deltaY: -80 });

    expect(onBoundary).toHaveBeenCalledTimes(1);
    expect(onBoundary).toHaveBeenCalledWith("top");
  });

  test("le verrou se relâche quand on repart dans le contenu", () => {
    const onBoundary = vi.fn();
    render(wrap(<LongYStep section={longSection()} onBoundary={onBoundary} />));

    const scroller = screen.getByTestId("long-y-scroll");
    setScrollMetrics(scroller, { scrollTop: 0, clientHeight: 800, scrollHeight: 4000 });

    fireEvent.wheel(scroller, { deltaY: -80 });
    expect(onBoundary).toHaveBeenCalledTimes(1);

    // L'utilisateur redescend dans le contenu : la butée haute est réarmée.
    fireEvent.wheel(scroller, { deltaY: 80 });
    fireEvent.wheel(scroller, { deltaY: -80 });

    expect(onBoundary).toHaveBeenCalledTimes(2);
  });

  test("direction opposée à la butée → aucun appel", () => {
    const onBoundary = vi.fn();
    render(wrap(<LongYStep section={longSection()} onBoundary={onBoundary} />));

    const scroller = screen.getByTestId("long-y-scroll");
    setScrollMetrics(scroller, { scrollTop: 0, clientHeight: 800, scrollHeight: 4000 });

    fireEvent.wheel(scroller, { deltaY: 120 });
    expect(onBoundary).not.toHaveBeenCalled();
  });
});
