import type { ReactElement } from "react";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";

import { PreviewRenderer } from "../PreviewRenderer";
import { ScrollScrubber } from "../ScrollScrubber";
import { SectionPreview } from "../SectionPreview";
import type { SectionWithImages } from "@/lib/db/queries";
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

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
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

function makeImageSection(overrides: Partial<SectionWithImages> = {}): SectionWithImages {
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
  return makeImageSection({
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

function makePanXSection(overrides: Partial<SectionWithImages> = {}): SectionWithImages {
  return makeImageSection({
    id: "sec-panx",
    type: "pan-x",
    config: { type: "pan-x", imagePath: "test/panx.webp", width: 2000, height: 800 },
    images: [
      {
        id: "img-panx",
        sectionId: "sec-panx",
        webtoonId: "w1",
        storagePath: "test/panx.webp",
        width: 2000,
        height: 800,
        mimeType: "image/webp",
        position: 0,
      },
    ],
    ...overrides,
  });
}

function makeAnimationSection(overrides: Partial<SectionWithImages> = {}): SectionWithImages {
  return makeImageSection({
    id: "sec-anim",
    type: "animation",
    config: {
      type: "animation",
      spritePath: "sprite.webp",
      frameWidth: 200,
      frameHeight: 150,
      columns: 4,
      rows: 3,
      frameCount: 10,
    },
    images: [
      {
        id: "img-anim",
        sectionId: "sec-anim",
        webtoonId: "w1",
        storagePath: "sprite.webp",
        width: 800,
        height: 450,
        mimeType: "image/webp",
        position: 0,
      },
    ],
    ...overrides,
  });
}

describe("ScrollScrubber — slider value → progress mapping", () => {
  test("renders with 0% / 100% labels and initial value at 0", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", BASE_URL);
    render(wrap(<ScrollScrubber progress={0} onProgressChange={vi.fn()} />));

    expect(screen.getByText("0%")).toBeInTheDocument();
    expect(screen.getByText("100%")).toBeInTheDocument();
  });

  test("slider value 0 maps to progress 0", () => {
    const onChange = vi.fn();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", BASE_URL);
    render(wrap(<ScrollScrubber progress={0} onProgressChange={onChange} />));

    const slider = screen.getByRole("slider");
    expect(slider).toBeInTheDocument();
  });

  test("slider value 50 maps to progress 0.5", () => {
    const onChange = vi.fn();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", BASE_URL);
    render(wrap(<ScrollScrubber progress={0.5} onProgressChange={onChange} />));

    const slider = screen.getByRole("slider");
    expect(slider).toBeInTheDocument();
  });

  test("slider value 100 maps to progress 1", () => {
    const onChange = vi.fn();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", BASE_URL);
    render(wrap(<ScrollScrubber progress={1} onProgressChange={onChange} />));

    const slider = screen.getByRole("slider");
    expect(slider).toBeInTheDocument();
  });

  test("changing slider value calls onProgressChange with mapped progress", () => {
    const onChange = vi.fn();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", BASE_URL);
    render(wrap(<ScrollScrubber progress={0} onProgressChange={onChange} />));

    const slider = screen.getByRole("slider");
    fireEvent.change(slider, { target: { value: "50" } });
    expect(onChange).toHaveBeenCalledWith(0.5);
  });

  test("changing slider to 100 calls onProgressChange with 1", () => {
    const onChange = vi.fn();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", BASE_URL);
    render(wrap(<ScrollScrubber progress={0} onProgressChange={onChange} />));

    const slider = screen.getByRole("slider");
    fireEvent.change(slider, { target: { value: "100" } });
    expect(onChange).toHaveBeenCalledWith(1);
  });

  test("changing slider to 0 calls onProgressChange with 0", () => {
    const onChange = vi.fn();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", BASE_URL);
    render(wrap(<ScrollScrubber progress={0.5} onProgressChange={onChange} />));

    const slider = screen.getByRole("slider");
    fireEvent.change(slider, { target: { value: "0" } });
    expect(onChange).toHaveBeenCalledWith(0);
  });
});

describe("PreviewRenderer — correct component per section type", () => {
  test("image type renders the image section", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", BASE_URL);
    render(wrap(<PreviewRenderer section={makeImageSection()} />));

    expect(screen.getByTestId("section-image")).toBeInTheDocument();
  });

  test("long-y type renders the long-y section", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", BASE_URL);
    render(wrap(<PreviewRenderer section={makeLongYSection()} />));

    expect(screen.getByTestId("section-long-y")).toBeInTheDocument();
  });

  test("pan-x type renders a pan-x preview", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", BASE_URL);
    render(wrap(<PreviewRenderer section={makePanXSection()} />));

    expect(screen.getByTestId("preview-pan-x")).toBeInTheDocument();
    expect(screen.getByTestId("preview-pan-x")).toHaveAttribute("data-section-type", "pan-x");
  });

  test("animation type renders an animation preview", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", BASE_URL);
    render(wrap(<PreviewRenderer section={makeAnimationSection()} />));

    expect(screen.getByTestId("preview-animation")).toBeInTheDocument();
    expect(screen.getByTestId("preview-animation")).toHaveAttribute("data-section-type", "animation");
  });

  test("pan-x preview at progress 0 shows image at leftmost position", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", BASE_URL);
    render(wrap(<PreviewRenderer section={makePanXSection()} progress={0} />));

    const preview = screen.getByTestId("preview-pan-x");
    expect(preview).toBeInTheDocument();
  });

  test("pan-x preview at progress 1 shows image panned to the right", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", BASE_URL);
    render(wrap(<PreviewRenderer section={makePanXSection()} progress={1} />));

    const preview = screen.getByTestId("preview-pan-x");
    expect(preview).toBeInTheDocument();
  });

  test("animation preview at progress 0 shows first frame", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", BASE_URL);
    render(wrap(<PreviewRenderer section={makeAnimationSection()} progress={0} />));

    const preview = screen.getByTestId("preview-animation");
    expect(preview).toBeInTheDocument();
  });

  test("animation preview at progress 1 shows last frame", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", BASE_URL);
    render(wrap(<PreviewRenderer section={makeAnimationSection()} progress={1} />));

    const preview = screen.getByTestId("preview-animation");
    expect(preview).toBeInTheDocument();
  });
});

