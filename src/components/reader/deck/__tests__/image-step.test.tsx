import type { CSSProperties } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { ImageStep } from "../ImageStep";
import { StepImage } from "../StepImage";
import type { ImageSectionConfig } from "@/types/webtoon";
import { makeImage, makeSection, wrap } from "./fixtures";

// next/image exige la config optimizer hors Next : mock qui expose les props
// utiles (dont `unoptimized`, contrainte AGENTS.md) sans les warnings DOM.
vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => {
    const {
      src,
      alt,
      width,
      height,
      loading,
      priority,
      unoptimized,
      sizes,
      loader,
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
      unoptimized?: boolean;
      sizes?: string;
      loader?: (args: { src: string; width: number }) => string;
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
        data-priority={String(priority)}
        data-unoptimized={String(unoptimized)}
        data-src={String(src)}
        data-sizes={String(sizes)}
        data-loader-url={String(loader?.({ src: String(src), width: 640 }))}
        {...rest}
      />
    );
  },
}));

// FxOverlay lit `useReducedMotion` : hors navigateur réel, on fige à false.
vi.mock("motion/react", () => ({
  useReducedMotion: () => false,
}));

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

function imageSection(
  configOverrides: Partial<ImageSectionConfig> = {},
  sectionOverrides: Parameters<typeof makeSection>[2] = {},
) {
  const config: ImageSectionConfig = {
    type: "image",
    imagePath: "test/asset.webp",
    width: 800,
    height: 1200,
    ...configOverrides,
  };
  return makeSection("image", config, { id: "sec-image", ...sectionOverrides });
}

describe("ImageStep — cadrage", () => {
  test("contain par défaut : image entière centrée, aucune animation", () => {
    render(wrap(<ImageStep section={imageSection()} />));

    const root = screen.getByTestId("image-step");
    expect(root).toHaveAttribute("data-section-id", "sec-image");
    expect(root).toHaveAttribute("data-fit", "contain");
    expect(root.className).toContain("h-full");
    expect(root.className).toContain("overflow-hidden");

    const img = screen.getByTestId("image-step-image");
    expect(img.className).toContain("object-contain");
    expect(img.className).toContain("max-h-full");
    expect(img.className).toContain("max-w-full");
    expect(img.style.objectPosition).toBe("");
    expect(img.style.transform).toBe("");
    expect(img.className).not.toContain("transition");
  });

  test.each([
    ["top", "center top"],
    ["center", "center"],
    ["bottom", "center bottom"],
  ] as const)(
    "cover focus=%s → object-position %s",
    (focus, expected) => {
      const { container } = render(
        wrap(<ImageStep section={imageSection({ fit: "cover", focus })} />),
      );

      const root = screen.getByTestId("image-step");
      expect(root).toHaveAttribute("data-fit", "cover");
      expect(root).toHaveAttribute("data-focus", focus);

      const img = screen.getByTestId("image-step-image");
      expect(img.className).toContain("object-cover");
      expect(img.className).toContain("h-full");
      expect(img.className).toContain("w-full");
      expect(img.style.objectPosition).toBe(expected);
      expect(container.querySelectorAll("img")).toHaveLength(1);
    },
  );

  test("cover sans focus → center", () => {
    render(wrap(<ImageStep section={imageSection({ fit: "cover" })} />));
    expect(screen.getByTestId("image-step-image").style.objectPosition).toBe("center");
  });

  test("width : pleine largeur, hauteur auto, centrée verticalement", () => {
    render(wrap(<ImageStep section={imageSection({ fit: "width" })} />));

    expect(screen.getByTestId("image-step")).toHaveAttribute("data-fit", "width");

    const img = screen.getByTestId("image-step-image");
    expect(img.className).toContain("w-full");
    expect(img.className).toContain("h-auto");
    expect(img.style.objectPosition).toBe("");

    const stage = img.parentElement;
    expect(stage?.className).toContain("items-center");
    expect(stage?.className).toContain("justify-center");
  });

  test("fit inconnu (données anciennes) → contain", () => {
    render(
      wrap(
        <ImageStep
          section={imageSection({ fit: "stretch" as ImageSectionConfig["fit"] })}
        />,
      ),
    );
    expect(screen.getByTestId("image-step")).toHaveAttribute("data-fit", "contain");
  });
});

