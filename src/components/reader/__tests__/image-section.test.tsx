import type { ReactElement } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";

import { ImageSection } from "../ImageSection";
import { LongYSection } from "../LongYSection";
import { getSupabasePublicObjectUrl } from "@/lib/supabase/public-url";
import type { SectionWithImages } from "@/lib/db/queries";
import frMessages from "../../../../messages/fr.json";

// next/image requiert la config optimizer (hors test) → mock du composant qui
// expose les props transmises (src/width/height/loading/priority/sizes...) sur
// un <img> simple, afin de pouvoir les asserter.
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

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

const BASE_URL = "http://127.0.0.1:54321";

function wrap(ui: ReactElement) {
  return (
    <NextIntlClientProvider locale="fr" messages={frMessages}>
      {ui}
    </NextIntlClientProvider>
  );
}

function makeSection(overrides: Partial<SectionWithImages> = {}): SectionWithImages {
  return {
    id: "sec-img",
    webtoonId: "w1",
    position: 1,
    type: "image",
    config: { type: "image", imagePath: "test/cover.webp", width: 800, height: 1200 },
    audioPath: undefined,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    images: [
      {
        id: "img-1",
        sectionId: "sec-img",
        webtoonId: "w1",
        storagePath: "test/cover.webp",
        width: 800,
        height: 1200,
        mimeType: "image/webp",
        position: 0,
      },
    ],
    ...overrides,
  };
}

function makeLongYSection(overrides: Partial<SectionWithImages> = {}): SectionWithImages {
  return makeSection({
    id: "sec-long",
    type: "long-y",
    config: { type: "long-y", imagePath: "test/long.webp", width: 800, height: 4000 },
    images: [
      {
        id: "img-long",
        sectionId: "sec-long",
        webtoonId: "w1",
        storagePath: "test/long.webp",
        width: 800,
        height: 4000,
        mimeType: "image/webp",
        position: 0,
      },
    ],
    ...overrides,
  });
}

