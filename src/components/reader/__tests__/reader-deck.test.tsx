import type { ReactElement } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";

vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => {
    const { src, alt, width, height, className, style } = props as {
      src: string;
      alt: string;
      width: number;
      height: number;
      className?: string;
      style?: Record<string, unknown>;
    };
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        data-testid="next-image"
        src={src}
        alt={alt}
        width={width}
        height={height}
        className={className}
        style={style as never}
      />
    );
  },
}));

const { playSpy, pauseSpy, toggleMuteSpy, audioState } = vi.hoisted(() => ({
  playSpy: vi.fn(),
  pauseSpy: vi.fn(),
  toggleMuteSpy: vi.fn(),
  audioState: { unlocked: false },
}));

vi.mock("@/hooks/useSectionAudio", () => ({
  useSectionAudio: () => ({
    playSectionAudio: playSpy,
    pauseCurrent: pauseSpy,
    isPlaying: false,
    unlocked: audioState.unlocked,
    muted: false,
    toggleMuted: toggleMuteSpy,
    onUnlocked: () => () => {},
  }),
}));

import ReaderShell from "../ReaderShell";
import type { ReaderPageData } from "@/app/read/[webtoonId]/page";
import type { SectionWithImages } from "@/lib/db/queries";
import type { SectionConfig, SectionType } from "@/types/webtoon";
import frMessages from "../../../../messages/fr.json";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
  audioState.unlocked = false;
  window.localStorage.clear();
});

/** Laisse passer la frame de coalescence de la molette. */
async function flushWheel() {
  await act(async () => {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  });
}

beforeEach(() => {
  Object.defineProperty(window, "innerWidth", { value: 390, configurable: true });
  Object.defineProperty(window, "innerHeight", { value: 800, configurable: true });
});

