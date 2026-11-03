import type { ReactElement } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";

import { AnimationSection } from "../AnimationSection";
import { getSupabasePublicObjectUrl } from "@/lib/supabase/public-url";
import { SCROLL_DISTANCES } from "@/lib/scroll/constants";
import type { SectionWithImages } from "@/lib/db/queries";
import type { AnimationSectionConfig } from "@/types/webtoon";
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
    // motion.div → div classique : le mock de useTransform résout déjà la
    // MotionValue en string, React applique le style directement.
    motion: {
      div: (props: Record<string, unknown>) => React.createElement("div", props),
    },
  };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://localhost:54321");
  // Le composant enchaîne 2 useTransform : (value, transformer) → transformer(value)
  // chaîne scrollYProgress (number) → frameIndex (number) → position (string).
  mockUseTransform.mockImplementation((value, transformer) => transformer(value));
  mockUseReducedMotion.mockReturnValue(false);
});

function wrap(ui: ReactElement) {
  return (
    <NextIntlClientProvider locale="fr" messages={frMessages}>
      {ui}
    </NextIntlClientProvider>
  );
}

function makeSection(config: AnimationSectionConfig): SectionWithImages {
  return {
    id: "sec-anim",
    webtoonId: "w1",
    position: 3,
    type: "animation",
    config,
    audioPath: undefined,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    images: [
      {
        id: "img-1",
        sectionId: "sec-anim",
        webtoonId: "w1",
        storagePath: config.spritePath,
        width: 800,
        height: 450,
        mimeType: "image/webp",
        position: 0,
      },
    ],
  };
}

const baseConfig: AnimationSectionConfig = {
  type: "animation",
  spritePath: "sprite.webp",
  frameWidth: 200,
  frameHeight: 150,
  columns: 4,
  rows: 3,
  frameCount: 10,
};

