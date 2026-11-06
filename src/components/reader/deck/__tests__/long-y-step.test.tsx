import type { CSSProperties } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { LongYStep } from "../LongYStep";
import type { LongYSectionConfig } from "@/types/webtoon";
import { makeImage, makeSection, wrap } from "./fixtures";

const imageMock = vi.hoisted(() => ({
  loader: undefined as
    | undefined
    | ((args: { src: string; width: number; quality?: number }) => string),
}));

vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => {
    const {
      src,
      alt,
      width,
      height,
      loading,
      priority,
      sizes,
      loader,
      decoding,
      draggable,
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
      priority?: boolean;
      sizes?: string;
      loader?: (args: { src: string; width: number; quality?: number }) => string;
      decoding?: "async" | "sync" | "auto";
      draggable?: boolean;
      unoptimized?: boolean;
      className?: string;
      style?: CSSProperties;
    };
    imageMock.loader = loader;
    return (
      <img
        src={src}
        alt={alt}
        width={width}
        height={height}
        loading={loading}
        sizes={sizes}
        decoding={decoding}
        draggable={draggable}
        className={className}
        style={style}
        data-priority={String(priority)}
        data-draggable={String(draggable)}
        data-unoptimized={String(Boolean(unoptimized))}
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

/** Le contenu doit être marqué comme décodé pour autoriser les gestes. */
function markImageReady(root: HTMLElement = document.body) {
  const img = root.querySelector("img");
  if (!img) return;
  Object.defineProperty(img, "complete", { value: true, configurable: true });
  Object.defineProperty(img, "naturalHeight", { value: 4000, configurable: true });
  Object.defineProperty(img, "naturalWidth", { value: 800, configurable: true });
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

describe("LongYStep — restauration de position", () => {
  test("applique la position initiale et remonte les changements", () => {
    const onScrollTopChange = vi.fn();
    render(
      wrap(
        <LongYStep
          section={longSection()}
          onBoundary={vi.fn()}
          initialScrollTop={420}
          onScrollTopChange={onScrollTopChange}
        />,
      ),
    );

    const scroller = screen.getByTestId("long-y-scroll");
    expect(scroller.scrollTop).toBe(420);

    Object.defineProperty(scroller, "scrollTop", { value: 760, writable: true });
    fireEvent.scroll(scroller);
    expect(onScrollTopChange).toHaveBeenCalledWith(760);
  });
});

describe("LongYStep — conteneur de scroll", () => {
  test("écran plein, défilement piloté (pas de scroll natif)", () => {
    render(wrap(<LongYStep section={longSection()} onBoundary={vi.fn()} />));

    const root = screen.getByTestId("long-y-step");
    expect(root).toHaveAttribute("data-section-id", "sec-long");

    const scroller = screen.getByTestId("long-y-scroll");
    expect(scroller.className).toContain("h-full");
    expect(scroller.className).toContain("overflow-hidden");
    expect(scroller.className).not.toContain("overflow-y-auto");
  });

  test("image pleine largeur, hauteur naturelle (pas de recadrage)", () => {
    render(wrap(<LongYStep section={longSection()} onBoundary={vi.fn()} />));

    const img = screen.getByTestId("long-y-step-image");
    expect(img.className).toContain("w-full");
    expect(img.className).toContain("h-auto");
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

describe("LongYStep — planche tuilée", () => {
  const tileSection = () =>
    longSection({
      height: 10000,
      tileHeight: 4096,
      tiles: ["tiles/0.webp", "tiles/1.webp", "tiles/2.webp"],
    });

  test("3 tuiles → 3 images, première prioritaire, suivantes paresseuses", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://supabase.example.com");
    render(wrap(<LongYStep section={tileSection()} onBoundary={vi.fn()} />));

    expect(screen.getAllByTestId(/long-y-tile-/)).toHaveLength(3);
    expect(screen.getByTestId("long-y-step-image").tagName).toBe("DIV");

    const first = screen.getByTestId("long-y-tile-0");
    expect(first).toHaveAttribute("src", "tiles/0.webp");
    expect(first).toHaveAttribute("loading", "eager");
    expect(first).toHaveAttribute("data-priority", "true");
    expect(first).toHaveAttribute("sizes", "100vw");
    expect(first).toHaveAttribute("decoding", "async");
    expect(first).toHaveAttribute("draggable", "false");
    expect(first).toHaveAttribute("data-unoptimized", "false");

    const second = screen.getByTestId("long-y-tile-1");
    expect(second).toHaveAttribute("src", "tiles/1.webp");
    expect(second).toHaveAttribute("loading", "lazy");
    expect(second).toHaveAttribute("data-priority", "false");

    const third = screen.getByTestId("long-y-tile-2");
    expect(third).toHaveAttribute("loading", "lazy");
  });

  test("largeur partagée et hauteurs exactes, dernière tuile plus courte", () => {
    render(wrap(<LongYStep section={tileSection()} onBoundary={vi.fn()} />));

    const heights = [0, 1, 2].map((index) => {
      const tile = screen.getByTestId(`long-y-tile-${index}`);
      expect(tile).toHaveAttribute("width", "800");
      return Number(tile.getAttribute("height"));
    });
    expect(heights).toEqual([4096, 4096, 10000 - 2 * 4096]);
  });

  test("le loader des tuiles passe par imgproxy (~960 px)", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://supabase.example.com");
    render(wrap(<LongYStep section={tileSection()} onBoundary={vi.fn()} />));

    const url = imageMock.loader?.({ src: "tiles/0.webp", width: 960 });
    expect(url).toContain("/storage/v1/render/image/public/webtoon-images/");
    expect(url).toContain("tiles/0.webp");
    expect(url).toContain("width=960");
  });

  test("moins de 2 tuiles → rendu mono-image historique", () => {
    render(
      wrap(
        <LongYStep
          section={longSection({ tiles: ["tiles/0.webp"] })}
          onBoundary={vi.fn()}
        />,
      ),
    );

    expect(screen.queryByTestId("long-y-tile-0")).not.toBeInTheDocument();
    const image = screen.getByTestId("long-y-step-image");
    expect(image.tagName).toBe("IMG");
  });
});

describe("LongYStep — frontières", () => {
  test("wheel vers le haut en butée haute → onBoundary('top')", () => {
    const onBoundary = vi.fn();
    render(wrap(<LongYStep section={longSection()} onBoundary={onBoundary} />));

    markImageReady();
    const scroller = screen.getByTestId("long-y-scroll");
    setScrollMetrics(scroller, { scrollTop: 0, clientHeight: 800, scrollHeight: 4000 });

    fireEvent.wheel(scroller, { deltaY: -240 });

    expect(onBoundary).toHaveBeenCalledTimes(1);
    expect(onBoundary).toHaveBeenCalledWith("top");
  });

  test("wheel vers le bas en butée basse → onBoundary('bottom')", () => {
    const onBoundary = vi.fn();
    render(wrap(<LongYStep section={longSection()} onBoundary={onBoundary} />));

    markImageReady();
    const scroller = screen.getByTestId("long-y-scroll");
    setScrollMetrics(scroller, { scrollTop: 3200, clientHeight: 800, scrollHeight: 4000 });

    fireEvent.wheel(scroller, { deltaY: 240 });

    expect(onBoundary).toHaveBeenCalledTimes(1);
    expect(onBoundary).toHaveBeenCalledWith("bottom");
  });

  test("wheel au milieu du contenu → aucun appel (le scroll natif suffit)", () => {
    const onBoundary = vi.fn();
    render(wrap(<LongYStep section={longSection()} onBoundary={onBoundary} />));

    markImageReady();
    const scroller = screen.getByTestId("long-y-scroll");
    setScrollMetrics(scroller, { scrollTop: 1200, clientHeight: 800, scrollHeight: 4000 });

    fireEvent.wheel(scroller, { deltaY: 240 });
    fireEvent.wheel(scroller, { deltaY: -240 });

    expect(onBoundary).not.toHaveBeenCalled();
  });

  test("un geste en butée ne déclenche qu'un seul passage (pas de saut multiple)", () => {
    const onBoundary = vi.fn();
    render(wrap(<LongYStep section={longSection()} onBoundary={onBoundary} />));

    markImageReady();
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

    markImageReady();
    const scroller = screen.getByTestId("long-y-scroll");
    setScrollMetrics(scroller, { scrollTop: 0, clientHeight: 800, scrollHeight: 4000 });

    fireEvent.wheel(scroller, { deltaY: -240 });
    expect(onBoundary).toHaveBeenCalledTimes(1);

    // L'utilisateur redescend dans le contenu : la butée haute est réarmée,
    // puis un nouveau geste vers le haut en butée repasse la frontière.
    fireEvent.wheel(scroller, { deltaY: 240 });
    fireEvent.wheel(scroller, { deltaY: -240 });
    fireEvent.wheel(scroller, { deltaY: -240 });

    expect(onBoundary).toHaveBeenCalledTimes(2);
  });

  test("tactile : un geste qui dépasse le bas quitte l'étape", () => {
    const onBoundary = vi.fn();
    render(wrap(<LongYStep section={longSection()} onBoundary={onBoundary} />));

    markImageReady();
    const scroller = screen.getByTestId("long-y-scroll");
    setScrollMetrics(scroller, { scrollTop: 3200, clientHeight: 800, scrollHeight: 4000 });

    fireEvent.touchStart(scroller, { touches: [{ clientY: 700 }] });
    fireEvent.touchMove(scroller, { touches: [{ clientY: 200 }] });
    fireEvent.touchEnd(scroller, { changedTouches: [] });

    expect(onBoundary).toHaveBeenCalledWith("bottom");
  });

  test("tactile : un geste qui dépasse le haut revient en arrière", () => {
    const onBoundary = vi.fn();
    render(wrap(<LongYStep section={longSection()} onBoundary={onBoundary} />));

    markImageReady();
    const scroller = screen.getByTestId("long-y-scroll");
    setScrollMetrics(scroller, { scrollTop: 0, clientHeight: 800, scrollHeight: 4000 });

    fireEvent.touchStart(scroller, { touches: [{ clientY: 200 }] });
    fireEvent.touchMove(scroller, { touches: [{ clientY: 700 }] });
    fireEvent.touchEnd(scroller, { changedTouches: [] });

    expect(onBoundary).toHaveBeenCalledWith("top");
  });

  test("direction opposée à la butée → aucun appel", () => {
    const onBoundary = vi.fn();
    render(wrap(<LongYStep section={longSection()} onBoundary={onBoundary} />));

    markImageReady();
    const scroller = screen.getByTestId("long-y-scroll");
    setScrollMetrics(scroller, { scrollTop: 0, clientHeight: 800, scrollHeight: 4000 });

    fireEvent.wheel(scroller, { deltaY: 240 });
    expect(onBoundary).not.toHaveBeenCalled();
  });
});

describe("LongYStep — robustesse molette (RD-2, RD-3, RD-8)", () => {
  test("image 404 (naturalHeight = 0) : la molette ne bloque pas la navigation", () => {
    const onBoundary = vi.fn();
    render(wrap(<LongYStep section={longSection()} onBoundary={onBoundary} />));

    const scroller = screen.getByTestId("long-y-scroll");
    setScrollMetrics(scroller, { scrollTop: 0, clientHeight: 800, scrollHeight: 4000 });

    // Aucun `markImageReady` : l'image n'est pas décodée (404).
    fireEvent.wheel(scroller, { deltaY: -240 });
    expect(onBoundary).toHaveBeenCalledWith("top");
  });

  test("deltaMode ligne (Firefox) : 12 lignes défilent de 192 px", () => {
    const onBoundary = vi.fn();
    render(wrap(<LongYStep section={longSection()} onBoundary={onBoundary} />));

    const scroller = screen.getByTestId("long-y-scroll");
    setScrollMetrics(scroller, { scrollTop: 0, clientHeight: 800, scrollHeight: 4000 });

    fireEvent.wheel(scroller, { deltaY: 12, deltaMode: 1 });
    expect(scroller.scrollTop).toBe(192);
    expect(onBoundary).not.toHaveBeenCalled();
  });

  test("Ctrl + molette : le zoom navigateur n'est pas intercepté", () => {
    const onBoundary = vi.fn();
    render(wrap(<LongYStep section={longSection()} onBoundary={onBoundary} />));

    const scroller = screen.getByTestId("long-y-scroll");
    setScrollMetrics(scroller, { scrollTop: 0, clientHeight: 800, scrollHeight: 4000 });

    const notCanceled = fireEvent.wheel(scroller, { deltaY: -240, ctrlKey: true });
    expect(notCanceled).toBe(true);
    expect(onBoundary).not.toHaveBeenCalled();
  });

  test("pincement à deux doigts : le scroll n'est pas intercepté", () => {
    render(wrap(<LongYStep section={longSection()} onBoundary={vi.fn()} />));

    const scroller = screen.getByTestId("long-y-scroll");
    setScrollMetrics(scroller, { scrollTop: 0, clientHeight: 800, scrollHeight: 4000 });

    fireEvent.touchStart(scroller, { touches: [{ clientY: 500 }, { clientY: 520 }] });
    const notCanceled = fireEvent.touchMove(scroller, {
      touches: [
        { clientY: 200 },
        { clientY: 220 },
      ],
    });
    expect(notCanceled).toBe(true);
  });
});

describe("LongYStep — reset token (RD-7)", () => {
  test("un changement de resetToken remet le défilement en haut", () => {
    const { rerender } = render(
      wrap(<LongYStep section={longSection()} onBoundary={vi.fn()} resetToken={0} />),
    );

    const scroller = screen.getByTestId("long-y-scroll");
    Object.defineProperty(scroller, "scrollTop", {
      value: 640,
      writable: true,
      configurable: true,
    });

    rerender(
      wrap(<LongYStep section={longSection()} onBoundary={vi.fn()} resetToken={1} />),
    );

    expect(scroller.scrollTop).toBe(0);
  });
});

describe("LongYStep — resetToken au remontage", () => {
  test("un token déjà incrémenté ne écrase pas la position restaurée", () => {
    render(
      wrap(
        <LongYStep
          section={longSection()}
          onBoundary={vi.fn()}
          initialScrollTop={420}
          resetToken={2}
        />,
      ),
    );

    expect(screen.getByTestId("long-y-scroll").scrollTop).toBe(420);
  });
});