describe("SectionPreview — combines PreviewRenderer + ScrollScrubber", () => {
  test("renders PreviewRenderer for pan-x sections", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", BASE_URL);
    render(wrap(<SectionPreview section={makePanXSection()} />));

    expect(screen.getByTestId("preview-pan-x")).toBeInTheDocument();
  });

  test("renders PreviewRenderer for animation sections", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", BASE_URL);
    render(wrap(<SectionPreview section={makeAnimationSection()} />));

    expect(screen.getByTestId("preview-animation")).toBeInTheDocument();
  });

  test("renders ScrollScrubber for pan-x sections", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", BASE_URL);
    render(wrap(<SectionPreview section={makePanXSection()} />));

    expect(screen.getByRole("slider")).toBeInTheDocument();
  });

  test("renders ScrollScrubber for animation sections", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", BASE_URL);
    render(wrap(<SectionPreview section={makeAnimationSection()} />));

    expect(screen.getByRole("slider")).toBeInTheDocument();
  });

  test("does NOT render ScrollScrubber for image sections", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", BASE_URL);
    render(wrap(<SectionPreview section={makeImageSection()} />));

    expect(screen.queryByRole("slider")).not.toBeInTheDocument();
  });

  test("does NOT render ScrollScrubber for long-y sections", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", BASE_URL);
    render(wrap(<SectionPreview section={makeLongYSection()} />));

    expect(screen.queryByRole("slider")).not.toBeInTheDocument();
  });

  test("has correct data-testid and data-section-type attributes", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", BASE_URL);
    render(wrap(<SectionPreview section={makePanXSection()} />));

    const container = screen.getByTestId("section-preview");
    expect(container).toHaveAttribute("data-section-type", "pan-x");
  });
});