describe("AnimationSection — sprite sheet scroll-driven (T18)", () => {
  test("structure : section hauteur scroll, container sticky, frame en background", () => {
    mockUseScroll.mockReturnValue({ scrollYProgress: 0 });

    const { container } = render(wrap(<AnimationSection section={makeSection(baseConfig)} />));

    const section = screen.getByTestId("animation-section");
    expect(section).toBeInTheDocument();
    expect(section.style.height).toBe("200vh");
    expect(section).toHaveAttribute("data-section-type", "animation");

    const sticky = section.firstElementChild as HTMLElement;
    expect(sticky.className).toContain("sticky");
    expect(sticky.className).toContain("h-screen");
    expect(sticky.className).toContain("overflow-hidden");

    const frame = screen.getByTestId("animation-frame");
    // URL du sprite depuis l'image de la section (pas de <img> : background CSS)
    expect(frame.style.backgroundImage).toBe(
      `url("${getSupabasePublicObjectUrl("sprite.webp")}")`,
    );
    // Grille complète à l'échelle 1:1 : columns×frameWidth / rows×frameHeight
    expect(frame.style.backgroundSize).toBe("800px 450px");
    expect(frame.style.backgroundRepeat).toBe("no-repeat");
    expect(container.querySelector("img")).toBeNull();
  });

  test("background-position attendu pour des frameIndex connus (progress 0 / 0.5 / 1)", () => {
    // frame 0  → { x: 0,    y: 0 }   → "0px 0px"
    mockUseScroll.mockReturnValue({ scrollYProgress: 0 });
    const { rerender } = render(
      wrap(<AnimationSection section={makeSection(baseConfig)} />),
    );
    expect(screen.getByTestId("animation-frame").style.backgroundPosition).toBe("0px 0px");

    // progress 0.5 → Math.round(0.5×9) = frame 5 → { x: 200, y: 150 }
    mockUseScroll.mockReturnValue({ scrollYProgress: 0.5 });
    rerender(wrap(<AnimationSection section={makeSection(baseConfig)} />));
    expect(screen.getByTestId("animation-frame").style.backgroundPosition).toBe(
      "-200px -150px",
    );

    // progress 1 → frame 9 → { x: 200, y: 300 } (rangée 2 : floor(9/4)=2)
    mockUseScroll.mockReturnValue({ scrollYProgress: 1 });
    rerender(wrap(<AnimationSection section={makeSection(baseConfig)} />));
    expect(screen.getByTestId("animation-frame").style.backgroundPosition).toBe(
      "-200px -300px",
    );
  });

  test("reduced-motion : frame médiane figée, insensible au progress", () => {
    mockUseReducedMotion.mockReturnValue(true);
    // frame médiane = Math.round(9/2) = 5 → { x: 200, y: 150 }
    mockUseScroll.mockReturnValue({ scrollYProgress: 0 });
    const { rerender } = render(
      wrap(<AnimationSection section={makeSection(baseConfig)} />),
    );
    expect(screen.getByTestId("animation-frame").style.backgroundPosition).toBe(
      "-200px -150px",
    );

    // Même progress 0 sans reduced-motion donnerait frame 0 → "0px 0px" :
    // le gel sur la frame médiane est bien distinct (frame figée, pas animée).
    mockUseScroll.mockReturnValue({ scrollYProgress: 1 });
    rerender(wrap(<AnimationSection section={makeSection(baseConfig)} />));
    expect(screen.getByTestId("animation-frame").style.backgroundPosition).toBe(
      "-200px -150px",
    );
  });

  test("scrollHeight configuré remplace le défaut SCROLL_DISTANCES (200 vh)", () => {
    mockUseScroll.mockReturnValue({ scrollYProgress: 0 });

    const config = { ...baseConfig, scrollHeight: 350 };
    render(wrap(<AnimationSection section={makeSection(config)} />));

    expect(screen.getByTestId("animation-section").style.height).toBe("350vh");
  });

  test("précharge le sprite via background-image (pas de <link rel=preload> dans le DOM)", () => {
    mockUseScroll.mockReturnValue({ scrollYProgress: 0 });

    const { container } = render(wrap(<AnimationSection section={makeSection(baseConfig)} />));

    expect(container.querySelector('link[rel="preload"]')).toBeNull();
    expect(document.head.querySelector('link[rel="preload"]')).toBeNull();
  });

  test("frameCount=1 : frame médiane figée, backgroundPosition stable quel que soit le progress", () => {
    const singleFrameConfig = { ...baseConfig, frameCount: 1 };
    mockUseScroll.mockReturnValue({ scrollYProgress: 0 });
    const { rerender } = render(
      wrap(<AnimationSection section={makeSection(singleFrameConfig)} />),
    );
    expect(screen.getByTestId("animation-frame").style.backgroundPosition).toBe("0px 0px");

    mockUseScroll.mockReturnValue({ scrollYProgress: 1 });
    rerender(wrap(<AnimationSection section={makeSection(singleFrameConfig)} />));
    expect(screen.getByTestId("animation-frame").style.backgroundPosition).toBe("0px 0px");
  });

  test("backgroundSize = columns*frameWidth x rows*frameHeight (cohérent avec les dimensions réelles du sprite sheet)", () => {
    mockUseScroll.mockReturnValue({ scrollYProgress: 0 });

    render(wrap(<AnimationSection section={makeSection(baseConfig)} />));

    const frame = screen.getByTestId("animation-frame");
    expect(frame.style.backgroundSize).toBe("800px 450px");
  });

  test("sprite en secours via config.spritePath si aucune image n'est attachée", () => {
    mockUseScroll.mockReturnValue({ scrollYProgress: 0 });

    const section = makeSection(baseConfig);
    section.images = [];
    render(wrap(<AnimationSection section={section} />));

    expect(screen.getByTestId("animation-frame").style.backgroundImage).toBe(
      `url("${getSupabasePublicObjectUrl("sprite.webp")}")`,
    );
  });
});

