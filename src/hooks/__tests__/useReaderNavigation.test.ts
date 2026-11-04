import { act, renderHook } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import type { SectionWithImages } from "@/lib/db/queries";
import { buildReaderSteps } from "@/lib/reader/steps";
import type { SectionConfig, SectionType } from "@/types/webtoon";
import {
  reduceWheel,
  useReaderNavigation,
  WHEEL_THRESHOLD_RATIO,
} from "@/hooks/useReaderNavigation";

function section(
  position: number,
  type: SectionType,
  config: SectionConfig,
): SectionWithImages {
  return {
    id: `s${position}`,
    webtoonId: "w1",
    position,
    type,
    config,
    images: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

const image = (p: number) =>
  section(p, "image", { type: "image", imagePath: "a.webp", width: 800, height: 1200 });
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

const H = 800;
const steps = buildReaderSteps([image(1), pan(2), longY(3), anim(4)]);

describe("reduceWheel — images", () => {
  test("n'avance qu'au-delà du seuil, sans mouvement intermédiaire", () => {
    const below = reduceWheel({ index: 0, inner: 0 }, steps, H * 0.1, H, 0);
    expect(below.state).toEqual({ index: 0, inner: 0 });
    expect(below.navigated).toBe(false);

    const above = reduceWheel(
      { index: 0, inner: 0 },
      steps,
      H * WHEEL_THRESHOLD_RATIO,
      H,
      0,
    );
    expect(above.state).toEqual({ index: 1, inner: 0 });
    expect(above.navigated).toBe(true);
  });

  test("accumule deux petits gestes jusqu'au seuil", () => {
    const first = reduceWheel({ index: 0, inner: 0 }, steps, H * 0.15, H, 0);
    expect(first.navigated).toBe(false);
    const second = reduceWheel(
      first.state,
      steps,
      H * 0.15,
      H,
      first.accumulated,
    );
    expect(second.state.index).toBe(1);
  });

  test("geste vers le haut depuis la première étape reste bloqué", () => {
    const up = reduceWheel({ index: 0, inner: 0 }, steps, -H, H, 0);
    expect(up.state).toEqual({ index: 0, inner: 0 });
  });
});

describe("reduceWheel — étapes épinglées", () => {
  test("le geste alimente la progression interne puis passe à la suite", () => {
    const half = reduceWheel({ index: 1, inner: 0 }, steps, 150, H, 0);
    expect(half.state.inner).toBeCloseTo(0.125);
    expect(half.navigated).toBe(false);

    const done = reduceWheel({ index: 1, inner: 0.9 }, steps, 200, H, 0);
    expect(done.state).toEqual({ index: 2, inner: 0 });
    expect(done.navigated).toBe(true);
  });

  test("reculer depuis une étape épinglée revient à la précédente, en butée", () => {
    const { result } = renderHook(() => useReaderNavigation(steps));
    act(() => result.current.goTo(2));
    act(() => result.current.goPrev());
    expect(result.current.index).toBe(1);
    expect(result.current.inner).toBe(1);
  });
});

describe("reduceWheel — long-y et écran de fin", () => {
  test("long-y laisse le scroll natif, sans navigation", () => {
    const result = reduceWheel({ index: 2, inner: 0 }, steps, 500, H, 0);
    expect(result.state).toEqual({ index: 2, inner: 0 });
    expect(result.navigated).toBe(false);
  });

  test("écran de fin : le geste vers le haut revient sur la dernière étape", () => {
    const back = reduceWheel({ index: steps.length, inner: 0 }, steps, -50, H, 0);
    expect(back.state.index).toBe(steps.length - 1);
    expect(back.navigated).toBe(true);
    const stay = reduceWheel({ index: steps.length, inner: 0 }, steps, 50, H, 0);
    expect(stay.navigated).toBe(false);
  });
});

describe("useReaderNavigation", () => {
  test("tap à gauche recule, ailleurs avance", () => {
    const { result } = renderHook(() => useReaderNavigation(steps));
    act(() => result.current.handleTap(10, 390));
    expect(result.current.index).toBe(0);
    act(() => result.current.handleTap(200, 390));
    expect(result.current.index).toBe(1);
    act(() => result.current.handleTap(10, 390));
    expect(result.current.index).toBe(0);
  });

  test("clavier : flèches, Home et End", () => {
    const { result } = renderHook(() => useReaderNavigation(steps));
    act(() => {
      result.current.handleKey("ArrowDown");
    });
    expect(result.current.index).toBe(1);
    act(() => {
      result.current.handleKey("End");
    });
    expect(result.current.isEnd).toBe(true);
    act(() => {
      result.current.handleKey("Home");
    });
    expect(result.current.index).toBe(0);
    expect(result.current.handleKey("a")).toBe(false);
  });

  test("goPrev depuis l'écran de fin revient à la dernière étape", () => {
    const { result } = renderHook(() => useReaderNavigation(steps));
    act(() => result.current.goTo(steps.length));
    expect(result.current.isEnd).toBe(true);
    act(() => result.current.goPrev());
    expect(result.current.index).toBe(steps.length - 1);
    expect(result.current.isEnd).toBe(false);
  });
});
