import type { ReactElement } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, type Mock, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";

import {
  AnimationFramesEditor,
  type AnimationFrameUploadResult,
  type AnimationFramesValue,
} from "../AnimationFramesEditor";
import { getSupabasePublicObjectUrl } from "@/lib/supabase/public-url";
import frMessages from "../../../../messages/fr.json";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

function wrap(ui: ReactElement) {
  return (
    <NextIntlClientProvider locale="fr" messages={frMessages}>
      {ui}
    </NextIntlClientProvider>
  );
}

function framePath(name: string): string {
  return `webtoons/sections/sec-1/frames/${name}`;
}

const FRAMES = [framePath("a.webp"), framePath("b.webp"), framePath("c.webp")];
const GEOMETRY = { frameWidth: 100, frameHeight: 100 };

interface RenderOptions {
  frames?: string[];
  frameWidth?: number;
  frameHeight?: number;
  disabled?: boolean;
  onChange?: Mock<(next: AnimationFramesValue) => void>;
  onUploadFiles?: Mock<(files: File[]) => Promise<AnimationFrameUploadResult>>;
}

function renderEditor(options: RenderOptions = {}) {
  const onChange = options.onChange ?? vi.fn<(next: AnimationFramesValue) => void>();
  const onUploadFiles =
    options.onUploadFiles ??
    vi
      .fn<(files: File[]) => Promise<AnimationFrameUploadResult>>()
      .mockResolvedValue({ frames: [], frameWidth: 100, frameHeight: 100 });

  const utils = render(
    wrap(
      <AnimationFramesEditor
        frames={options.frames ?? FRAMES}
        frameWidth={options.frameWidth ?? GEOMETRY.frameWidth}
        frameHeight={options.frameHeight ?? GEOMETRY.frameHeight}
        onChange={onChange}
        onUploadFiles={onUploadFiles}
        disabled={options.disabled}
      />,
    ),
  );

  return { ...utils, onChange, onUploadFiles };
}

