import type { ReactElement } from "react";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";

import { SectionConfigPanel } from "../SectionConfigPanel";
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

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    storage: {
      from: vi.fn(() => ({
        upload: vi.fn().mockResolvedValue({ data: { path: "uploaded/path.webp" }, error: null }),
      })),
    },
  })),
}));

vi.mock("@/lib/image/animated", async () => {
  const actual = await vi.importActual("@/lib/image/animated");
  return {
    ...actual,
    isAnimatedImage: vi.fn(),
  };
});

vi.mock("@/lib/image/process", async () => {
  const actual = await vi.importActual("@/lib/image/process");
  return {
    ...actual,
    resizeImage: vi.fn().mockResolvedValue(new Blob(["resized"], { type: "image/webp" })),
    toWebP: vi.fn().mockResolvedValue(new Blob(["webp"], { type: "image/webp" })),
    readImageDimensions: vi.fn().mockResolvedValue({ width: 800, height: 600 }),
    buildSpriteSheet: vi.fn().mockResolvedValue({
      spriteBlob: new Blob(["sprite"], { type: "image/webp" }),
      frameWidth: 100,
      frameHeight: 100,
      columns: 4,
      rows: 3,
      frameCount: 10,
    }),
  };
});

import { resizeImage, toWebP, readImageDimensions, buildSpriteSheet } from "@/lib/image/process";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

function wrap(ui: ReactElement) {
  return (
    <NextIntlClientProvider locale="fr" messages={frMessages}>
      {ui}
    </NextIntlClientProvider>
  );
}

function makeSection(overrides: Partial<SectionWithImages> = {}): SectionWithImages {
  return {
    id: "sec-1",
    webtoonId: "w1",
    position: 1,
    type: "image",
    config: { type: "image", imagePath: "test.webp", width: 800, height: 1200 },
    audioPath: undefined,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    images: [],
    ...overrides,
  };
}

