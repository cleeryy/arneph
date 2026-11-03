import * as React from "react";
import { act, cleanup, renderHook } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
  READING_PROGRESS_STORAGE_PREFIX,
  useReadingProgress,
} from "../useReadingProgress";

const WEBTOON_ID = "w1";
const STORAGE_KEY = `${READING_PROGRESS_STORAGE_PREFIX}:${WEBTOON_ID}`;

let frames: Map<number, FrameRequestCallback>;
let nextFrameId: number;
const metrics = { scrollY: 0, innerHeight: 1000, scrollHeight: 4000 };

function stubScrollEnvironment() {
  metrics.scrollY = 0;
  metrics.innerHeight = 1000;
  metrics.scrollHeight = 4000;
  vi.spyOn(window, "scrollY", "get").mockImplementation(() => metrics.scrollY);
  vi.spyOn(window, "innerHeight", "get").mockImplementation(() => metrics.innerHeight);
  vi.spyOn(document.documentElement, "scrollHeight", "get").mockImplementation(
    () => metrics.scrollHeight,
  );
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  vi.spyOn(window, "scrollBy").mockImplementation(() => {});
}

function flushFrames() {
  const pending = [...frames.values()];
  frames.clear();
  act(() => {
    for (const callback of pending) callback(0);
  });
}

function emitScroll(scrollY: number) {
  metrics.scrollY = scrollY;
  act(() => {
    window.dispatchEvent(new Event("scroll"));
  });
}

function pressKey(key: string, target: EventTarget = window): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
  act(() => {
    target.dispatchEvent(event);
  });
  return event;
}

/** Harnais minimal : aucun JSX (fichier .ts). */
function ProgressHarness({ webtoonId }: { webtoonId: string }) {
  const { progress, savedProgress } = useReadingProgress({ webtoonId });
  return React.createElement("div", {
    "data-progress": progress,
    "data-saved": savedProgress === null ? "" : savedProgress,
  });
}