function section(
  position: number,
  type: SectionType,
  config: SectionConfig,
  audioPath?: string,
): SectionWithImages {
  const id = `sec-${position}`;
  return {
    id,
    webtoonId: "w1",
    position,
    type,
    config,
    audioPath,
    images: [
      {
        id: `img-${position}`,
        sectionId: id,
        webtoonId: "w1",
        storagePath: `path-${position}.webp`,
        width: 800,
        height: 1200,
        mimeType: "image/webp",
        position: 0,
      },
    ],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

const image = (p: number, audio?: string) =>
  section(p, "image", { type: "image", imagePath: "a.webp", width: 800, height: 1200 }, audio);
const pan = (p: number) =>
  section(p, "pan-x", { type: "pan-x", imagePath: "b.webp", width: 2400, height: 800 });
const longY = (p: number) =>
  section(p, "long-y", { type: "long-y", imagePath: "c.webp", width: 800, height: 4000 });
const anim = (p: number) =>
  section(p, "animation", {
    type: "animation",
    spritePath: "d.webp",
    frameWidth: 100,
    frameHeight: 100,
    columns: 2,
    rows: 1,
    frameCount: 2,
    scrollHeight: 200,
  });

function wrap(ui: ReactElement) {
  return (
    <NextIntlClientProvider locale="fr" messages={frMessages}>
      {ui}
    </NextIntlClientProvider>
  );
}

function renderReader(sections: SectionWithImages[]) {
  const data: ReaderPageData = {
    webtoon: {
      id: "w1",
      title: "Webtoon Test",
      visibility: "published",
      settings: {},
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      sections,
    },
  } as ReaderPageData;
  return render(wrap(<ReaderShell data={data} />));
}

function tap(clientX: number) {
  act(() => {
    screen.getByTestId("reader-deck").click();
  });
  // jsdom ne fournit pas clientX sur .click() : on simule l'événement complet.
  const deck = screen.getByTestId("reader-deck");
  act(() => {
    const event = new MouseEvent("click", { bubbles: true, clientX });
    deck.dispatchEvent(event);
  });
}

describe("ReaderDeck — navigation discrète", () => {
  test("affiche la première étape et sa progression", () => {
    renderReader([image(1), pan(2), anim(3)]);
    expect(screen.getByTestId("image-step")).toBeInTheDocument();
    expect(screen.getByTestId("reader-progress")).toHaveAttribute("aria-valuenow", "0");
    expect(screen.getByText("1/3")).toBeInTheDocument();
  });

  test("un clic à droite avance, à gauche recule", () => {
    renderReader([image(1), pan(2)]);
    tap(300);
    expect(screen.getByTestId("pan-x-step")).toBeInTheDocument();
    tap(10);
    expect(screen.getByTestId("image-step")).toBeInTheDocument();
  });

  test("le clavier avance et recule", () => {
    renderReader([image(1), longY(2)]);
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown" }));
    });
    expect(screen.getByTestId("long-y-step")).toBeInTheDocument();
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp" }));
    });
    expect(screen.getByTestId("image-step")).toBeInTheDocument();
  });

  test("affiche l'écran de fin après la dernière étape et permet de recommencer", () => {
    renderReader([image(1)]);
    tap(300);
    expect(screen.getByTestId("reader-end")).toBeInTheDocument();
    expect(screen.getByText("Fin du webtoon")).toBeInTheDocument();
    act(() => {
      screen.getByRole("button", { name: /Revoir depuis le début/ }).click();
    });
    expect(screen.getByTestId("image-step")).toBeInTheDocument();
  });

  test("propose de reprendre à l'index sauvegardé", () => {
    window.localStorage.setItem("arneph:reader-index:v1:w1", "1");
    renderReader([image(1), image(2), image(3)]);
    const resume = screen.getByTestId("resume-reading");
    act(() => resume.click());
    expect(screen.getByText("2/3")).toBeInTheDocument();
  });

  test("joue l'audio de l'étape courante puis le coupe au démontage", () => {
    const { unmount } = renderReader([image(1, "audio/one.mp3"), image(2)]);
    expect(playSpy).toHaveBeenCalledWith(
      "sec-1",
      expect.stringContaining("/storage/v1/object/public/webtoon-images/audio/one.mp3"),
    );
    unmount();
    expect(pauseSpy).toHaveBeenCalled();
  });

  test("le déverrouillage audio relance la piste de l'étape courante", () => {
    vi.useFakeTimers();
    audioState.unlocked = false;
    renderReader([image(1, "audio/one.mp3")]);
    // Tentative au montage (no-op côté hook réel avant le premier geste).
    expect(playSpy).toHaveBeenCalledTimes(1);

    audioState.unlocked = true;
    act(() => {
      // Un simple re-render (masquage du header) suffit : `unlocked` est dans
      // les dépendances de l'effet audio.
      vi.advanceTimersByTime(2100);
    });

    expect(playSpy).toHaveBeenCalledTimes(2);
    expect(playSpy).toHaveBeenLastCalledWith(
      "sec-1",
      expect.stringContaining("audio/one.mp3"),
    );
  });
});