describe("SectionConfigPanel — T25", () => {
  test("renders with section type selector and close button", () => {
    const section = makeSection();
    render(wrap(<SectionConfigPanel section={section} onSectionChange={vi.fn()} onClose={vi.fn()} />));

    expect(screen.getByText("Configuration de la section")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Type de section" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Fermer le panneau" })).toBeInTheDocument();
  });

  test("type switching resets config", async () => {
    const section = makeSection({
      type: "image",
      config: { type: "image", imagePath: "test.webp", width: 800, height: 1200 },
    });
    const onChange = vi.fn();
    render(wrap(<SectionConfigPanel section={section} onSectionChange={onChange} onClose={vi.fn()} />));

    const trigger = screen.getByRole("combobox", { name: "Type de section" });
    await userEvent.click(trigger);

    const animationOption = screen.getByRole("option", { name: "Animation" });
    await userEvent.click(animationOption);

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "animation",
        config: expect.objectContaining({
          type: "animation",
          spritePath: "",
          frameWidth: 0,
          frameHeight: 0,
          columns: 0,
          rows: 0,
          frameCount: 0,
        }),
      }),
    );
  });

  test("type switching preserves audioPath", async () => {
    const section = makeSection({
      type: "image",
      audioPath: "audio/sec-1.mp3",
    });
    const onChange = vi.fn();
    render(wrap(<SectionConfigPanel section={section} onSectionChange={onChange} onClose={vi.fn()} />));

    const trigger = screen.getByRole("combobox", { name: "Type de section" });
    await userEvent.click(trigger);

    const panXOption = screen.getByRole("option", { name: "Panoramique" });
    await userEvent.click(panXOption);

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "pan-x",
        audioPath: "audio/sec-1.mp3",
      }),
    );
  });

  test("image upload flow calls resizeImage and toWebP", async () => {
    const section = makeSection({ type: "image" });
    render(wrap(<SectionConfigPanel section={section} onSectionChange={vi.fn()} onClose={vi.fn()} />));

    const fileInput = screen.getByLabelText("Uploader une image");
    const file = new File(["image-data"], "test.png", { type: "image/png" });

    fireEvent.change(fileInput, { target: { files: [file] } });

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(resizeImage).toHaveBeenCalledWith(file);
    expect(toWebP).toHaveBeenCalled();
  });

  test("animated GIF upload skips resizeImage/toWebP and uploads raw with file.type", async () => {
    const { isAnimatedImage } = await import("@/lib/image/animated");
    vi.mocked(isAnimatedImage).mockResolvedValue(true);

    const section = makeSection({ type: "image" });
    render(wrap(<SectionConfigPanel section={section} onSectionChange={vi.fn()} onClose={vi.fn()} />));

    const fileInput = screen.getByLabelText("Uploader une image");
    const file = new File(["gif-data"], "test.gif", { type: "image/gif" });

    fireEvent.change(fileInput, { target: { files: [file] } });

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(isAnimatedImage).toHaveBeenCalledWith(file);
    expect(resizeImage).not.toHaveBeenCalled();
    expect(toWebP).not.toHaveBeenCalled();
  });

  test("audio upload updates section audioPath", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test-anon-key");
    const section = makeSection({ type: "image" });
    const onChange = vi.fn();
    render(wrap(<SectionConfigPanel section={section} onSectionChange={onChange} onClose={vi.fn()} />));

    const fileInput = screen.getByLabelText("Uploader un audio");
    const file = new File(["audio-data"], "test.mp3", { type: "audio/mpeg" });

    fireEvent.change(fileInput, { target: { files: [file] } });

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        audioPath: "uploaded/path.webp",
      }),
    );
  });

  test("audio delete clears audioPath", () => {
    const section = makeSection({
      type: "image",
      audioPath: "audio/sec-1.mp3",
    });
    const onChange = vi.fn();
    render(wrap(<SectionConfigPanel section={section} onSectionChange={onChange} onClose={vi.fn()} />));

    const deleteBtn = screen.getByRole("button", { name: "Supprimer l'audio" });
    fireEvent.click(deleteBtn);

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        audioPath: undefined,
      }),
    );
  });

  test("rejects non-image files for image upload", async () => {
    const section = makeSection({ type: "image" });
    render(wrap(<SectionConfigPanel section={section} onSectionChange={vi.fn()} onClose={vi.fn()} />));

    const fileInput = screen.getByLabelText("Uploader une image");
    const file = new File(["not-an-image"], "test.txt", { type: "text/plain" });

    fireEvent.change(fileInput, { target: { files: [file] } });

    expect(await screen.findByText("Veuillez sélectionner un fichier image.")).toBeInTheDocument();
  });

  test("rejects non-audio files for audio upload", async () => {
    const section = makeSection({ type: "image" });
    render(wrap(<SectionConfigPanel section={section} onSectionChange={vi.fn()} onClose={vi.fn()} />));

    const fileInput = screen.getByLabelText("Uploader un audio");
    const file = new File(["not-audio"], "test.txt", { type: "text/plain" });

    fireEvent.change(fileInput, { target: { files: [file] } });

    expect(
      await screen.findByText("Veuillez sélectionner un fichier audio (MP3, WebM ou OGG)."),
    ).toBeInTheDocument();
  });

  test("renders live preview with SectionPreview", () => {
    const section = makeSection({ type: "image" });
    render(wrap(<SectionConfigPanel section={section} onSectionChange={vi.fn()} onClose={vi.fn()} />));

    expect(screen.getByTestId("section-preview")).toBeInTheDocument();
  });

  test("shows image count when images exist", () => {
    const section = makeSection({
      type: "image",
      images: [
        {
          id: "img-1",
          sectionId: "sec-1",
          webtoonId: "w1",
          storagePath: "test.webp",
          width: 800,
          height: 1200,
          mimeType: "image/webp",
          position: 0,
        },
      ],
    });
    render(wrap(<SectionConfigPanel section={section} onSectionChange={vi.fn()} onClose={vi.fn()} />));

    expect(screen.getByText("1 image(s)")).toBeInTheDocument();
  });
});

