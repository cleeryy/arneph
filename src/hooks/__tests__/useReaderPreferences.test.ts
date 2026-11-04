import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";

import {
  DEFAULT_READER_PREFERENCES,
  updateReaderPreference,
  useReaderPreferences,
} from "@/hooks/useReaderPreferences";

afterEach(() => {
  window.localStorage.clear();
  updateReaderPreference(DEFAULT_READER_PREFERENCES);
});

describe("useReaderPreferences", () => {
  test("valeurs par défaut quand rien n'est stocké", () => {
    const { result } = renderHook(() => useReaderPreferences());
    expect(result.current.preferences).toEqual(DEFAULT_READER_PREFERENCES);
  });

  test("met à jour et persiste les préférences", () => {
    const { result } = renderHook(() => useReaderPreferences());
    act(() => result.current.update({ smoothY: false, smoothX: false }));
    expect(result.current.preferences).toEqual({ smoothY: false, smoothX: false });

    const raw = window.localStorage.getItem("arneph:reader-prefs:v1");
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw as string)).toEqual({ smoothY: false, smoothX: false });
  });

  test("ignore un contenu corrompu", () => {
    window.localStorage.setItem("arneph:reader-prefs:v1", "{not json");
    const { result } = renderHook(() => useReaderPreferences());
    expect(result.current.preferences).toEqual(DEFAULT_READER_PREFERENCES);
  });
});