describe("ImageStep — média", () => {
  test("image statique → next/image avec loader imgproxy responsive", () => {
    render(wrap(<ImageStep section={imageSection()} />));

    const img = screen.getByTestId("image-step-image");
    expect(img).toHaveAttribute("data-image-variant", "next");
    expect(img).toHaveAttribute("data-src", "test/asset.webp");
    expect(img).toHaveAttribute("data-sizes", "(max-width: 900px) 100vw, 860px");
    expect(img).toHaveAttribute("data-loader-url", expect.stringContaining("/render/image/public/"));
    expect(img).toHaveAttribute("width", "800");
    expect(img).toHaveAttribute("height", "1200");
    expect(img).toHaveAttribute("loading", "eager");
    expect(img).toHaveAttribute("alt", "Section image");
  });

  test("GIF natif (mimeType image/gif) → <img> natif avec URL objet (animation préservée)", () => {
    render(
      wrap(
        <ImageStep
          section={imageSection(
            {},
            { images: [makeImage({ storagePath: "test/anim.gif", mimeType: "image/gif" })] },
          )}
        />,
      ),
    );

    const img = screen.getByTestId("image-step-image");
    expect(img).toHaveAttribute("data-image-variant", "native");

    // IMG-4 : imgproxy ré-encode le GIF en image fixe → URL objet directe.
    const src = img.getAttribute("src") ?? "";
    expect(src).toContain("/storage/v1/object/public/webtoon-images/test/anim.gif");
    expect(src).not.toContain("/render/image/");
  });

  test("GIF détecté par extension (.gif) → <img> natif", () => {
    render(
      wrap(
        <ImageStep
          section={imageSection(
            {},
            {
              images: [
                makeImage({ storagePath: "test/loop.gif", mimeType: "image/webp" }),
              ],
            },
          )}
        />,
      ),
    );

    const img = screen.getByTestId("image-step-image");
    expect(img).toHaveAttribute("data-image-variant", "native");
    expect(img.getAttribute("src") ?? "").toContain(
      "/storage/v1/object/public/webtoon-images/test/loop.gif",
    );
  });

  test("priority → chargement eager sur next/image", () => {
    render(wrap(<ImageStep section={imageSection()} priority />));

    const img = screen.getByTestId("image-step-image");
    expect(img).toHaveAttribute("loading", "eager");
    expect(img).toHaveAttribute("data-priority", "true");
  });

  test("priority → chargement eager sur image native", () => {
    render(
      wrap(
        <ImageStep
          section={imageSection(
            {},
            { images: [makeImage({ storagePath: "test/anim.gif", mimeType: "image/gif" })] },
          )}
          priority
        />,
      ),
    );

    expect(screen.getByTestId("image-step-image")).toHaveAttribute("loading", "eager");
  });

  test("section sans image : step présent, aucun <img>", () => {
    const { container } = render(
      wrap(<ImageStep section={imageSection({}, { images: [] })} />),
    );

    expect(screen.getByTestId("image-step")).toBeInTheDocument();
    expect(container.querySelector("img")).toBeNull();
  });
});

describe("StepImage — mode de chargement", () => {
  test("défaut eager sur next/image", () => {
    render(
      wrap(
        <StepImage
          section={imageSection()}
          alt="Section image"
          testId="step-image"
          className=""
        />,
      ),
    );

    expect(screen.getByTestId("step-image")).toHaveAttribute("loading", "eager");
  });

  test("loading='lazy' sur next/image", () => {
    render(
      wrap(
        <StepImage
          section={imageSection()}
          alt="Section image"
          loading="lazy"
          testId="step-image"
          className=""
        />,
      ),
    );

    expect(screen.getByTestId("step-image")).toHaveAttribute("loading", "lazy");
  });

  test("loading='lazy' sur le <img> natif animé", () => {
    render(
      wrap(
        <StepImage
          section={imageSection(
            {},
            { images: [makeImage({ storagePath: "test/anim.gif", mimeType: "image/gif" })] },
          )}
          alt="Section image"
          loading="lazy"
          testId="step-image"
          className=""
        />,
      ),
    );

    const img = screen.getByTestId("step-image");
    expect(img).toHaveAttribute("data-image-variant", "native");
    expect(img).toHaveAttribute("loading", "lazy");
  });
});

describe("ImageStep — FX", () => {
  test("fxPath → overlay rendu au-dessus de l'image", () => {
    render(wrap(<ImageStep section={imageSection({ fxPath: "fx/snow.webp" })} />));

    const fx = screen.getByTestId("fx-overlay");
    expect(fx).toHaveAttribute("src", expect.stringContaining("fx/snow.webp"));
  });

  test("fxPath absent → aucun overlay", () => {
    render(wrap(<ImageStep section={imageSection()} />));
    expect(screen.queryByTestId("fx-overlay")).toBeNull();
  });
});
