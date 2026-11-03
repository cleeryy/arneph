import type { ReactElement } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";

// Les composants finaux rendus par ReaderShell (PanXSection T17, AnimationSection
// T18) utilisent motion/react — mock des hooks + éléments motion en jsdom.
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
    motion: {
      div: (props: Record<string, unknown>) => React.createElement("div", props),
      img: (props: Record<string, unknown>) => React.createElement("img", props),
    },
  };
});

// next/image requiert la config optimizer (hors test) → mock qui expose src/w/h.
vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => {
    const { src, alt, width, height, className } = props as {
      src: string;
      alt: string;
      width: number;
      height: number;
      className?: string;
    };
    return (
      <img
        data-testid="next-image"
        alt={alt}
        src={src}
        width={width}
        height={height}
        className={className}
      />
    );
  },
}));

import ReaderShell from "../ReaderShell";
import type { SectionWithImages } from "@/lib/db/queries";
import type { ReaderPageData } from "@/app/read/[webtoonId]/page";
import type { SectionConfig, SectionType } from "@/types/webtoon";
import frMessages from "../../../../messages/fr.json";

afterEach(cleanup);

beforeEach(() => {
  mockUseScroll.mockReturnValue({ scrollYProgress: 0 });
  mockUseTransform.mockImplementation((value, a, b) => {
    if (typeof a === "function") return a(value);
    return Array.isArray(b) ? b[b.length - 1] : b;
  });
  mockUseReducedMotion.mockReturnValue(false);
});

function wrap(ui: ReactElement) {
  return (
    <NextIntlClientProvider locale="fr" messages={frMessages}>
      {ui}
    </NextIntlClientProvider>
  );
}

function makeSection(
  position: number,
  type: SectionType,
  config: SectionConfig,
  id = `sec-${position}`,
): SectionWithImages {
  return {
    id,
    webtoonId: "w1",
    position,
    type,
    config,
    audioPath: undefined,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    images: [],
  };
}

const baseWebtoon = {
  id: "w1",
  title: "Webtoon Test",
  visibility: "published",
  settings: {},
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
} as const;

function renderShell(sections: SectionWithImages[]) {
  const data: ReaderPageData = { webtoon: { ...baseWebtoon, sections } };
  return render(wrap(<ReaderShell data={data} />));
}