describe("SectionConfigPanel — media replacement", () => {
  test("replacing an image keeps only the new media as first/only record", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test-anon-key");
    const { isAnimatedImage } = await import("@/lib/image/animated");
    vi.mocked(isAnimatedImage).mockResolvedValue(false);
    vi.mocked(readImageDimensions).mockResolvedValue({ width: 800, height: 600 });

    const section = makeSection({
      type: "image",
      config: { type: "image", imagePath: "old/path.webp", width: 100, height: 100 },
      images: [
        {
          id: "img-old",
          sectionId: "sec-1",
          webtoonId: "w1",
          storagePath: "old/path.webp",
          width: 100,
          height: 100,
          mimeType: "image/webp",
          position: 0,
        },
      ],
    });
    const onChange = vi.fn();
    render(wrap(<SectionConfigPanel section={section} onSectionChange={onChange} onClose={vi.fn()} />));

    const fileInput = screen.getByLabelText("Uploader une image");
    const file = new File(["new-image"], "new.png", { type: "image/png" });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => expect(onChange).toHaveBeenCalled());
    const updated = onChange.mock.calls[onChange.mock.calls.length - 1][0] as SectionWithImages;
    expect(updated.images).toHaveLength(1);
    expect(updated.images[0].storagePath).toBe("uploaded/path.webp");
    expect(updated.config).toMatchObject({
      imagePath: "uploaded/path.webp",
      width: 800,
      height: 600,
    });
  });

  test("replacing image media with an animation sprite matches record path and dimensions", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test-anon-key");
    vi.mocked(buildSpriteSheet).mockResolvedValue({
      spriteBlob: new Blob(["sprite"], { type: "image/webp" }),
      frameWidth: 100,
      frameHeight: 100,
      columns: 4,
      rows: 3,
      frameCount: 10,
    });

    const section = makeSection({
      type: "animation",
      config: {
        type: "animation",
        spritePath: "old/sprite.webp",
        frameWidth: 50,
        frameHeight: 50,
        columns: 2,
        rows: 2,
        frameCount: 4,
      },
      images: [
        {
          id: "img-old",
          sectionId: "sec-1",
          webtoonId: "w1",
          storagePath: "old/sprite.webp",
          width: 100,
          height: 100,
          mimeType: "image/webp",
          position: 0,
        },
      ],
    });
    const onChange = vi.fn();
    render(wrap(<SectionConfigPanel section={section} onSectionChange={onChange} onClose={vi.fn()} />));

    const fileInput = screen.getByLabelText("Uploader les frames d'animation");
    const file = new File(["frame"], "frame.png", { type: "image/png" });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => expect(onChange).toHaveBeenCalled());
    const updated = onChange.mock.calls[onChange.mock.calls.length - 1][0] as SectionWithImages;
    expect(updated.config).toMatchObject({
      type: "animation",
      spritePath: "uploaded/path.webp",
    });
    expect(updated.images).toHaveLength(1);
    expect(updated.images[0].storagePath).toBe("uploaded/path.webp");
    expect(updated.images[0].width).toBe(100 * 4);
    expect(updated.images[0].height).toBe(100 * 3);
  });

  test("switching between compatible image/long-y/pan-x preserves imagePath/dimensions/images", async () => {
    const section = makeSection({
      type: "image",
      config: { type: "image", imagePath: "uploaded/path.webp", width: 800, height: 600 },
      images: [
        {
          id: "img-1",
          sectionId: "sec-1",
          webtoonId: "w1",
          storagePath: "uploaded/path.webp",
          width: 800,
          height: 600,
          mimeType: "image/webp",
          position: 0,
        },
      ],
    });
    const onChange = vi.fn();
    render(wrap(<SectionConfigPanel section={section} onSectionChange={onChange} onClose={vi.fn()} />));

    const trigger = screen.getByRole("combobox", { name: "Type de section" });
    await userEvent.click(trigger);
    const longYOption = screen.getByRole("option", { name: "Défilement long" });
    await userEvent.click(longYOption);

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "long-y",
        config: expect.objectContaining({
          type: "long-y",
          imagePath: "uploaded/path.webp",
          width: 800,
          height: 600,
        }),
        images: expect.arrayContaining([
          expect.objectContaining({ storagePath: "uploaded/path.webp" }),
        ]),
      }),
    );
  });
});

