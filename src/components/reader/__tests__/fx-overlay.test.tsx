import type { ReactElement } from "react";
import { cleanup, render, screen } from "@testing-library/react";
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

const { mockUseReducedMotion } = vi.hoisted(() => ({
  mockUseReducedMotion: vi.fn(),
}));

vi.mock("motion/react", () => ({
  useReducedMotion: mockUseReducedMotion,
}));

const BASE_URL = "http://127.0.0.1:54321";

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
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
    mockUseReducedMotion.mockReturnValue(false);

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
    mockUseReducedMotion.mockReturnValue(false);

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
    mockUseReducedMotion.mockReturnValue(false);

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
    mockUseReducedMotion.mockReturnValue(false);

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
    mockUseReducedMotion.mockReturnValue(true);

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
});

describe("FxOverlay integration — ImageSection", () => {
  test("pas de rendu FxOverlay si fxPath absent", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", BASE_URL);
    mockUseReducedMotion.mockReturnValue(false);

    const { container } = render(
      wrap(
        <FxOverlay fxPath="" fxConfig={{ position: { x: "center", y: "center" }, size: { mode: "percent", width: 50 }, opacity: 0.5 }} />,
      ),
    );

    expect(container.querySelector("img[data-testid='fx-overlay']")).toBeNull();
  });
});