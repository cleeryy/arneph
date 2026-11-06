import type { ReactElement } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";

import { SectionConfigPanel } from "../SectionConfigPanel";
import type { SectionWithImages } from "@/lib/db/queries";
import type { PanXSectionConfig } from "@/types/webtoon";
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

const { uploadSpy, removeSpy } = vi.hoisted(() => ({
  uploadSpy: vi.fn(),
  removeSpy: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => {
  uploadSpy.mockResolvedValue({ data: { path: "uploaded/path.webp" }, error: null });
  removeSpy.mockResolvedValue({ data: [], error: null });
  return {
    createClient: vi.fn(() => ({
      storage: {
        from: vi.fn(() => ({
          upload: uploadSpy,
          remove: removeSpy,
        })),
      },
    })),
  };
});

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
    sliceSpriteSheet: vi.fn().mockResolvedValue({
      frames: Array.from(
        { length: 10 },
        (_, index) => new Blob([`slice-${index}`], { type: "image/webp" }),
      ),
      frameWidth: 100,
      frameHeight: 100,
    }),
  };
});

import {
  resizeImage,
  toWebP,
  readImageDimensions,
  buildSpriteSheet,
  sliceSpriteSheet,
} from "@/lib/image/process";

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

async function selectSectionType(label: string) {
  const trigger = screen.getByRole("combobox", { name: "Type de section" });
  await userEvent.click(trigger);
  await userEvent.click(await screen.findByRole("option", { name: label }));
}

function lastCall(onChange: ReturnType<typeof vi.fn>): SectionWithImages {
  return onChange.mock.calls[onChange.mock.calls.length - 1][0] as SectionWithImages;
}

function pageImageRecord(): SectionWithImages["images"][number] {
  return {
    id: "img-page",
    sectionId: "sec-1",
    webtoonId: "w1",
    storagePath: "uploaded/page.webp",
    width: 800,
    height: 1200,
    mimeType: "image/webp",
    position: 0,
  };
}