describe("SectionConfigPanel — T13 FX section", () => {
  test("rejects non-animated GIF for FX upload with error message", async () => {
    const { isAnimatedImage } = await import("@/lib/image/animated");
    vi.mocked(isAnimatedImage).mockResolvedValue(false);

    const section = makeSection({ type: "image" });
    render(wrap(<SectionConfigPanel section={section} onSectionChange={vi.fn()} onClose={vi.fn()} />));

    const fileInput = screen.getByLabelText("Charger une image FX");
    const file = new File(["gif-data"], "test.gif", { type: "image/gif" });

    fireEvent.change(fileInput, { target: { files: [file] } });

    expect(await screen.findByText("Veuillez sélectionner un fichier GIF ou WebP animé.")).toBeInTheDocument();
  });

  test("animated GIF FX upload sets fxPath with contentType image/gif", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test-anon-key");

    const { isAnimatedImage } = await import("@/lib/image/animated");
    vi.mocked(isAnimatedImage).mockResolvedValue(true);

    const section = makeSection({ type: "image" });
    const onChange = vi.fn();
    render(wrap(<SectionConfigPanel section={section} onSectionChange={onChange} onClose={vi.fn()} />));

    const fileInput = screen.getByLabelText("Charger une image FX");
    const file = new File(["gif-data"], "test.gif", { type: "image/gif" });

    fireEvent.change(fileInput, { target: { files: [file] } });

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(isAnimatedImage).toHaveBeenCalledWith(file);
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({
          fxPath: "uploaded/path.webp",
          fxConfig: expect.objectContaining({
            position: { x: "center", y: "center" },
            size: { mode: "percent", width: 100 },
            opacity: 1,
          }),
        }),
      }),
    );
  });

  test("changing FX opacity calls onSectionChange with fxConfig.opacity = value/100", () => {
    const section = makeSection({
      type: "image",
      config: {
        type: "image",
        imagePath: "test.webp",
        width: 800,
        height: 1200,
        fxPath: "fx/test.gif",
        fxConfig: {
          position: { x: "center", y: "center" },
          size: { mode: "percent", width: 100 },
          opacity: 1,
        },
      },
    });
    const onChange = vi.fn();
    render(wrap(<SectionConfigPanel section={section} onSectionChange={onChange} onClose={vi.fn()} />));

    const slider = screen.getByRole("slider");
    fireEvent.change(slider, { target: { value: "50" } });

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({
          fxConfig: expect.objectContaining({
            opacity: 0.5,
          }),
        }),
      }),
    );
  });

  test("FX controls are not rendered for pan-x and animation sections", () => {
  const panXSection = makeSection({ type: "pan-x" });
  render(wrap(<SectionConfigPanel section={panXSection} onSectionChange={vi.fn()} onClose={vi.fn()} />));
  expect(screen.queryByText("FX (animation superposée)")).not.toBeInTheDocument();

  const animationSection = makeSection({
    type: "animation",
    config: {
      type: "animation",
      spritePath: "sprite.webp",
      frameWidth: 100,
      frameHeight: 100,
      columns: 4,
      rows: 3,
      frameCount: 10,
    },
  });
  cleanup();
  render(wrap(<SectionConfigPanel section={animationSection} onSectionChange={vi.fn()} onClose={vi.fn()} />));
  expect(screen.queryByText("FX (animation superposée)")).not.toBeInTheDocument();
});
});