describe("ImageSection (T16) — image simple", () => {
  test("src supabase + width/height depuis l'ImageRecord (dims réelles T11)", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", BASE_URL);
    render(wrap(<ImageSection section={makeSection()} />));

    const img = screen.getByTestId("next-image");
    expect(img).toHaveAttribute(
      "src",
      `${BASE_URL}/storage/v1/object/public/webtoon-images/test/cover.webp`,
    );
    expect(img).toHaveAttribute("width", "800");
    expect(img).toHaveAttribute("height", "1200");
  });

  test("sizes ne force plus 800px — rendu à la taille réelle (shrink fix)", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", BASE_URL);
    render(wrap(<ImageSection section={makeSection()} />));

    const img = screen.getByTestId("next-image");
    expect(img).not.toHaveAttribute(
      "sizes",
      "(min-width:1024px) 800px, 100vw",
    );
    expect(img.style.maxWidth).toBe("800px");
  });

  test("loading lazy par défaut, eager + priority quand priority=true (1ère section)", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", BASE_URL);
    render(wrap(<ImageSection section={makeSection()} />));
    expect(screen.getByTestId("next-image")).toHaveAttribute("loading", "lazy");

    cleanup();
    render(wrap(<ImageSection section={makeSection()} priority />));
    const img = screen.getByTestId("next-image");
    expect(img).toHaveAttribute("loading", "eager");
    expect(img).toHaveAttribute("data-priority", "true");
  });

  test("alt i18n (fr : 'Section image') + wrapper data-section/position", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", BASE_URL);
    render(wrap(<ImageSection section={makeSection()} />));

    expect(screen.getByTestId("next-image")).toHaveAttribute("alt", "Section image");
    const wrapper = screen.getByTestId("section-image");
    expect(wrapper).toHaveAttribute("data-section", "image");
    expect(wrapper).toHaveAttribute("data-section-position", "1");
  });

  test("ratio flux natif : className h-auto w-full, aucun style transform", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", BASE_URL);
    render(wrap(<ImageSection section={makeSection()} />));

    const img = screen.getByTestId("next-image");
    expect(img.className).toContain("h-auto");
    expect(img.className).toContain("w-full");
    expect(img.style.transform).toBe("");
  });

  test("section sans image → rien rendu (pas d'<img>)", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", BASE_URL);
    const { container } = render(wrap(<ImageSection section={makeSection({ images: [] })} />));

    expect(container.querySelector("img")).toBeNull();
  });

  test("image GIF (mimeType image/gif) → <img> natif, PAS next/image", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", BASE_URL);
    render(
      wrap(
        <ImageSection
          section={makeSection({
            images: [
              {
                id: "img-gif",
                sectionId: "sec-img",
                webtoonId: "w1",
                storagePath: "test/anim.gif",
                width: 400,
                height: 300,
                mimeType: "image/gif",
                position: 0,
              },
            ],
          })}
        />
      ),
    );

    expect(screen.getByTestId("native-img")).toBeInTheDocument();
    expect(screen.queryByTestId("next-image")).not.toBeInTheDocument();
  });

  test("image GIF par extension (.gif dans le chemin) → <img> natif, PAS next/image", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", BASE_URL);
    render(
      wrap(
        <ImageSection
          section={makeSection({
            images: [
              {
                id: "img-gif2",
                sectionId: "sec-img",
                webtoonId: "w1",
                storagePath: "test/animation.gif",
                width: 500,
                height: 400,
                mimeType: "image/webp",
                position: 0,
              },
            ],
          })}
        />
      ),
    );

    expect(screen.getByTestId("native-img")).toBeInTheDocument();
    expect(screen.queryByTestId("next-image")).not.toBeInTheDocument();
  });

  test("image GIF native a loading=lazy et decoding=async", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", BASE_URL);
    render(
      wrap(
        <ImageSection
          section={makeSection({
            images: [
              {
                id: "img-gif3",
                sectionId: "sec-img",
                webtoonId: "w1",
                storagePath: "test/anim.gif",
                width: 400,
                height: 300,
                mimeType: "image/gif",
                position: 0,
              },
            ],
          })}
        />
      ),
    );

    const nativeImg = screen.getByTestId("native-img");
    expect(nativeImg).toHaveAttribute("loading", "lazy");
    expect(nativeImg).toHaveAttribute("decoding", "async");
  });

  test("LongYSection avec GIF → <img> natif, PAS next/image", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", BASE_URL);
    render(
      wrap(
        <LongYSection
          section={makeLongYSection({
            images: [
              {
                id: "img-long-gif",
                sectionId: "sec-long",
                webtoonId: "w1",
                storagePath: "test/long-anim.gif",
                width: 800,
                height: 4000,
                mimeType: "image/gif",
                position: 0,
              },
            ],
          })}
        />
      ),
    );

    expect(screen.getByTestId("native-img")).toBeInTheDocument();
    expect(screen.queryByTestId("next-image")).not.toBeInTheDocument();
  });
});

describe("LongYSection (T16) — image longue axe Y", () => {
  test("rend l'image haute avec width/height 800×4000 + alt i18n", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", BASE_URL);
    render(wrap(<LongYSection section={makeLongYSection()} />));

    const img = screen.getByTestId("next-image");
    expect(img).toHaveAttribute(
      "src",
      `${BASE_URL}/storage/v1/object/public/webtoon-images/test/long.webp`,
    );
    expect(img).toHaveAttribute("width", "800");
    expect(img).toHaveAttribute("height", "4000");
    expect(img).toHaveAttribute("alt", "Section défilement long");
  });

  test("flux natif : wrapper data-section=long-y, aucun transform, lazy par défaut", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", BASE_URL);
    render(wrap(<LongYSection section={makeLongYSection()} />));

    const wrapper = screen.getByTestId("section-long-y");
    expect(wrapper).toHaveAttribute("data-section", "long-y");
    const img = screen.getByTestId("next-image");
    expect(img.style.transform).toBe("");
    expect(img).toHaveAttribute("loading", "lazy");
  });

  test("priority=true → eager (première section du webtoon)", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", BASE_URL);
    render(wrap(<LongYSection section={makeLongYSection()} priority />));

    const img = screen.getByTestId("next-image");
    expect(img).toHaveAttribute("loading", "eager");
    expect(img).toHaveAttribute("data-priority", "true");
  });
});

describe("sectionImageUrl (helper URL storage)", () => {
  test("construit l'URL publique depuis NEXT_PUBLIC_SUPABASE_URL", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://proj.supabase.co");
    expect(getSupabasePublicObjectUrl("a/b.webp")).toBe(
      "https://proj.supabase.co/storage/v1/object/public/webtoon-images/a/b.webp",
    );
  });
});
