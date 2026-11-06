import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { AnimationStep } from "../AnimationStep";
import { getSupabasePublicObjectUrl } from "@/lib/supabase/public-url";
import type { AnimationSectionConfig } from "@/types/webtoon";
import { makeImage, makeSection, wrap } from "./fixtures";

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

const baseConfig: AnimationSectionConfig = {
  type: "animation",
  spritePath: "sprites/walk.webp",
  frameWidth: 100,
  frameHeight: 100,
  columns: 3,
  rows: 2,
  frameCount: 6,
};

function animationSection(
  configOverrides: Partial<AnimationSectionConfig> = {},
  sectionOverrides: Parameters<typeof makeSection>[2] = {},
) {
  return makeSection(
    "animation",
    { ...baseConfig, ...configOverrides },
    {
      id: "sec-anim",
      images: [makeImage({ storagePath: "sprites/walk.webp" })],
      ...sectionOverrides,
    },
  );
}

function frameIndex(): number {
  return Number(screen.getByTestId("animation-step-frame").dataset.frameIndex);
}

describe("AnimationStep — frames individuelles", () => {
  const frames = Array.from({ length: 10 }, (_, i) => `sprites/f${i}.webp`);

  test("affiche une seule frame et précharge les voisines", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://supabase.example.com");
    render(
      wrap(
        <AnimationStep
          section={animationSection({ framePaths: frames, frameCount: 10 })}
          progress={0.5}
        />,
      ),
    );

    const frame = screen.getByTestId("animation-step-frame");
    expect(frame).toHaveAttribute("src", getSupabasePublicObjectUrl("sprites/f5.webp"));
    expect(frame).toHaveAttribute("data-frame-index", "5");

    const preloads = document.querySelectorAll("[data-preload-frame]");
    expect(preloads).toHaveLength(6);
    for (const node of preloads) {
      expect((node as HTMLElement).style.display).toBe("none");
    }
  });

  test("aux extrémités, seules les frames existantes sont préchargées", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://supabase.example.com");
    render(
      wrap(
        <AnimationStep
          section={animationSection({ framePaths: frames, frameCount: 10 })}
          progress={0}
        />,
      ),
    );

    expect(document.querySelectorAll("[data-preload-frame]")).toHaveLength(3);
  });
});

describe("AnimationStep — garde-fou mémoire", () => {
  test("une sprite démesurée affiche un placeholder au lieu de planter", () => {
    render(
      wrap(
        <AnimationStep
          section={animationSection({
            frameWidth: 1600,
            frameHeight: 1600,
            columns: 10,
            rows: 10,
            frameCount: 100,
          })}
          progress={0.4}
        />,
      ),
    );

    expect(screen.getByTestId("animation-step-too-large")).toBeInTheDocument();
    expect(screen.queryByTestId("animation-step-frame")).not.toBeInTheDocument();
  });
});

