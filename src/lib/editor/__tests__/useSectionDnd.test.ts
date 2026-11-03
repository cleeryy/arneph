import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { DragEndEvent } from "@dnd-kit/core";

import { useSectionDnd } from "../useSectionDnd";
import type { SectionWithImages } from "@/lib/db/queries";

afterEach(cleanup);

function makeSection(id: string, position: number): SectionWithImages {
  const now = "2026-01-01T00:00:00.000Z";
  return {
    id,
    webtoonId: "webtoon-1",
    position,
    type: "image",
    config: { type: "image", imagePath: "", width: 0, height: 0 },
    images: [],
    audioPath: undefined,
    createdAt: now,
    updatedAt: now,
  } as SectionWithImages;
}

function dragEnd(activeId: string, overId: string | null): DragEndEvent {
  return {
    active: { id: activeId },
    over: overId === null ? null : { id: overId },
  } as unknown as DragEndEvent;
}

describe("useSectionDnd", () => {
  test("expose les sections triées par position et leurs ids", () => {
    const sections = [makeSection("c", 3), makeSection("a", 1), makeSection("b", 2)];

    const { result } = renderHook(() => useSectionDnd(sections, vi.fn()));

    expect(result.current.sorted.map((section) => section.id)).toEqual(["a", "b", "c"]);
    expect(result.current.sortedIds).toEqual(["a", "b", "c"]);
  });

  test("installe les capteurs pointeur + clavier", () => {
    const { result } = renderHook(() => useSectionDnd([makeSection("a", 1)], vi.fn()));

    expect(result.current.sensors).toHaveLength(2);
  });

  test("réordonne et renumérote au drop", () => {
    const sections = [makeSection("a", 1), makeSection("b", 2), makeSection("c", 3)];
    const onReorder = vi.fn();

    const { result } = renderHook(() => useSectionDnd(sections, onReorder));

    act(() => {
      result.current.handleDragEnd(dragEnd("a", "c"));
    });

    expect(onReorder).toHaveBeenCalledTimes(1);
    const next = onReorder.mock.calls[0][0] as SectionWithImages[];
    expect(next.map((section) => section.id)).toEqual(["b", "c", "a"]);
    expect(next.map((section) => section.position)).toEqual([1, 2, 3]);
  });

  test("ignore un drop sans effet (même cible)", () => {
    const onReorder = vi.fn();
    const { result } = renderHook(() =>
      useSectionDnd([makeSection("a", 1), makeSection("b", 2)], onReorder),
    );

    act(() => {
      result.current.handleDragEnd(dragEnd("a", "a"));
    });

    expect(onReorder).not.toHaveBeenCalled();
  });

  test("ignore un drop sans cible (over null)", () => {
    const onReorder = vi.fn();
    const { result } = renderHook(() =>
      useSectionDnd([makeSection("a", 1), makeSection("b", 2)], onReorder),
    );

    act(() => {
      result.current.handleDragEnd(dragEnd("a", null));
    });

    expect(onReorder).not.toHaveBeenCalled();
  });

  test("ignore des ids inconnus", () => {
    const onReorder = vi.fn();
    const { result } = renderHook(() =>
      useSectionDnd([makeSection("a", 1), makeSection("b", 2)], onReorder),
    );

    act(() => {
      result.current.handleDragEnd(dragEnd("ghost", "b"));
    });

    expect(onReorder).not.toHaveBeenCalled();
  });
});