describe("AnimationSection — config invalide clampée", () => {
  test("dimensions de frame invalides (0 / NaN / négatives) : backgroundSize finie, jamais NaN", () => {
    mockUseScroll.mockReturnValue({ scrollYProgress: 0 });

    const config = {
      ...baseConfig,
      frameWidth: 0,
      frameHeight: Number.NaN,
      columns: -3,
      rows: 0,
    } as AnimationSectionConfig;

    render(wrap(<AnimationSection section={makeSection(config)} />));

    const frame = screen.getByTestId("animation-frame");
    expect(frame.style.backgroundSize).not.toContain("NaN");
    expect(frame.style.backgroundSize).toBe("1px 1px");
    expect(frame.style.width).toBe("1px");
    expect(frame.style.height).toBe("1px");
  });

  test("frameWidth/Height non finis (Infinity, chaîne) : valeurs finies conservées côté grille", () => {
    mockUseScroll.mockReturnValue({ scrollYProgress: 0 });

    const config = {
      ...baseConfig,
      frameWidth: Number.POSITIVE_INFINITY,
      frameHeight: "150",
    } as unknown as AnimationSectionConfig;

    render(wrap(<AnimationSection section={makeSection(config)} />));

    const frame = screen.getByTestId("animation-frame");
    expect(frame.style.backgroundSize).toMatch(/^\d+px \d+px$/);
    expect(frame.style.backgroundSize).toBe("4px 3px");
  });

  test("frameCount invalide (0 / négatif / NaN) : une seule frame, position stable", () => {
    mockUseScroll.mockReturnValue({ scrollYProgress: 1 });

    const { rerender } = render(
      wrap(<AnimationSection section={makeSection({ ...baseConfig, frameCount: 0 })} />),
    );
    expect(screen.getByTestId("animation-frame").style.backgroundPosition).toBe(
      "0px 0px",
    );

    rerender(
      wrap(<AnimationSection section={makeSection({ ...baseConfig, frameCount: -7 })} />),
    );
    expect(screen.getByTestId("animation-frame").style.backgroundPosition).toBe(
      "0px 0px",
    );

    rerender(
      wrap(
        <AnimationSection section={makeSection({ ...baseConfig, frameCount: Number.NaN })} />,
      ),
    );
    const position = screen.getByTestId("animation-frame").style.backgroundPosition;
    expect(position).not.toContain("NaN");
    expect(position).toBe("0px 0px");
  });

  test("scrollHeight invalide (0 / NaN / négatif) : défaut SCROLL_DISTANCES.animation", () => {
    mockUseScroll.mockReturnValue({ scrollYProgress: 0 });

    const { rerender } = render(
      wrap(<AnimationSection section={makeSection({ ...baseConfig, scrollHeight: 0 })} />),
    );
    expect(screen.getByTestId("animation-section").style.height).toBe(
      `${SCROLL_DISTANCES.animation}vh`,
    );

    rerender(
      wrap(
        <AnimationSection section={makeSection({ ...baseConfig, scrollHeight: Number.NaN })} />,
      ),
    );
    expect(screen.getByTestId("animation-section").style.height).toBe(
      `${SCROLL_DISTANCES.animation}vh`,
    );

    rerender(
      wrap(<AnimationSection section={makeSection({ ...baseConfig, scrollHeight: -50 })} />),
    );
    expect(screen.getByTestId("animation-section").style.height).toBe(
      `${SCROLL_DISTANCES.animation}vh`,
    );
  });

  test("reduced-motion + config invalide : frame médiane figée et finie", () => {
    mockUseReducedMotion.mockReturnValue(true);
    mockUseScroll.mockReturnValue({ scrollYProgress: 1 });

    const config = {
      ...baseConfig,
      frameWidth: 0,
      frameHeight: Number.NaN,
      columns: 0,
      rows: 0,
      frameCount: Number.NaN,
    } as AnimationSectionConfig;

    render(wrap(<AnimationSection section={makeSection(config)} />));

    const position = screen.getByTestId("animation-frame").style.backgroundPosition;
    expect(position).not.toContain("NaN");
    expect(position).toBe("0px 0px");
  });
});

describe("AnimationSection — sprite manquant", () => {
  test("aucun chemin de sprite : placeholder borné, pas de frame ni de hauteur de scroll", () => {
    mockUseScroll.mockReturnValue({ scrollYProgress: 0 });

    const section = makeSection({ ...baseConfig, spritePath: "" });
    section.images = [];
    render(wrap(<AnimationSection section={section} />));

    expect(screen.getByTestId("animation-placeholder")).toBeInTheDocument();
    expect(screen.queryByTestId("animation-frame")).not.toBeInTheDocument();
    expect(screen.getByTestId("animation-section").style.height).toBe("");
  });

  test("spritePath undefined ne fait pas planter le rendu", () => {
    mockUseScroll.mockReturnValue({ scrollYProgress: 0 });

    const section = makeSection(baseConfig);
    section.images = [];
    (section.config as { spritePath?: string }).spritePath = undefined;

    expect(() => render(wrap(<AnimationSection section={section} />))).not.toThrow();
    expect(screen.getByTestId("animation-placeholder")).toBeInTheDocument();
  });

  test("sans sprite : aucune requête vers la racine du bucket storage", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://localhost:54321");
    mockUseScroll.mockReturnValue({ scrollYProgress: 0 });

    const section = makeSection({ ...baseConfig, spritePath: "" });
    section.images = [];
    const { container } = render(wrap(<AnimationSection section={section} />));

    expect(container.innerHTML).not.toContain("webtoon-images/");
    expect(container.querySelector("img")).toBeNull();
  });
});
