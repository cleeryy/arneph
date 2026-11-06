import type { ReactElement } from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";

import { FxOverlay } from "../FxOverlay";
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

const BASE_URL = "http://127.0.0.1:54321";

/**
 * `window.matchMedia` factice et pilotable : jsdom ne l'implémente pas.
 * Le hook local `usePrefersReducedMotion` s'abonne à `change` ; `setMatches`
 * notifie les abonnés comme le ferait le navigateur.
 */
function stubMatchMedia(initialMatches: boolean) {
  const listeners = new Set<() => void>();
  let matches = initialMatches;

  const mediaQueryList = {
    get matches() {
      return matches;
    },
    media: "(prefers-reduced-motion: reduce)",
    onchange: null,
    addEventListener: vi.fn((_type: string, listener: () => void) => {
      listeners.add(listener);
    }),
    removeEventListener: vi.fn((_type: string, listener: () => void) => {
      listeners.delete(listener);
    }),
    addListener: vi.fn((listener: () => void) => {
      listeners.add(listener);
    }),
    removeListener: vi.fn((listener: () => void) => {
      listeners.delete(listener);
    }),
    dispatchEvent: vi.fn(() => true),
  };

  vi.stubGlobal("matchMedia", vi.fn(() => mediaQueryList));

  return {
    setMatches(nextMatches: boolean) {
      matches = nextMatches;
      for (const listener of listeners) listener();
    },
  };
}

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function wrap(ui: ReactElement) {
  return (
    <NextIntlClientProvider locale="fr" messages={frMessages}>
      {ui}
    </NextIntlClientProvider>
  );
}

describe("FxOverlay", () => {
  test("rend <img> avec src = URL publique construite depuis fxPath", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", BASE_URL);
    stubMatchMedia(false);

    render(
      wrap(
        <FxOverlay
          fxPath="test/fx.gif"
          fxConfig={{
            position: { x: "center", y: "center" },
            size: { mode: "percent", width: 50 },
            opacity: 0.5,
          }}
        />,
      ),
    );

    const img = screen.getByTestId("fx-overlay");
    expect(img).toHaveAttribute(
      "src",
      `${BASE_URL}/storage/v1/object/public/webtoon-images/test/fx.gif`,
    );
  });

  test("position center → style transform translate(-50%,-50%) + top/left 50%", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", BASE_URL);
    stubMatchMedia(false);

    render(
      wrap(
        <FxOverlay
          fxPath="test/fx.gif"
          fxConfig={{
            position: { x: "center", y: "center" },
            size: { mode: "percent", width: 50 },
            opacity: 1,
          }}
        />,
      ),
    );

    const img = screen.getByTestId("fx-overlay");
    expect(img.style.position).toBe("absolute");
    expect(img.style.left).toBe("50%");
    expect(img.style.top).toBe("50%");
    expect(img.style.transform).toBe("translate(-50%, -50%)");
  });

  test("size percent width 50 → style width 50%", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", BASE_URL);
    stubMatchMedia(false);

    render(
      wrap(
        <FxOverlay
          fxPath="test/fx.gif"
          fxConfig={{
            position: { x: "left", y: "top" },
            size: { mode: "percent", width: 50 },
            opacity: 1,
          }}
        />,
      ),
    );

    const img = screen.getByTestId("fx-overlay");
    expect(img.style.width).toBe("50%");
  });

  test("opacity 0.5 → style opacity 0.5", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", BASE_URL);
    stubMatchMedia(false);

    render(
      wrap(
        <FxOverlay
          fxPath="test/fx.gif"
          fxConfig={{
            position: { x: "left", y: "top" },
            size: { mode: "px", width: 100, height: 200 },
            opacity: 0.5,
          }}
        />,
      ),
    );

    const img = screen.getByTestId("fx-overlay");
    expect(img.style.opacity).toBe("0.5");
  });

  test("reduced-motion → aria-hidden", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", BASE_URL);
    stubMatchMedia(true);

    render(
      wrap(
        <FxOverlay
          fxPath="test/fx.gif"
          fxConfig={{
            position: { x: "center", y: "center" },
            size: { mode: "percent", width: 50 },
            opacity: 0.5,
          }}
        />,
      ),
    );

    const img = screen.getByTestId("fx-overlay");
    expect(img).toHaveAttribute("aria-hidden", "true");
  });

  test("mouvement autorisé → pas d'aria-hidden", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", BASE_URL);
    stubMatchMedia(false);

    render(
      wrap(
        <FxOverlay
          fxPath="test/fx.gif"
          fxConfig={{
            position: { x: "center", y: "center" },
            size: { mode: "percent", width: 50 },
            opacity: 0.5,
          }}
        />,
      ),
    );

    expect(screen.getByTestId("fx-overlay")).not.toHaveAttribute("aria-hidden");
  });

  test("suit un changement du réglage système prefers-reduced-motion", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", BASE_URL);
    const media = stubMatchMedia(false);

    render(
      wrap(
        <FxOverlay
          fxPath="test/fx.gif"
          fxConfig={{
            position: { x: "center", y: "center" },
            size: { mode: "percent", width: 50 },
            opacity: 0.5,
          }}
        />,
      ),
    );

    expect(screen.getByTestId("fx-overlay")).not.toHaveAttribute("aria-hidden");

    act(() => media.setMatches(true));

    expect(screen.getByTestId("fx-overlay")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });

  test("matchMedia indisponible (SSR/jsdom) → mouvement autorisé", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", BASE_URL);

    render(
      wrap(
        <FxOverlay
          fxPath="test/fx.gif"
          fxConfig={{
            position: { x: "center", y: "center" },
            size: { mode: "percent", width: 50 },
            opacity: 0.5,
          }}
        />,
      ),
    );

    expect(screen.getByTestId("fx-overlay")).not.toHaveAttribute("aria-hidden");
  });
});

describe("FxOverlay integration — ImageSection", () => {
  test("pas de rendu FxOverlay si fxPath absent", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", BASE_URL);
    stubMatchMedia(false);

    const { container } = render(
      wrap(
        <FxOverlay fxPath="" fxConfig={{ position: { x: "center", y: "center" }, size: { mode: "percent", width: 50 }, opacity: 0.5 }} />,
      ),
    );

    expect(container.querySelector("img[data-testid='fx-overlay']")).toBeNull();
  });
});