describe("AnimationFramesEditor — frame list actions", () => {
  test("moving a frame right swaps it with the next frame", () => {
    const { onChange } = renderEditor();

    fireEvent.click(screen.getByRole("button", { name: "Déplacer à droite 1" }));

    expect(onChange).toHaveBeenCalledWith({
      frames: [FRAMES[1], FRAMES[0], FRAMES[2]],
      ...GEOMETRY,
    });
  });

  test("moving a frame left swaps it with the previous frame", () => {
    const { onChange } = renderEditor();

    fireEvent.click(screen.getByRole("button", { name: "Déplacer à gauche 3" }));

    expect(onChange).toHaveBeenCalledWith({
      frames: [FRAMES[0], FRAMES[2], FRAMES[1]],
      ...GEOMETRY,
    });
  });

  test("boundary move buttons are disabled", () => {
    renderEditor();

    expect(screen.getByRole("button", { name: "Déplacer à gauche 1" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Déplacer à droite 3" })).toBeDisabled();
  });

  test("deleting a frame removes it and keeps geometry", () => {
    const { onChange } = renderEditor();

    fireEvent.click(screen.getByRole("button", { name: "Supprimer la frame 2" }));

    expect(onChange).toHaveBeenCalledWith({
      frames: [FRAMES[0], FRAMES[2]],
      ...GEOMETRY,
    });
  });

  test("duplicating a frame inserts a copy right after it", () => {
    const { onChange } = renderEditor();

    fireEvent.click(screen.getByRole("button", { name: "Dupliquer la frame 2" }));

    expect(onChange).toHaveBeenCalledWith({
      frames: [FRAMES[0], FRAMES[1], FRAMES[1], FRAMES[2]],
      ...GEOMETRY,
    });
  });
});

describe("AnimationFramesEditor — loop preview", () => {
  test("play toggles to pause and advances frames at ~12 fps", () => {
    vi.useFakeTimers();
    renderEditor();

    const preview = screen.getByTestId("animation-frame-preview");
    expect(preview).toHaveAttribute("src", getSupabasePublicObjectUrl(FRAMES[0]));
    expect(screen.getByText("Frame 1 / 3")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Lire l'animation" }));

    expect(screen.getByRole("button", { name: "Mettre en pause" })).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(83);
    });
    expect(preview).toHaveAttribute("src", getSupabasePublicObjectUrl(FRAMES[1]));
    expect(screen.getByText("Frame 2 / 3")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(83);
    });
    expect(preview).toHaveAttribute("src", getSupabasePublicObjectUrl(FRAMES[2]));

    act(() => {
      vi.advanceTimersByTime(83);
    });
    // La boucle repart de la première frame.
    expect(preview).toHaveAttribute("src", getSupabasePublicObjectUrl(FRAMES[0]));

    fireEvent.click(screen.getByRole("button", { name: "Mettre en pause" }));

    act(() => {
      vi.advanceTimersByTime(83 * 2);
    });
    expect(preview).toHaveAttribute("src", getSupabasePublicObjectUrl(FRAMES[0]));
  });

  test("play is disabled with fewer than two frames", () => {
    renderEditor({ frames: [FRAMES[0]] });

    expect(screen.getByRole("button", { name: "Lire l'animation" })).toBeDisabled();
  });
});

describe("AnimationFramesEditor — uploads", () => {
  test("passes image files to onUploadFiles and appends the uploaded frames", async () => {
    const uploaded = [framePath("new-0.webp"), framePath("new-1.webp")];
    const onUploadFiles = vi
      .fn<(files: File[]) => Promise<AnimationFrameUploadResult>>()
      .mockResolvedValue({
        frames: uploaded,
        frameWidth: 100,
        frameHeight: 100,
      });
    const { onChange } = renderEditor({ onUploadFiles });

    const input = screen.getByLabelText("Ajouter des frames");
    const files = [
      new File(["a"], "a.png", { type: "image/png" }),
      new File(["b"], "b.png", { type: "image/png" }),
    ];

    fireEvent.change(input, { target: { files } });

    await waitFor(() => expect(onUploadFiles).toHaveBeenCalledWith(files));
    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith({
        frames: [...FRAMES, ...uploaded],
        ...GEOMETRY,
      }),
    );
  });

  test("adopted geometry is used when the section has no frame dimensions yet", async () => {
    const uploaded = [framePath("new-0.webp")];
    const onUploadFiles = vi
      .fn<(files: File[]) => Promise<AnimationFrameUploadResult>>()
      .mockResolvedValue({
        frames: uploaded,
        frameWidth: 320,
        frameHeight: 240,
      });
    const { onChange } = renderEditor({
      frames: [],
      frameWidth: 0,
      frameHeight: 0,
      onUploadFiles,
    });

    fireEvent.change(screen.getByLabelText("Ajouter des frames"), {
      target: { files: [new File(["a"], "a.png", { type: "image/png" })] },
    });

    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith({
        frames: uploaded,
        frameWidth: 320,
        frameHeight: 240,
      }),
    );
  });

  test("rejects non-image files without calling the upload callback", async () => {
    const { onChange, onUploadFiles } = renderEditor();

    fireEvent.change(screen.getByLabelText("Ajouter des frames"), {
      target: { files: [new File(["text"], "notes.txt", { type: "text/plain" })] },
    });

    expect(onUploadFiles).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
    expect(
      await screen.findByText("Tous les fichiers doivent être des images."),
    ).toBeInTheDocument();
  });

  test("surfaces an upload failure without changing the frames", async () => {
    const onUploadFiles = vi
      .fn<(files: File[]) => Promise<AnimationFrameUploadResult>>()
      .mockRejectedValue(new Error("upload failed"));
    const { onChange } = renderEditor({ onUploadFiles });

    fireEvent.change(screen.getByLabelText("Ajouter des frames"), {
      target: { files: [new File(["a"], "a.png", { type: "image/png" })] },
    });

    expect(
      await screen.findByText("Erreur lors de la création de la sprite sheet."),
    ).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("AnimationFramesEditor — disabled state", () => {
  test("disables upload, reorder, duplicate and delete while the parent uploads", () => {
    const { onChange } = renderEditor({ disabled: true });

    expect(screen.getByLabelText("Ajouter des frames")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Déplacer à droite 1" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Dupliquer la frame 1" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Supprimer la frame 1" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Supprimer la frame 1" }));
    expect(onChange).not.toHaveBeenCalled();
  });
});