beforeEach(() => {
  localStorage.clear();
  frames = new Map();
  nextFrameId = 1;
  stubScrollEnvironment();
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    const id = nextFrameId++;
    frames.set(id, callback);
    return id;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => {
    frames.delete(id);
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("useReadingProgress — progression de lecture", () => {
  test("met à jour la progression au scroll et borne le ratio à [0, 1]", () => {
    const { result } = renderHook(() => useReadingProgress({ webtoonId: WEBTOON_ID }));
    expect(result.current.progress).toBe(0);

    emitScroll(1500);
    flushFrames();
    // 1500 / (4000 - 1000) = 0.5
    expect(result.current.progress).toBeCloseTo(0.5, 5);

    emitScroll(999_999);
    flushFrames();
    expect(result.current.progress).toBe(1);

    emitScroll(-400);
    flushFrames();
    expect(result.current.progress).toBe(0);
  });

  test("coalesce plusieurs scrolls dans une seule frame (rAF)", () => {
    const { result } = renderHook(() => useReadingProgress({ webtoonId: WEBTOON_ID }));

    metrics.scrollY = 300;
    act(() => {
      window.dispatchEvent(new Event("scroll"));
      window.dispatchEvent(new Event("scroll"));
      window.dispatchEvent(new Event("scroll"));
    });
    expect(frames.size).toBe(1);

    metrics.scrollY = 900;
    flushFrames();
    // Une seule mise à jour, avec la position la plus récente.
    expect(result.current.progress).toBeCloseTo(0.3, 5);
  });

  test("restaure une progression sauvegardée entre 5 % et 95 %", () => {
    localStorage.setItem(STORAGE_KEY, "0.42");
    const { result } = renderHook(() => useReadingProgress({ webtoonId: WEBTOON_ID }));
    expect(result.current.savedProgress).toBeCloseTo(0.42, 5);
  });

  test("ignore une progression sauvegardée hors bornes ou corrompue", () => {
    for (const raw of ["0.01", "0.99", "abc", "", "NaN"]) {
      localStorage.setItem(STORAGE_KEY, raw);
      const { result, unmount } = renderHook(() =>
        useReadingProgress({ webtoonId: WEBTOON_ID }),
      );
      expect(result.current.savedProgress).toBeNull();
      unmount();
    }
  });

  test("persiste après un scroll (débounce) sans écraser la valeur restaurée au montage", () => {
    localStorage.setItem(STORAGE_KEY, "0.6");
    renderHook(() => useReadingProgress({ webtoonId: WEBTOON_ID }));

    // Le montage seul (scrollY = 0) ne doit pas écraser les 60 % sauvegardés.
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(localStorage.getItem(STORAGE_KEY)).toBe("0.6");

    emitScroll(1200);
    flushFrames();
    act(() => {
      vi.advanceTimersByTime(500);
    });
    // 1200 / 3000 = 0.4
    expect(Number.parseFloat(localStorage.getItem(STORAGE_KEY) ?? "")).toBeCloseTo(0.4, 4);
  });

  test("resume() scrolle à la position sauvegardée puis masque le bouton", () => {
    localStorage.setItem(STORAGE_KEY, "0.4");
    const { result } = renderHook(() => useReadingProgress({ webtoonId: WEBTOON_ID }));
    expect(result.current.savedProgress).toBeCloseTo(0.4, 5);

    act(() => {
      result.current.resume();
    });

    // 0.4 × (4000 - 1000) = 1200
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 1200, behavior: "smooth" });
    expect(result.current.savedProgress).toBeNull();
  });

  test("clavier : flèches et PageUp/PageDown scrollent d'un viewport, Home revient en haut", () => {
    renderHook(() => useReadingProgress({ webtoonId: WEBTOON_ID }));

    const down = pressKey("ArrowDown");
    expect(down.defaultPrevented).toBe(true);
    expect(window.scrollBy).toHaveBeenLastCalledWith({ top: 1000, behavior: "smooth" });

    pressKey("PageDown");
    expect(window.scrollBy).toHaveBeenLastCalledWith({ top: 1000, behavior: "smooth" });

    pressKey("ArrowUp");
    expect(window.scrollBy).toHaveBeenLastCalledWith({ top: -1000, behavior: "smooth" });

    pressKey("PageUp");
    expect(window.scrollBy).toHaveBeenLastCalledWith({ top: -1000, behavior: "smooth" });

    pressKey("Home");
    expect(window.scrollTo).toHaveBeenLastCalledWith({ top: 0, behavior: "smooth" });
  });

  test("clavier ignoré dans les champs de saisie", () => {
    renderHook(() => useReadingProgress({ webtoonId: WEBTOON_ID }));

    const input = document.createElement("input");
    const textarea = document.createElement("textarea");
    document.body.append(input, textarea);

    const inputEvent = pressKey("ArrowDown", input);
    const textareaEvent = pressKey("PageDown", textarea);

    expect(inputEvent.defaultPrevented).toBe(false);
    expect(textareaEvent.defaultPrevented).toBe(false);
    expect(window.scrollBy).not.toHaveBeenCalled();

    input.remove();
    textarea.remove();
  });

  test("localStorage indisponible (accès refusé) : lecture et écriture silencieuses", () => {
    vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
      throw new Error("SecurityError: localStorage is disabled");
    });

    const { result } = renderHook(() => useReadingProgress({ webtoonId: WEBTOON_ID }));
    expect(result.current.savedProgress).toBeNull();

    expect(() => {
      emitScroll(900);
      flushFrames();
      act(() => {
        vi.advanceTimersByTime(500);
      });
    }).not.toThrow();
  });

  test("localStorage qui throw sur getItem/setItem : aucun throw", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });

    expect(() => {
      const { result } = renderHook(() => useReadingProgress({ webtoonId: WEBTOON_ID }));
      expect(result.current.savedProgress).toBeNull();
      emitScroll(900);
      flushFrames();
      act(() => {
        vi.advanceTimersByTime(500);
      });
    }).not.toThrow();
  });

  test("rendu SSR : aucun accès à window ni à localStorage", () => {
    const getItemSpy = vi.spyOn(Storage.prototype, "getItem");
    vi.stubGlobal("window", undefined);

    expect(() =>
      renderToString(React.createElement(ProgressHarness, { webtoonId: WEBTOON_ID })),
    ).not.toThrow();
    expect(getItemSpy).not.toHaveBeenCalled();
  });
});