describe("AnimationStep — frame pilotée par la progression", () => {
  test("frame = floor(progress * frameCount), sans interpolation", () => {
    const { rerender } = render(
      wrap(<AnimationStep section={animationSection()} progress={0} />),
    );
    expect(frameIndex()).toBe(0);

    rerender(wrap(<AnimationStep section={animationSection()} progress={0.34} />));
    expect(frameIndex()).toBe(1); // zone morte de 12 % en entrée

    rerender(wrap(<AnimationStep section={animationSection()} progress={0.5} />));
    expect(frameIndex()).toBe(3); // floor(3.0)

    rerender(wrap(<AnimationStep section={animationSection()} progress={0.99} />));
    expect(frameIndex()).toBe(5); // floor(5.94)
  });

  test("progress 1 → dernière frame, jamais hors grille", () => {
    const { rerender } = render(
      wrap(<AnimationStep section={animationSection()} progress={1} />),
    );
    expect(frameIndex()).toBe(5);
    expect(screen.getByTestId("animation-step-frame")).toHaveAttribute(
      "data-frame-count",
      "6",
    );

    rerender(wrap(<AnimationStep section={animationSection()} progress={2} />));
    expect(frameIndex()).toBe(5);
  });

  test("background-position suit la grille 2D (colonnes × lignes)", () => {
    const { rerender } = render(
      wrap(<AnimationStep section={animationSection()} progress={0} />),
    );
    const frame = screen.getByTestId("animation-step-frame");
    expect(frame.style.backgroundImage).toBe(
      `url("${getSupabasePublicObjectUrl("sprites/walk.webp")}")`,
    );
    expect(frame.style.backgroundSize).toBe("300% 200%");
    expect(frame.style.backgroundPosition).toBe("0% 0%");
    expect(frame.style.backgroundRepeat).toBe("no-repeat");

    // frame 4 → colonne 1, ligne 1
    rerender(wrap(<AnimationStep section={animationSection()} progress={4 / 6} />));
    expect(frameIndex()).toBe(4);
    expect(frame.style.backgroundPosition).toBe("50% 100%");
  });

  test("géométrie relative : le sprite se met à l'échelle du conteneur", () => {
    const { rerender } = render(
      wrap(<AnimationStep section={animationSection()} progress={0} />),
    );
    const frame = screen.getByTestId("animation-step-frame");

    // La taille de fond est exprimée en pourcentage de la frame rendue, pas en
    // pixels absolus : une frame réduite par max-width reste entière.
    expect(frame.style.backgroundSize).toBe("300% 200%");
    expect(frame.style.backgroundPosition).toContain("%");

    // frame 5 (dernière) → colonne 2, ligne 1
    rerender(wrap(<AnimationStep section={animationSection()} progress={1} />));
    expect(frameIndex()).toBe(5);
    expect(frame.style.backgroundPosition).toBe("100% 100%");
  });

  test("changement de frame instantané : aucun transition ni transform", () => {
    const { rerender } = render(
      wrap(<AnimationStep section={animationSection()} progress={0} />),
    );
    const frame = screen.getByTestId("animation-step-frame");
    expect(frame.className).not.toContain("transition");
    expect(frame.style.transition).toBe("");
    expect(frame.style.transform).toBe("");

    rerender(wrap(<AnimationStep section={animationSection()} progress={1} />));
    expect(screen.getByTestId("animation-step-frame").style.transition).toBe("");
  });
});

describe("AnimationStep — cadrage", () => {
  test("frame centrée à sa taille naturelle dans un écran plein", () => {
    render(wrap(<AnimationStep section={animationSection()} progress={0} />));

    const root = screen.getByTestId("animation-step");
    expect(root.className).toContain("h-full");
    expect(root.className).toContain("place-items-center");

    const frame = screen.getByTestId("animation-step-frame");
    expect(frame.style.width).toBe("100px");
    expect(frame.style.height).toBe("100px");
  });
});

describe("AnimationStep — config invalide", () => {
  test("géométrie NaN / négative → styles finis, jamais NaN", () => {
    const config = {
      ...baseConfig,
      frameWidth: Number.NaN,
      frameHeight: -4,
      columns: 0,
      rows: Number.NaN,
      frameCount: Number.NaN,
    } as AnimationSectionConfig;

    render(wrap(<AnimationStep section={animationSection(config)} progress={0.6} />));

    const frame = screen.getByTestId("animation-step-frame");
    expect(frame.style.width).toBe("1px");
    expect(frame.style.height).toBe("1px");
    expect(frame.style.backgroundSize).toBe("100% 100%");
    expect(frame.style.backgroundPosition).toBe("0% 0%");
    expect(frame.style.cssText).not.toContain("NaN");
    expect(frameIndex()).toBe(0);
  });

  test("progress non fini → première frame", () => {
    render(
      wrap(<AnimationStep section={animationSection()} progress={Number.NaN} />),
    );
    expect(frameIndex()).toBe(0);
    expect(screen.getByTestId("animation-step-frame").style.cssText).not.toContain(
      "NaN",
    );
  });

  test("sprite absent → placeholder, aucun background", () => {
    const section = animationSection(
      { spritePath: "" },
      { images: [] },
    );
    render(wrap(<AnimationStep section={section} progress={0} />));

    expect(screen.getByTestId("animation-step-placeholder")).toBeInTheDocument();
    expect(screen.queryByTestId("animation-step-frame")).toBeNull();
  });
});