const FX_CONFIG = {
  position: { x: "left", y: "top" },
  size: { mode: "percent", width: 50 },
  opacity: 0.4,
} as const;


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

    const animationOption = await screen.findByRole("option", { name: "Animation" });
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

    const panXOption = await screen.findByRole("option", { name: "Panoramique" });
    await userEvent.click(panXOption);

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "pan-x",
        audioPath: "audio/sec-1.mp3",
      }),
    );
  });

  test("static image upload uploads resizeImage output directly (no toWebP re-encode)", async () => {
    const resized = new Blob(["resized-webp-payload"], { type: "image/webp" });
    vi.mocked(resizeImage).mockResolvedValue(resized);

    const section = makeSection({ type: "image" });
    const onChange = vi.fn();
    render(wrap(<SectionConfigPanel section={section} onSectionChange={onChange} onClose={vi.fn()} />));

    const fileInput = screen.getByLabelText("Uploader une image");
    const file = new File(["image-data"], "test.png", { type: "image/png" });

    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => expect(uploadSpy).toHaveBeenCalledTimes(1));

    expect(resizeImage).toHaveBeenCalledWith(file, { maxDimension: 1600 });
    expect(toWebP).not.toHaveBeenCalled();
    expect(readImageDimensions).toHaveBeenCalledWith(resized);

    const [path, uploadedBlob, options] = uploadSpy.mock.calls[0] as [
      string,
      Blob,
      { contentType: string; upsert: boolean },
    ];
    expect(path).toMatch(/^webtoons\/sections\/sec-1\/\d+-test\.png$/);
    expect(uploadedBlob).toBe(resized);
    expect(uploadedBlob.type).toBe("image/webp");
    expect(uploadedBlob.size).toBe(resized.size);
    expect(options).toEqual({ contentType: "image/webp", upsert: false });

    await waitFor(() => expect(onChange).toHaveBeenCalled());
    const updated = onChange.mock.calls[onChange.mock.calls.length - 1][0] as SectionWithImages;
    expect(updated.images[0].mimeType).toBe("image/webp");
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
    const longYOption = await screen.findByRole("option", { name: "Défilement long" });
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

    // ED-5 : un seul commit par changement, pas un snapshot par tick.
    expect(onChange).toHaveBeenCalledTimes(1);
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

describe("SectionConfigPanel — FX delete label", () => {
  test("FX delete button uses editor.deleteFx, not the audio key", () => {
    const section = makeSection({
      type: "image",
      audioPath: "audio/sec-1.mp3",
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

    const fxDelete = screen.getByRole("button", { name: "Supprimer l'effet FX" });
    const audioDelete = screen.getByRole("button", { name: "Supprimer l'audio" });
    expect(fxDelete).not.toBe(audioDelete);

    fireEvent.click(fxDelete);

    const updated = lastCall(onChange);
    expect(updated.config).toMatchObject({ fxPath: undefined, fxConfig: undefined });
    // Le bouton FX ne doit pas toucher au chemin audio.
    expect(updated.audioPath).toBe("audio/sec-1.mp3");
  });
});

describe("SectionConfigPanel — type switching keeps media model consistent", () => {
  test("switching image → long-y preserves FX config and config-level audioPath", async () => {
    const section = makeSection({
      type: "image",
      audioPath: "audio/section.mp3",
      config: {
        type: "image",
        imagePath: "uploaded/page.webp",
        width: 800,
        height: 1200,
        audioPath: "audio/config.mp3",
        fxPath: "fx/overlay.gif",
        fxConfig: { ...FX_CONFIG, position: { ...FX_CONFIG.position }, size: { ...FX_CONFIG.size } },
      },
      images: [pageImageRecord()],
    });
    const onChange = vi.fn();
    render(wrap(<SectionConfigPanel section={section} onSectionChange={onChange} onClose={vi.fn()} />));

    await selectSectionType("Défilement long");

    const updated = lastCall(onChange);
    expect(updated.type).toBe("long-y");
    expect(updated.audioPath).toBe("audio/section.mp3");
    expect(updated.config).toEqual({
      type: "long-y",
      imagePath: "uploaded/page.webp",
      width: 800,
      height: 1200,
      audioPath: "audio/config.mp3",
      fxPath: "fx/overlay.gif",
      fxConfig: FX_CONFIG,
    });
    expect(updated.images).toHaveLength(1);
  });

  test("switching long-y → image preserves FX config and config-level audioPath", async () => {
    const section = makeSection({
      type: "long-y",
      config: {
        type: "long-y",
        imagePath: "uploaded/page.webp",
        width: 800,
        height: 2400,
        audioPath: "audio/config.mp3",
        fxPath: "fx/overlay.webp",
        fxConfig: { ...FX_CONFIG, position: { ...FX_CONFIG.position }, size: { ...FX_CONFIG.size } },
      },
      images: [pageImageRecord()],
    });
    const onChange = vi.fn();
    render(wrap(<SectionConfigPanel section={section} onSectionChange={onChange} onClose={vi.fn()} />));

    await selectSectionType("Image");

    const updated = lastCall(onChange);
    expect(updated.type).toBe("image");
    expect(updated.config).toMatchObject({
      type: "image",
      imagePath: "uploaded/page.webp",
      width: 800,
      height: 2400,
      audioPath: "audio/config.mp3",
      fxPath: "fx/overlay.webp",
      fxConfig: FX_CONFIG,
    });
    expect(updated.images).toHaveLength(1);
  });

  test("switching image → pan-x drops FX explicitly but keeps the page image", async () => {
    const section = makeSection({
      type: "image",
      config: {
        type: "image",
        imagePath: "uploaded/page.webp",
        width: 1600,
        height: 600,
        audioPath: "audio/config.mp3",
        fxPath: "fx/overlay.gif",
        fxConfig: { ...FX_CONFIG, position: { ...FX_CONFIG.position }, size: { ...FX_CONFIG.size } },
      },
      images: [pageImageRecord()],
    });
    const onChange = vi.fn();
    render(wrap(<SectionConfigPanel section={section} onSectionChange={onChange} onClose={vi.fn()} />));

    await selectSectionType("Panoramique");

    const updated = lastCall(onChange);
    expect(updated.type).toBe("pan-x");
    expect(updated.config).toMatchObject({
      type: "pan-x",
      imagePath: "uploaded/page.webp",
      width: 1600,
      height: 600,
      audioPath: "audio/config.mp3",
    });
    expect(updated.config).not.toHaveProperty("fxPath");
    expect(updated.config).not.toHaveProperty("fxConfig");
    // pan-x reste sur le modèle « image de page » : le média est conservé.
    expect(updated.images).toHaveLength(1);
    expect(updated.images[0].storagePath).toBe("uploaded/page.webp");
  });

  test("switching image → animation resets section.images and drops FX", async () => {
    const section = makeSection({
      type: "image",
      config: {
        type: "image",
        imagePath: "uploaded/page.webp",
        width: 800,
        height: 1200,
        audioPath: "audio/config.mp3",
        fxPath: "fx/overlay.gif",
        fxConfig: { ...FX_CONFIG, position: { ...FX_CONFIG.position }, size: { ...FX_CONFIG.size } },
      },
      images: [pageImageRecord()],
    });
    const onChange = vi.fn();
    render(wrap(<SectionConfigPanel section={section} onSectionChange={onChange} onClose={vi.fn()} />));

    await selectSectionType("Animation");

    const updated = lastCall(onChange);
    expect(updated.type).toBe("animation");
    // Modèle média changé (page → sprite) : aucun média obsolète ne doit rester.
    expect(updated.images).toEqual([]);
    expect(updated.config).not.toHaveProperty("fxPath");
    expect(updated.config).not.toHaveProperty("fxConfig");
    expect(updated.config).toMatchObject({
      type: "animation",
      spritePath: "",
      audioPath: "audio/config.mp3",
    });
  });

  test("switching animation → image resets the stale sprite record", async () => {
    const section = makeSection({
      type: "animation",
      config: {
        type: "animation",
        spritePath: "uploaded/sprite.webp",
        frameWidth: 100,
        frameHeight: 100,
        columns: 4,
        rows: 3,
        frameCount: 10,
      },
      images: [
        {
          id: "img-sprite",
          sectionId: "sec-1",
          webtoonId: "w1",
          storagePath: "uploaded/sprite.webp",
          width: 400,
          height: 300,
          mimeType: "image/webp",
          position: 0,
        },
      ],
    });
    const onChange = vi.fn();
    render(wrap(<SectionConfigPanel section={section} onSectionChange={onChange} onClose={vi.fn()} />));

    await selectSectionType("Image");

    const updated = lastCall(onChange);
    expect(updated.type).toBe("image");
    expect(updated.images).toEqual([]);
    expect(updated.config).not.toHaveProperty("spritePath");
  });
});

function makePanX(config: Partial<PanXSectionConfig> = {}): SectionWithImages {
  return makeSection({
    type: "pan-x",
    config: {
      type: "pan-x",
      imagePath: "uploaded/page.webp",
      width: 1600,
      height: 600,
      ...config,
    },
  });
}

describe("SectionConfigPanel — image framing", () => {
  test("image section defaults to contain framing with no focal point control", () => {
    const section = makeSection();
    render(wrap(<SectionConfigPanel section={section} onSectionChange={vi.fn()} onClose={vi.fn()} />));

    expect(screen.getByRole("combobox", { name: "Cadrage" })).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Point focal" })).not.toBeInTheDocument();
  });

  test("choosing cover reveals the focal point and keeps the rest of the config intact", async () => {
    const section = makeSection({
      type: "image",
      audioPath: "audio/sec-1.mp3",
      config: {
        type: "image",
        imagePath: "uploaded/page.webp",
        width: 800,
        height: 1200,
        audioPath: "audio/config.mp3",
        fxPath: "fx/overlay.gif",
        fxConfig: { ...FX_CONFIG, position: { ...FX_CONFIG.position }, size: { ...FX_CONFIG.size } },
      },
    });
    const onChange = vi.fn();
    const { rerender } = render(
      wrap(<SectionConfigPanel section={section} onSectionChange={onChange} onClose={vi.fn()} />),
    );

    await userEvent.click(screen.getByRole("combobox", { name: "Cadrage" }));
    await userEvent.click(await screen.findByRole("option", { name: "Couvrir" }));

    const updated = lastCall(onChange);
    expect(updated.config).toMatchObject({
      type: "image",
      fit: "cover",
      imagePath: "uploaded/page.webp",
      width: 800,
      height: 1200,
      audioPath: "audio/config.mp3",
      fxPath: "fx/overlay.gif",
      fxConfig: FX_CONFIG,
    });
    expect(updated.audioPath).toBe("audio/sec-1.mp3");

    rerender(wrap(<SectionConfigPanel section={updated} onSectionChange={onChange} onClose={vi.fn()} />));
    expect(screen.getByRole("combobox", { name: "Point focal" })).toBeInTheDocument();
  });

  test("changing the focal point keeps the framing mode and the rest of the config", async () => {
    const section = makeSection({
      type: "image",
      config: {
        type: "image",
        imagePath: "uploaded/page.webp",
        width: 800,
        height: 1200,
        fit: "cover",
        focus: "top",
      },
    });
    const onChange = vi.fn();
    render(wrap(<SectionConfigPanel section={section} onSectionChange={onChange} onClose={vi.fn()} />));

    await userEvent.click(screen.getByRole("combobox", { name: "Point focal" }));
    await userEvent.click(await screen.findByRole("option", { name: "Bas" }));

    const updated = lastCall(onChange);
    expect(updated.config).toEqual({ ...section.config, focus: "bottom" });
  });

  test("focal point is hidden when framing is not cover", () => {
    const section = makeSection({
      type: "image",
      config: {
        type: "image",
        imagePath: "uploaded/page.webp",
        width: 800,
        height: 1200,
        fit: "width",
        focus: "bottom",
      },
    });
    render(wrap(<SectionConfigPanel section={section} onSectionChange={vi.fn()} onClose={vi.fn()} />));

    expect(screen.queryByRole("combobox", { name: "Point focal" })).not.toBeInTheDocument();
  });

  test("long-y sections do not expose image framing", () => {
    const section = makeSection({
      type: "long-y",
      config: { type: "long-y", imagePath: "uploaded/page.webp", width: 800, height: 2400 },
    });
    render(wrap(<SectionConfigPanel section={section} onSectionChange={vi.fn()} onClose={vi.fn()} />));

    expect(screen.queryByRole("combobox", { name: "Cadrage" })).not.toBeInTheDocument();
  });
});

describe("SectionConfigPanel — pan-x settings", () => {
  test("pan-x exposes panDistance defaulting to 150 and a direction select", () => {
    const section = makePanX();
    render(wrap(<SectionConfigPanel section={section} onSectionChange={vi.fn()} onClose={vi.fn()} />));

    expect(screen.getByLabelText("Distance du panoramique (vh)")).toHaveValue(150);
    expect(screen.getByRole("combobox", { name: "Sens" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Durée du panoramique (vh)")).not.toBeInTheDocument();
  });

  test("editing panDistance writes the value, clamps to 100–400 and never writes panSpeed", () => {
    const section = makePanX({ panSpeed: 320 });
    const onChange = vi.fn();
    render(wrap(<SectionConfigPanel section={section} onSectionChange={onChange} onClose={vi.fn()} />));

    const input = screen.getByLabelText("Distance du panoramique (vh)");

    fireEvent.change(input, { target: { value: "220" } });
    expect(lastCall(onChange).config).toMatchObject({ type: "pan-x", panDistance: 220 });

    fireEvent.change(input, { target: { value: "50" } });
    expect(lastCall(onChange).config).toMatchObject({ type: "pan-x", panDistance: 100 });

    fireEvent.change(input, { target: { value: "900" } });
    const updated = lastCall(onChange);
    expect(updated.config).toMatchObject({ type: "pan-x", panDistance: 400 });
    expect(updated.config).not.toHaveProperty("panSpeed");
    expect(updated.images).toEqual(section.images);
  });

  test("empty or non-numeric panDistance does not call onSectionChange", () => {
    const section = makePanX({ panDistance: 240 });
    const onChange = vi.fn();
    render(wrap(<SectionConfigPanel section={section} onSectionChange={onChange} onClose={vi.fn()} />));

    const input = screen.getByLabelText("Distance du panoramique (vh)");
    expect(input).toHaveValue(240);

    fireEvent.change(input, { target: { value: "" } });
    fireEvent.change(input, { target: { value: "abc" } });

    expect(onChange).not.toHaveBeenCalled();
  });

  test("changing the pan direction writes direction and keeps panDistance", async () => {
    const section = makePanX({ panDistance: 240 });
    const onChange = vi.fn();
    render(wrap(<SectionConfigPanel section={section} onSectionChange={onChange} onClose={vi.fn()} />));

    await userEvent.click(screen.getByRole("combobox", { name: "Sens" }));
    await userEvent.click(await screen.findByRole("option", { name: "Droite → gauche" }));

    expect(lastCall(onChange).config).toEqual({ ...section.config, direction: "rtl" });
  });

  test("switching the section type to pan-x seeds the panDistance/direction defaults", async () => {
    const section = makeSection({ type: "image" });
    const onChange = vi.fn();
    render(wrap(<SectionConfigPanel section={section} onSectionChange={onChange} onClose={vi.fn()} />));

    await selectSectionType("Panoramique");

    expect(lastCall(onChange).config).toMatchObject({
      type: "pan-x",
      panDistance: 150,
      direction: "ltr",
    });
  });
});

describe("SectionConfigPanel — animation scroll settings", () => {
  test("animation exposes a total scroll length defaulting to SCROLL_DISTANCES", () => {
    const section = makeSection({
      type: "animation",
      config: {
        type: "animation",
        spritePath: "uploaded/sprite.webp",
        frameWidth: 100,
        frameHeight: 100,
        columns: 4,
        rows: 3,
        frameCount: 10,
      },
    });
    const onChange = vi.fn();
    render(wrap(<SectionConfigPanel section={section} onSectionChange={onChange} onClose={vi.fn()} />));

    const input = screen.getByLabelText("Longueur totale du défilement (vh)");
    expect(input).toHaveValue(200);
    expect(screen.queryByLabelText("Distance du panoramique (vh)")).not.toBeInTheDocument();

    fireEvent.change(input, { target: { value: "350" } });

    const updated = lastCall(onChange);
    expect(updated.config).toMatchObject({ type: "animation", scrollHeight: 350 });
  });

  test("scrollHeight ignores non-positive values so the config stays Zod-valid", () => {
    const section = makeSection({
      type: "animation",
      config: {
        type: "animation",
        spritePath: "uploaded/sprite.webp",
        frameWidth: 100,
        frameHeight: 100,
        columns: 4,
        rows: 3,
        frameCount: 10,
        scrollHeight: 250,
      },
    });
    const onChange = vi.fn();
    render(wrap(<SectionConfigPanel section={section} onSectionChange={onChange} onClose={vi.fn()} />));

    const input = screen.getByLabelText("Longueur totale du défilement (vh)");
    expect(input).toHaveValue(250);

    fireEvent.change(input, { target: { value: "-10" } });

    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("SectionConfigPanel — animation individual frames", () => {
  const DEFAULT_UPLOAD = { data: { path: "uploaded/path.webp" }, error: null };

  // `vi.clearAllMocks()` ne restaure pas les implémentations : on remet le
  // spy d'upload par défaut pour ne pas polluer les autres suites.
  afterEach(() => {
    uploadSpy.mockResolvedValue(DEFAULT_UPLOAD);
    removeSpy.mockResolvedValue({ data: [], error: null });
  });

  function animationSection(): SectionWithImages {
    return makeSection({
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
    });
  }

  function frameBlobs(count: number): Blob[] {
    return Array.from(
      { length: count },
      (_, index) => new Blob([`frame-${index}`], { type: "image/webp" }),
    );
  }

  test("slices the sheet and uploads one asset per frame, framePaths in order", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test-anon-key");
    const frames = frameBlobs(10);
    vi.mocked(buildSpriteSheet).mockResolvedValue({
      spriteBlob: new Blob(["sprite"], { type: "image/webp" }),
      frameWidth: 100,
      frameHeight: 100,
      columns: 4,
      rows: 3,
      frameCount: 10,
    });
    vi.mocked(sliceSpriteSheet).mockResolvedValue({
      frames,
      frameWidth: 120,
      frameHeight: 90,
    });
    uploadSpy.mockImplementation(async (path: string) => ({
      data: { path },
      error: null,
    }));

    const onChange = vi.fn();
    render(
      wrap(
        <SectionConfigPanel
          section={animationSection()}
          onSectionChange={onChange}
          onClose={vi.fn()}
        />,
      ),
    );

    const fileInput = screen.getByLabelText("Uploader les frames d'animation");
    const file = new File(["frame"], "frame.png", { type: "image/png" });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => expect(onChange).toHaveBeenCalled());

    // La feuille est découpée avec la géométrie renvoyée par buildSpriteSheet.
    expect(sliceSpriteSheet).toHaveBeenCalledWith(expect.any(Blob), {
      columns: 4,
      rows: 3,
      frameWidth: 100,
      frameHeight: 100,
      frameCount: 10,
    });

    const uploadedPaths = uploadSpy.mock.calls.map(
      ([path]) => path as string,
    );
    const frameBatch = uploadedPaths[1]?.match(/\/frames\/(\d+)\//)?.[1];
    expect(frameBatch).toBeTruthy();
    const expectedFramePaths = frames.map(
      (_, index) => `webtoons/sections/sec-1/frames/${frameBatch}/${index}.webp`,
    );

    // Feuille (repli) uploadée d'abord, puis une frame par index.
    expect(uploadedPaths[0]).toMatch(
      /^webtoons\/sections\/sec-1\/\d+-sprite-\d+\.webp$/,
    );
    expect(uploadedPaths.slice(1)).toEqual(expectedFramePaths);

    // Chaque frame uploadée est le Blob découpé correspondant, en WebP.
    frames.forEach((frame, index) => {
      const [, blob, options] = uploadSpy.mock.calls[index + 1] as [
        string,
        Blob,
        { contentType: string; upsert: boolean },
      ];
      expect(blob).toBe(frame);
      expect(options).toEqual({ contentType: "image/webp", upsert: false });
    });

    const updated = lastCall(onChange);
    expect(updated.config).toMatchObject({
      type: "animation",
      spritePath: uploadedPaths[0],
      framePaths: expectedFramePaths,
      frameWidth: 120,
      frameHeight: 90,
      frameCount: 10,
      columns: 10,
      rows: 1,
    });
    // Le repli sprite reste le premier média de la section.
    expect(updated.images).toHaveLength(1);
    expect(updated.images[0].storagePath).toBe(uploadedPaths[0]);
  });

  test("a frame upload failure surfaces the error and leaves the section unchanged", async () => {
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
    vi.mocked(sliceSpriteSheet).mockResolvedValue({
      frames: frameBlobs(10),
      frameWidth: 100,
      frameHeight: 100,
    });
    uploadSpy.mockImplementation(async (path: string) =>
      path.includes("/frames/")
        ? { data: null, error: new Error("frame upload failed") }
        : { data: { path }, error: null },
    );

    const onChange = vi.fn();
    render(
      wrap(
        <SectionConfigPanel
          section={animationSection()}
          onSectionChange={onChange}
          onClose={vi.fn()}
        />,
      ),
    );

    const fileInput = screen.getByLabelText("Uploader les frames d'animation");
    const file = new File(["frame"], "frame.png", { type: "image/png" });
    fireEvent.change(fileInput, { target: { files: [file] } });

    expect(
      await screen.findByText("Erreur lors de la création de la sprite sheet."),
    ).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();

    // Le sprite déjà uploadé ne doit pas rester orphelin après l'échec.
    await waitFor(() => expect(removeSpy).toHaveBeenCalled());
    const spritePath = uploadSpy.mock.calls[0][0] as string;
    expect(removeSpy.mock.calls[0][0]).toEqual([spritePath]);
  });

  test("a second full upload writes frames in a new timestamped batch", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test-anon-key");
    vi.mocked(buildSpriteSheet).mockResolvedValue({
      spriteBlob: new Blob(["sprite"], { type: "image/webp" }),
      frameWidth: 100,
      frameHeight: 100,
      columns: 2,
      rows: 1,
      frameCount: 2,
    });
    vi.mocked(sliceSpriteSheet).mockResolvedValue({
      frames: frameBlobs(2),
      frameWidth: 100,
      frameHeight: 100,
    });
    uploadSpy.mockImplementation(async (path: string) => ({
      data: { path },
      error: null,
    }));

    const nowSpy = vi.spyOn(Date, "now");
    try {
      const onChange = vi.fn();
      render(
        wrap(
          <SectionConfigPanel
            section={animationSection()}
            onSectionChange={onChange}
            onClose={vi.fn()}
          />,
        ),
      );

      const fileInput = screen.getByLabelText("Uploader les frames d'animation");
      const file = new File(["frame"], "frame.png", { type: "image/png" });

      nowSpy.mockReturnValue(1_000);
      fireEvent.change(fileInput, { target: { files: [file] } });
      await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(fileInput).not.toBeDisabled());

      nowSpy.mockReturnValue(2_000);
      fireEvent.change(fileInput, { target: { files: [file] } });
      await waitFor(() => expect(onChange).toHaveBeenCalledTimes(2));

      const framePaths = uploadSpy.mock.calls
        .map(([path]) => path as string)
        .filter((path) => path.includes("/frames/"));
      expect(framePaths).toEqual([
        "webtoons/sections/sec-1/frames/1000/0.webp",
        "webtoons/sections/sec-1/frames/1000/1.webp",
        "webtoons/sections/sec-1/frames/2000/0.webp",
        "webtoons/sections/sec-1/frames/2000/1.webp",
      ]);
    } finally {
      nowSpy.mockRestore();
    }
  });
});

describe("SectionConfigPanel — animation frames editor", () => {
  const FRAMES = [
    "webtoons/sections/sec-1/frames/a.webp",
    "webtoons/sections/sec-1/frames/b.webp",
    "webtoons/sections/sec-1/frames/c.webp",
  ];

  function animationWithFrames(framePaths: string[]): SectionWithImages {
    return makeSection({
      type: "animation",
      config: {
        type: "animation",
        spritePath: "uploaded/sprite.webp",
        framePaths,
        frameWidth: 64,
        frameHeight: 64,
        columns: framePaths.length,
        rows: 1,
        frameCount: framePaths.length,
      },
    });
  }

  test("renders the frames editor for animation and persists reordered framePaths", () => {
    const onChange = vi.fn();
    render(
      wrap(
        <SectionConfigPanel
          section={animationWithFrames(FRAMES)}
          onSectionChange={onChange}
          onClose={vi.fn()}
        />,
      ),
    );

    expect(screen.getByText("Frames", { selector: "span" })).toBeInTheDocument();
    expect(screen.getAllByTestId("animation-frame")).toHaveLength(3);

    fireEvent.click(screen.getByRole("button", { name: "Déplacer à droite 1" }));

    const updated = lastCall(onChange);
    expect(updated.config).toMatchObject({
      type: "animation",
      framePaths: [FRAMES[1], FRAMES[0], FRAMES[2]],
      frameCount: 3,
      columns: 3,
      rows: 1,
      frameWidth: 64,
      frameHeight: 64,
    });
    // Le chemin sprite de repli n'est pas perdu.
    expect(updated.config).toMatchObject({ spritePath: "uploaded/sprite.webp" });
  });

  test("does not render the frames editor for non-animation sections", () => {
    render(
      wrap(
        <SectionConfigPanel section={makeSection()} onSectionChange={vi.fn()} onClose={vi.fn()} />,
      ),
    );

    expect(screen.queryByLabelText("Ajouter des frames")).not.toBeInTheDocument();
  });

  test("uploading frames from the editor appends storage paths and keeps geometry", async () => {
    const onChange = vi.fn();
    render(
      wrap(
        <SectionConfigPanel
          section={animationWithFrames([])}
          onSectionChange={onChange}
          onClose={vi.fn()}
        />,
      ),
    );

    fireEvent.change(screen.getByLabelText("Ajouter des frames"), {
      target: { files: [new File(["frame"], "frame.png", { type: "image/png" })] },
    });

    await waitFor(() => expect(onChange).toHaveBeenCalled());

    const uploadedPath = uploadSpy.mock.calls[0][0] as string;
    expect(uploadedPath).toMatch(/^webtoons\/sections\/sec-1\/frames\/\d+-0\.webp$/);
    expect(resizeImage).toHaveBeenCalledWith(expect.any(File), {
      maxDimension: 1600,
    });

    const updated = lastCall(onChange);
    expect(updated.config).toMatchObject({
      type: "animation",
      framePaths: ["uploaded/path.webp"],
      frameCount: 1,
      columns: 1,
      rows: 1,
      frameWidth: 64,
      frameHeight: 64,
    });
  });
});

describe("SectionConfigPanel — upload hardening", () => {
  test("rejects an oversized image before decoding or uploading it", async () => {
    const section = makeSection({ type: "image" });
    render(wrap(<SectionConfigPanel section={section} onSectionChange={vi.fn()} onClose={vi.fn()} />));

    const fileInput = screen.getByLabelText("Uploader une image");
    const file = new File(["too-heavy"], "huge.png", { type: "image/png" });
    Object.defineProperty(file, "size", { value: 15 * 1024 * 1024 + 1 });

    fireEvent.change(fileInput, { target: { files: [file] } });

    expect(
      await screen.findByText("Le fichier dépasse la limite de 15 Mo."),
    ).toBeInTheDocument();
    expect(resizeImage).not.toHaveBeenCalled();
    expect(uploadSpy).not.toHaveBeenCalled();
  });

  test("disables section controls while an upload is in flight (ED-11)", async () => {
    const { isAnimatedImage } = await import("@/lib/image/animated");
    vi.mocked(isAnimatedImage).mockResolvedValue(false);
    let resolveResize!: (blob: Blob) => void;
    vi.mocked(resizeImage).mockImplementationOnce(
      () =>
        new Promise<Blob>((resolve) => {
          resolveResize = resolve;
        }),
    );

    const section = makeSection({ type: "image" });
    render(wrap(<SectionConfigPanel section={section} onSectionChange={vi.fn()} onClose={vi.fn()} />));

    const fileInput = screen.getByLabelText("Uploader une image");
    fireEvent.change(fileInput, {
      target: { files: [new File(["image"], "test.png", { type: "image/png" })] },
    });

    expect(await screen.findByText("Envoi en cours…")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Type de section" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Fermer le panneau" })).toBeDisabled();
    expect(screen.getByLabelText("Uploader un audio")).toBeDisabled();

    await act(async () => {
      resolveResize(new Blob(["resized"], { type: "image/webp" }));
    });

    await waitFor(() => expect(fileInput).not.toBeDisabled());
  });
});