describe("ReaderShell — conteneur lecteur (T15)", () => {
  test("rend les sections dans l'ordre des positions (défensif, même si la liste arrive désordonnée)", () => {
    renderShell([
      makeSection(3, "animation", {
        type: "animation",
        spritePath: "c.webp",
        frameWidth: 100,
        frameHeight: 100,
        columns: 10,
        rows: 2,
        frameCount: 20,
      }),
      makeSection(1, "image", { type: "image", imagePath: "a.webp", width: 800, height: 1200 }),
      makeSection(2, "pan-x", {
        type: "pan-x",
        imagePath: "b.webp",
        width: 1600,
        height: 600,
      }),
    ]);

    const sections = screen.getAllByTestId(/^(section-(image|long-y)|pan-x-section|animation-section)$/);
    expect(sections.map((el) => el.getAttribute("data-section-position"))).toEqual(["1", "2", "3"]);
  });

  test("expose un data-testid distinct par type de section", () => {
    renderShell([
      makeSection(1, "image", { type: "image", imagePath: "a.webp", width: 800, height: 1200 }),
      makeSection(2, "long-y", {
        type: "long-y",
        imagePath: "b.webp",
        width: 800,
        height: 4000,
      }),
      makeSection(3, "pan-x", {
        type: "pan-x",
        imagePath: "c.webp",
        width: 1600,
        height: 600,
      }),
      makeSection(4, "animation", {
        type: "animation",
        spritePath: "d.webp",
        frameWidth: 100,
        frameHeight: 100,
        columns: 10,
        rows: 2,
        frameCount: 20,
      }),
    ]);

    expect(screen.getByTestId("section-image")).toBeInTheDocument();
    expect(screen.getByTestId("section-long-y")).toBeInTheDocument();
    expect(screen.getByTestId("pan-x-section")).toBeInTheDocument();
    expect(screen.getByTestId("animation-section")).toBeInTheDocument();
  });

  test("layout mobile-first : conteneur max-w-[800px] centré + min-h-dvh", () => {
    const { container } = renderShell([
      makeSection(1, "image", { type: "image", imagePath: "a.webp", width: 800, height: 1200 }),
    ]);

    const main = container.querySelector("main");
    expect(main?.className).toContain("min-h-dvh");
    expect(main?.className).toContain("bg-background");

    const readerContainer = screen.getByTestId("reader-container");
    expect(readerContainer.className).toContain("max-w-[800px]");
    expect(readerContainer.className).toContain("mx-auto");
  });

  test("affiche le titre du webtoon et le compteur de sections", () => {
    renderShell([
      makeSection(1, "image", { type: "image", imagePath: "a.webp", width: 800, height: 1200 }),
      makeSection(2, "image", {
        type: "image",
        imagePath: "b.webp",
        width: 800,
        height: 1200,
        audioPath: "t.ogg",
      }),
    ]);

    expect(screen.getByText("Webtoon Test")).toBeInTheDocument();
    expect(screen.getByText("2 sections")).toBeInTheDocument();
  });

  test("section audio visible → le vrai lecteur média joue l'URL Supabase (intégration)", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
    vi.useFakeTimers();

    // Capture le callback IntersectionObserver installé par SectionAudioTracker.
    let observerCallback: IntersectionObserverCallback | null = null;
    const observed: Element[] = [];
    class TestObserver {
      constructor(cb: IntersectionObserverCallback) {
        observerCallback = cb;
      }
      observe = (el: Element) => {
        observed.push(el);
      };
      unobserve = () => {};
      disconnect = () => {};
    }
    vi.stubGlobal("IntersectionObserver", TestObserver);

    // Vrai HTMLAudioElement jsdom : on espionne play() (résolu) sans le mocker.
    const playSpy = vi
      .spyOn(window.HTMLAudioElement.prototype, "play")
      .mockImplementation(function (this: HTMLAudioElement) {
        return Promise.resolve();
      });
    vi.spyOn(window.HTMLAudioElement.prototype, "pause").mockImplementation(function (
      this: HTMLAudioElement,
    ) {});

    const section = makeSection(
      1,
      "image",
      { type: "image", imagePath: "a.webp", width: 800, height: 1200 },
      "sec-audio-int",
    );
    section.audioPath = "audio/section1.mp3";
    section.images = [
      {
        id: "img-1",
        sectionId: section.id,
        webtoonId: section.webtoonId,
        storagePath: "a.webp",
        width: 800,
        height: 1200,
        mimeType: "image/webp",
        position: 0,
      },
    ];
    renderShell([section]);

    // Geste utilisateur : déverrouille l'autoplay (politique navigateur).
    await act(async () => {
      window.dispatchEvent(new Event("pointerdown"));
    });

    const target = document.querySelector("[data-section-id='sec-audio-int']");
    expect(target).not.toBeNull();

    await act(async () => {
      observerCallback?.(
        [
          { target, isIntersecting: true, intersectionRatio: 0.5 } as IntersectionObserverEntry,
        ],
        {} as IntersectionObserver,
      );
    });
    await act(async () => {
      vi.advanceTimersByTime(200);
    });

    const expectedUrl =
      "http://127.0.0.1:54321/storage/v1/object/public/webtoon-images/audio/section1.mp3";
    expect(playSpy).toHaveBeenCalled();
    const player = playSpy.mock.instances[0] as HTMLAudioElement;
    expect(player.src).toContain(expectedUrl.replace(/^http:\/\/127\.0\.0\.1:54321/, ""));

    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  test("lecture en cours → bouton mute accessible dans l'en-tête, clic = pause", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
    vi.useFakeTimers();
    // Purge les espions d'éléments média posés par un test précédent.
    vi.restoreAllMocks();

    let observerCallback: IntersectionObserverCallback | null = null;
    class TestObserver {
      constructor(cb: IntersectionObserverCallback) {
        observerCallback = cb;
      }
      observe = () => {};
      unobserve = () => {};
      disconnect = () => {};
    }
    vi.stubGlobal("IntersectionObserver", TestObserver);

    const playSpy = vi
      .spyOn(window.HTMLAudioElement.prototype, "play")
      .mockImplementation(function (this: HTMLAudioElement) {
        return Promise.resolve();
      });
    const pauseSpy = vi
      .spyOn(window.HTMLAudioElement.prototype, "pause")
      .mockImplementation(function (this: HTMLAudioElement) {});

    const section = makeSection(
      1,
      "image",
      { type: "image", imagePath: "a.webp", width: 800, height: 1200 },
      "sec-mute",
    );
    section.audioPath = "audio/mute.mp3";
    section.images = [
      {
        id: "img-1",
        sectionId: section.id,
        webtoonId: section.webtoonId,
        storagePath: "a.webp",
        width: 800,
        height: 1200,
        mimeType: "image/webp",
        position: 0,
      },
    ];
    renderShell([section]);

    // Pas de contrôle audio tant que rien ne joue.
    expect(screen.queryByRole("button", { name: "Couper le son" })).toBeNull();

    await act(async () => {
      window.dispatchEvent(new Event("pointerdown"));
    });

    const target = document.querySelector("[data-section-id='sec-mute']");
    expect(target).not.toBeNull();

    await act(async () => {
      observerCallback?.(
        [{ target, isIntersecting: true, intersectionRatio: 0.6 } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      );
    });
    await act(async () => {
      vi.advanceTimersByTime(200);
    });

    expect(playSpy).toHaveBeenCalled();

    const muteButton = screen.getByRole("button", { name: "Couper le son" });
    expect(muteButton).toHaveAttribute("type", "button");

    await act(async () => {
      fireEvent.click(muteButton);
    });

    expect(pauseSpy).toHaveBeenCalled();
    // isPlaying repasse à false : le contrôle disparaît.
    expect(screen.queryByRole("button", { name: "Couper le son" })).toBeNull();

    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  test("la section image utilise next/image (pas de <img> natif)", () => {
    const section = makeSection(1, "image", {
      type: "image",
      imagePath: "a.webp",
      width: 800,
      height: 1200,
    });
    section.images = [
      {
        id: "img-1",
        sectionId: section.id,
        webtoonId: section.webtoonId,
        storagePath: "a.webp",
        width: 800,
        height: 1200,
        mimeType: "image/webp",
        position: 0,
      },
    ];
    renderShell([section]);

    expect(screen.getByTestId("section-image")).toBeInTheDocument();
    // MUST NOT T15 : aucun <img> natif — next/image uniquement (T16+).
    expect(screen.getByTestId("next-image")).toBeInTheDocument();
    expect(document.querySelector("img:not([data-testid])")).toBeNull();
  });
});
