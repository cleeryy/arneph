import type { ReactElement } from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";

import { SectionAudioContext } from "../section-audio-context";
import { SectionAudioTracker } from "../SectionAudioTracker";
import type { SectionWithImages } from "@/lib/db/queries";
import frMessages from "../../../../messages/fr.json";

let observerCallback: IntersectionObserverCallback | null = null;

const mockObserve = vi.fn();
const mockUnobserve = vi.fn();
const mockDisconnect = vi.fn();

class MockIntersectionObserver {
  constructor(callback: IntersectionObserverCallback) {
    observerCallback = callback;
  }
  observe = mockObserve;
  unobserve = mockUnobserve;
  disconnect = mockDisconnect;
}

beforeAll(() => {
  vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
});

function triggerIntersection(entries: IntersectionObserverEntry[]) {
  observerCallback?.(entries, {} as IntersectionObserver);
}

function makeSection(overrides: Partial<SectionWithImages> = {}): SectionWithImages {
  return {
    id: "sec-1",
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
        sectionId: "sec-1",
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

function addSectionElement(sectionId: string, audioPath?: string) {
  const el = document.createElement("div");
  el.setAttribute("data-section-id", sectionId);
  if (audioPath) {
    el.setAttribute("data-audio-path", audioPath);
  }
  document.body.appendChild(el);
  return el;
}

function clearSectionElements() {
  document.querySelectorAll("[data-section-id]").forEach((el) => el.remove());
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  observerCallback = null;
  mockObserve.mockClear();
  mockUnobserve.mockClear();
  mockDisconnect.mockClear();
  clearSectionElements();
});

function wrap(ui: ReactElement) {
  return (
    <NextIntlClientProvider locale="fr" messages={frMessages}>
      {ui}
    </NextIntlClientProvider>
  );
}

describe("SectionAudioTracker (T19)", () => {
  test("section avec audioPath → playSectionAudio appelée à l'entrée", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
    vi.useFakeTimers();

    const playSectionAudio = vi.fn();
    const pauseCurrent = vi.fn();

    const section = makeSection({ id: "sec-audio", audioPath: "audio/section1.mp3" });
    addSectionElement("sec-audio", "audio/section1.mp3");

    render(
      wrap(
        <SectionAudioContext.Provider value={{ playSectionAudio, pauseCurrent, isPlaying: false }}>
          <SectionAudioTracker sections={[section]} />
        </SectionAudioContext.Provider>,
      ),
    );

    triggerIntersection([
      {
        target: document.querySelector("[data-section-id='sec-audio']")!,
        isIntersecting: true,
        intersectionRatio: 0.5,
      } as IntersectionObserverEntry,
    ]);

    vi.advanceTimersByTime(150);
    expect(playSectionAudio).toHaveBeenCalledWith(
      "sec-audio",
      "http://127.0.0.1:54321/storage/v1/object/public/webtoon-images/audio/section1.mp3",
    );
  });

  test("sortie de section → pauseCurrent appelée", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
    vi.useFakeTimers();

    const playSectionAudio = vi.fn();
    const pauseCurrent = vi.fn();

    const section = makeSection({ id: "sec-audio", audioPath: "audio/section1.mp3" });
    addSectionElement("sec-audio", "audio/section1.mp3");

    render(
      wrap(
        <SectionAudioContext.Provider value={{ playSectionAudio, pauseCurrent, isPlaying: false }}>
          <SectionAudioTracker sections={[section]} />
        </SectionAudioContext.Provider>,
      ),
    );

    vi.advanceTimersByTime(1);

    triggerIntersection([
      {
        target: document.querySelector("[data-section-id='sec-audio']")!,
        isIntersecting: false,
        intersectionRatio: 0,
      } as IntersectionObserverEntry,
    ]);

    vi.advanceTimersByTime(150);
    expect(pauseCurrent).toHaveBeenCalled();
  });

  test("scroll rapide → seul le dernier playSectionAudio est appelé", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
    vi.useFakeTimers();

    const playSectionAudio = vi.fn();
    const pauseCurrent = vi.fn();

    const section1 = makeSection({ id: "sec-1", audioPath: "audio/1.mp3" });
    const section2 = makeSection({ id: "sec-2", audioPath: "audio/2.mp3" });
    addSectionElement("sec-1", "audio/1.mp3");
    addSectionElement("sec-2", "audio/2.mp3");

    render(
      wrap(
        <SectionAudioContext.Provider value={{ playSectionAudio, pauseCurrent, isPlaying: false }}>
          <SectionAudioTracker sections={[section1, section2]} />
        </SectionAudioContext.Provider>,
      ),
    );

    vi.advanceTimersByTime(1);

    triggerIntersection([
      {
        target: document.querySelector("[data-section-id='sec-1']")!,
        isIntersecting: true,
        intersectionRatio: 0.5,
      } as IntersectionObserverEntry,
    ]);

    triggerIntersection([
      {
        target: document.querySelector("[data-section-id='sec-2']")!,
        isIntersecting: true,
        intersectionRatio: 0.5,
      } as IntersectionObserverEntry,
    ]);

    vi.advanceTimersByTime(150);
    expect(playSectionAudio).toHaveBeenCalledTimes(1);
    expect(playSectionAudio).toHaveBeenCalledWith(
      "sec-2",
      "http://127.0.0.1:54321/storage/v1/object/public/webtoon-images/audio/2.mp3",
    );
  });

  test("audioPath null → no-op, playSectionAudio non appelée", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
    vi.useFakeTimers();

    const playSectionAudio = vi.fn();
    const pauseCurrent = vi.fn();

    const section = makeSection({ id: "sec-no-audio", audioPath: undefined });
    addSectionElement("sec-no-audio");

    render(
      wrap(
        <SectionAudioContext.Provider value={{ playSectionAudio, pauseCurrent, isPlaying: false }}>
          <SectionAudioTracker sections={[section]} />
        </SectionAudioContext.Provider>,
      ),
    );

    triggerIntersection([
      {
        target: document.querySelector("[data-section-id='sec-no-audio']")!,
        isIntersecting: true,
        intersectionRatio: 0.5,
      } as IntersectionObserverEntry,
    ]);

    vi.advanceTimersByTime(150);
    expect(playSectionAudio).not.toHaveBeenCalled();
  });

  test("IntersectionObserver indisponible → pas d'erreur", () => {
    vi.unstubAllGlobals();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");

    const section = makeSection({ id: "sec-1", audioPath: "audio/1.mp3" });

    expect(() => {
      render(
        wrap(
          <SectionAudioContext.Provider
            value={{
              playSectionAudio: vi.fn(),
              pauseCurrent: vi.fn(),
              isPlaying: false,
            }}
          >
            <SectionAudioTracker sections={[section]} />
          </SectionAudioContext.Provider>,
        ),
      );
    }).not.toThrow();
  });
});