describe("ReaderDeck — molette et tactile robustes (RD-1, RD-2, RD-8)", () => {
  test("molette : un delta en lignes (Firefox) est converti en pixels", async () => {
    renderReader([image(1), image(2), image(3)]);
    const deck = screen.getByTestId("reader-deck");

    fireEvent.wheel(deck, { deltaY: 12, deltaMode: 0 });
    await flushWheel();
    expect(screen.getByText("1/3")).toBeInTheDocument();

    fireEvent.wheel(deck, { deltaY: 12, deltaMode: 1 });
    await flushWheel();
    expect(screen.getByText("2/3")).toBeInTheDocument();
  });

  test("molette : l'inertie après navigation ne saute pas d'étape", async () => {
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(1_000);
    renderReader([image(1), image(2), image(3)]);
    const deck = screen.getByTestId("reader-deck");

    fireEvent.wheel(deck, { deltaY: 400 });
    await flushWheel();
    expect(screen.getByText("2/3")).toBeInTheDocument();

    // Inertie immédiate : cooldown de 200 ms, aucun nouvelle navigation.
    fireEvent.wheel(deck, { deltaY: 400 });
    await flushWheel();
    expect(screen.getByText("2/3")).toBeInTheDocument();

    nowSpy.mockReturnValue(1_250);
    fireEvent.wheel(deck, { deltaY: 400 });
    await flushWheel();
    expect(screen.getByText("3/3")).toBeInTheDocument();
    nowSpy.mockRestore();
  });

  test("Ctrl/⌘ + molette : le zoom navigateur n'est pas intercepté", async () => {
    renderReader([image(1), image(2)]);
    const deck = screen.getByTestId("reader-deck");

    const notCanceled = fireEvent.wheel(deck, { deltaY: 400, ctrlKey: true });
    expect(notCanceled).toBe(true);
    await flushWheel();
    expect(screen.getByText("1/2")).toBeInTheDocument();
  });

  test("tactile : un long swipe ne traverse qu'une étape", () => {
    renderReader([image(1), image(2), image(3)]);
    const deck = screen.getByTestId("reader-deck");

    act(() => {
      fireEvent.touchStart(deck, { touches: [{ clientY: 700 }] });
      fireEvent.touchMove(deck, { touches: [{ clientY: 100 }] });
      fireEvent.touchEnd(deck, { changedTouches: [] });
    });

    expect(screen.getByText("2/3")).toBeInTheDocument();
  });

  test("tactile : un pincement à deux doigts n'est pas intercepté", () => {
    renderReader([image(1), image(2)]);
    const deck = screen.getByTestId("reader-deck");

    fireEvent.touchStart(deck, { touches: [{ clientY: 700 }, { clientY: 720 }] });
    const notCanceled = fireEvent.touchMove(deck, {
      touches: [
        { clientY: 100 },
        { clientY: 120 },
      ],
    });
    expect(notCanceled).toBe(true);
    fireEvent.touchEnd(deck, { changedTouches: [] });
    expect(screen.getByText("1/2")).toBeInTheDocument();
  });
});

describe("ReaderDeck — réglages, mute et header (RD-5, RD-6, RD-9)", () => {
  test("le bouton mute bascule l'état audio", () => {
    renderReader([image(1)]);
    const mute = screen.getByTestId("reader-mute-button");
    expect(mute).toHaveAttribute("aria-pressed", "false");
    act(() => mute.click());
    expect(toggleMuteSpy).toHaveBeenCalledTimes(1);
  });

  test("modale ouverte : molette et clic ne naviguent pas", async () => {
    renderReader([image(1), image(2)]);
    act(() => screen.getByTestId("reader-settings-button").click());

    const deck = screen.getByTestId("reader-deck");
    fireEvent.wheel(deck, { deltaY: 400 });
    await flushWheel();
    fireEvent.click(deck);
    expect(screen.getByText("1/2")).toBeInTheDocument();
  });

  test("la modale donne le focus à sa croix puis le restaure", () => {
    renderReader([image(1)]);
    const settingsButton = screen.getByTestId("reader-settings-button");
    act(() => settingsButton.focus());
    act(() => settingsButton.click());

    const close = screen.getByRole("button", { name: "Fermer les réglages" });
    expect(close).toHaveFocus();

    act(() => close.click());
    expect(screen.queryByTestId("reader-settings")).not.toBeInTheDocument();
    expect(settingsButton).toHaveFocus();
  });

  test("header masqué : inert et aria-hidden pour les contrôles hors écran", () => {
    vi.useFakeTimers();
    renderReader([image(1)]);
    const header = document.querySelector("header");
    expect(header).not.toBeNull();
    expect(header?.getAttribute("aria-hidden")).not.toBe("true");

    act(() => {
      vi.advanceTimersByTime(2200);
    });

    expect(header).toHaveAttribute("aria-hidden", "true");
    expect(header).toHaveAttribute("inert");
  });
});

describe("ReaderDeck — haut de page long-y (RD-7)", () => {
  test("le bouton remet le défilement de l'étape à zéro", () => {
    renderReader([longY(1)]);
    const scroller = screen.getByTestId("long-y-scroll");
    Object.defineProperty(scroller, "scrollTop", {
      value: 640,
      writable: true,
      configurable: true,
    });

    act(() => {
      screen.getByRole("button", { name: "Haut de page" }).click();
    });

    expect(scroller.scrollTop).toBe(0);
  });
});
