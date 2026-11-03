import type { ReactElement } from "react";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";

import { SectionAudioContext } from "../section-audio-context";
import { SectionAudioTracker } from "../SectionAudioTracker";
import type { UseSectionAudioResult } from "@/hooks/useSectionAudio";
import type { SectionWithImages } from "@/lib/db/queries";
import frMessages from "../../../../messages/fr.json";

const STORAGE_BASE =
  "http://127.0.0.1:54321/storage/v1/object/public/webtoon-images";

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

function sectionElement(sectionId: string): Element {
  const el = document.querySelector(`[data-section-id='${sectionId}']`);
  if (el === null) {
    throw new Error(`section element ${sectionId} introuvable`);
  }
  return el;
}

function intersectionEntry(
  sectionId: string,
  isIntersecting: boolean,
  intersectionRatio: number,
): IntersectionObserverEntry {
  return {
    target: sectionElement(sectionId),
    isIntersecting,
    intersectionRatio,
  } as IntersectionObserverEntry;
}

function clearSectionElements() {
  document.querySelectorAll("[data-section-id]").forEach((el) => el.remove());
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllEnvs();
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

/**
 * Contexte audio de test : par défaut le lecteur est déjà déverrouillé (geste
 * déjà effectué), pour isoler le comportement du tracker.
 */
function renderTracker(
  sections: SectionWithImages[],
  overrides: Partial<UseSectionAudioResult> = {},
) {
  const playSectionAudio = vi.fn();
  const pauseCurrent = vi.fn();
  const ctx: UseSectionAudioResult = {
    playSectionAudio,
    pauseCurrent,
    isPlaying: false,
    unlocked: true,
    onUnlocked: () => () => {},
    ...overrides,
  };

  const utils = render(
    wrap(
      <SectionAudioContext.Provider value={ctx}>
        <SectionAudioTracker sections={sections} />
      </SectionAudioContext.Provider>,
    ),
  );

  return { ...utils, playSectionAudio, pauseCurrent, ctx };
}

describe("SectionAudioTracker (T19)", () => {
  test("section avec audioPath → playSectionAudio appelée à l'entrée", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
    vi.useFakeTimers();

    const section = makeSection({ id: "sec-audio", audioPath: "audio/section1.mp3" });
    addSectionElement("sec-audio", "audio/section1.mp3");

    const { playSectionAudio } = renderTracker([section]);

    triggerIntersection([intersectionEntry("sec-audio", true, 0.5)]);

    vi.advanceTimersByTime(150);
    expect(playSectionAudio).toHaveBeenCalledWith(
      "sec-audio",
      `${STORAGE_BASE}/audio/section1.mp3`,
    );
  });

  test("sortie de section → pauseCurrent appelée", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
    vi.useFakeTimers();

    const section = makeSection({ id: "sec-audio", audioPath: "audio/section1.mp3" });
    addSectionElement("sec-audio", "audio/section1.mp3");

    const { pauseCurrent } = renderTracker([section]);

    vi.advanceTimersByTime(1);

    triggerIntersection([intersectionEntry("sec-audio", false, 0)]);

    vi.advanceTimersByTime(150);
    expect(pauseCurrent).toHaveBeenCalled();
  });

  test("scroll rapide → seul le dernier playSectionAudio est appelé", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
    vi.useFakeTimers();

    const section1 = makeSection({ id: "sec-1", audioPath: "audio/1.mp3" });
    const section2 = makeSection({ id: "sec-2", audioPath: "audio/2.mp3" });
    addSectionElement("sec-1", "audio/1.mp3");
    addSectionElement("sec-2", "audio/2.mp3");

    const { playSectionAudio } = renderTracker([section1, section2]);

    vi.advanceTimersByTime(1);

    triggerIntersection([intersectionEntry("sec-1", true, 0.5)]);
    triggerIntersection([intersectionEntry("sec-2", true, 0.5)]);

    vi.advanceTimersByTime(150);
    expect(playSectionAudio).toHaveBeenCalledTimes(1);
    expect(playSectionAudio).toHaveBeenCalledWith("sec-2", `${STORAGE_BASE}/audio/2.mp3`);
  });

  test("audioPath null → no-op, playSectionAudio non appelée", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
    vi.useFakeTimers();

    const section = makeSection({ id: "sec-no-audio", audioPath: undefined });
    addSectionElement("sec-no-audio");

    const { playSectionAudio } = renderTracker([section]);

    triggerIntersection([intersectionEntry("sec-no-audio", true, 0.5)]);

    vi.advanceTimersByTime(150);
    expect(playSectionAudio).not.toHaveBeenCalled();
  });

  test("IntersectionObserver indisponible → pas d'erreur", () => {
    vi.unstubAllGlobals();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");

    const section = makeSection({ id: "sec-1", audioPath: "audio/1.mp3" });

    expect(() => {
      renderTracker([section]);
    }).not.toThrow();

    // Restaure le stub pour les tests suivants (vi.unstubAllGlobals() est global
    // au fichier, pas au test).
    vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
  });

  test("section déjà visible au chargement → lecture rejouée au déverrouillage (geste)", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
    vi.useFakeTimers();

    // Simule la politique autoplay réelle : tant qu'aucun geste n'a eu lieu,
    // le hook ne joue rien (playSectionAudio est un no-op observable).
    let unlocked = false;
    const unlockListeners = new Set<() => void>();
    const played: Array<[string, string | null]> = [];
    const playSectionAudio = vi.fn((sectionId: string, audioUrl: string | null) => {
      if (!unlocked) return;
      played.push([sectionId, audioUrl]);
    });
    const pauseCurrent = vi.fn();
    const onUnlocked = vi.fn((listener: () => void) => {
      unlockListeners.add(listener);
      return () => {
        unlockListeners.delete(listener);
      };
    });

    const section = makeSection({ id: "sec-visible", audioPath: "audio/visible.mp3" });
    addSectionElement("sec-visible", "audio/visible.mp3");

    renderTracker([section], {
      playSectionAudio,
      pauseCurrent,
      unlocked: false,
      onUnlocked,
    });

    // IntersectionObserver émet l'état initial : la section est déjà visible.
    triggerIntersection([intersectionEntry("sec-visible", true, 0.9)]);
    vi.advanceTimersByTime(150);

    // Verrouillé : rien n'a été joué, mais la demande est mémorisée.
    expect(played).toHaveLength(0);
    expect(playSectionAudio).toHaveBeenCalledTimes(1);

    // Premier geste réel → le hook déverrouille et notifie.
    unlocked = true;
    act(() => {
      for (const listener of unlockListeners) listener();
    });

    expect(played).toEqual([["sec-visible", `${STORAGE_BASE}/audio/visible.mp3`]]);
  });

  test("déverrouillage avant la fin du debounce → une seule lecture", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
    vi.useFakeTimers();

    let unlocked = false;
    const unlockListeners = new Set<() => void>();
    const played: string[] = [];
    const playSectionAudio = vi.fn((sectionId: string) => {
      if (!unlocked) return;
      played.push(sectionId);
    });
    const onUnlocked = (listener: () => void) => {
      unlockListeners.add(listener);
      return () => {
        unlockListeners.delete(listener);
      };
    };

    const section = makeSection({ id: "sec-visible", audioPath: "audio/visible.mp3" });
    addSectionElement("sec-visible", "audio/visible.mp3");

    renderTracker([section], {
      playSectionAudio,
      unlocked: false,
      onUnlocked,
    });

    triggerIntersection([intersectionEntry("sec-visible", true, 0.9)]);

    unlocked = true;
    act(() => {
      for (const listener of unlockListeners) listener();
    });

    // Le timer de debounce restant ne doit pas rejouer la piste.
    vi.advanceTimersByTime(150);

    expect(played).toEqual(["sec-visible"]);
  });

  test("quitter le lecteur (unmount) met l'audio en pause", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");

    const section = makeSection({ id: "sec-audio", audioPath: "audio/section1.mp3" });
    addSectionElement("sec-audio", "audio/section1.mp3");

    const { pauseCurrent, unmount } = renderTracker([section]);

    unmount();

    expect(pauseCurrent).toHaveBeenCalledTimes(1);
  });

  test("batch IO : une section entre pendant qu'une autre sort → pas de pause", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
    vi.useFakeTimers();

    const section1 = makeSection({ id: "sec-1", audioPath: "audio/1.mp3" });
    const section2 = makeSection({ id: "sec-2", audioPath: "audio/2.mp3" });
    addSectionElement("sec-1", "audio/1.mp3");
    addSectionElement("sec-2", "audio/2.mp3");

    const { playSectionAudio, pauseCurrent } = renderTracker([section1, section2]);

    triggerIntersection([intersectionEntry("sec-1", true, 0.5)]);
    vi.advanceTimersByTime(150);
    expect(playSectionAudio).toHaveBeenCalledWith("sec-1", `${STORAGE_BASE}/audio/1.mp3`);

    // Un seul batch : sec-1 sort (entrée en premier) et sec-2 entre.
    triggerIntersection([
      intersectionEntry("sec-1", false, 0),
      intersectionEntry("sec-2", true, 0.5),
    ]);
    vi.advanceTimersByTime(150);

    expect(pauseCurrent).not.toHaveBeenCalled();
    expect(playSectionAudio).toHaveBeenLastCalledWith("sec-2", `${STORAGE_BASE}/audio/2.mp3`);
  });

  test("sortie d'une autre section → la lecture en attente n'est pas annulée", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
    vi.useFakeTimers();

    const section1 = makeSection({ id: "sec-1", audioPath: "audio/1.mp3" });
    const section2 = makeSection({ id: "sec-2", audioPath: "audio/2.mp3" });
    addSectionElement("sec-1", "audio/1.mp3");
    addSectionElement("sec-2", "audio/2.mp3");

    const { playSectionAudio, pauseCurrent } = renderTracker([section1, section2]);

    // sec-2 entre (lecture programmée, pas encore committée)…
    triggerIntersection([intersectionEntry("sec-2", true, 0.5)]);
    // …puis sec-1 sort avant la fin du debounce.
    triggerIntersection([intersectionEntry("sec-1", false, 0)]);

    vi.advanceTimersByTime(150);

    expect(pauseCurrent).not.toHaveBeenCalled();
    expect(playSectionAudio).toHaveBeenCalledTimes(1);
    expect(playSectionAudio).toHaveBeenCalledWith("sec-2", `${STORAGE_BASE}/audio/2.mp3`);
  });

  test("sortie d'une section sans audio → pauseCurrent non appelée", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
    vi.useFakeTimers();

    const silent = makeSection({ id: "sec-silent", audioPath: undefined });
    addSectionElement("sec-silent");

    const { playSectionAudio, pauseCurrent } = renderTracker([silent]);

    triggerIntersection([intersectionEntry("sec-silent", true, 0.9)]);
    triggerIntersection([intersectionEntry("sec-silent", false, 0)]);
    vi.advanceTimersByTime(150);

    expect(playSectionAudio).not.toHaveBeenCalled();
    expect(pauseCurrent).not.toHaveBeenCalled();
  });
});
