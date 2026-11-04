"use client";

import * as React from "react";

export interface ReaderPreferences {
  /** Transition verticale entre deux écrans. */
  smoothY: boolean;
  /** Glissement horizontal progressif du panoramique. */
  smoothX: boolean;
}

export const DEFAULT_READER_PREFERENCES: ReaderPreferences = {
  smoothY: true,
  smoothX: true,
};

const STORAGE_KEY = "arneph:reader-prefs:v1";

let cached: ReaderPreferences | null = null;
const listeners = new Set<() => void>();

function read(): ReaderPreferences {
  if (typeof window === "undefined") return DEFAULT_READER_PREFERENCES;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_READER_PREFERENCES;
    const parsed = JSON.parse(raw) as Partial<ReaderPreferences>;
    return {
      smoothY:
        typeof parsed.smoothY === "boolean"
          ? parsed.smoothY
          : DEFAULT_READER_PREFERENCES.smoothY,
      smoothX:
        typeof parsed.smoothX === "boolean"
          ? parsed.smoothX
          : DEFAULT_READER_PREFERENCES.smoothX,
    };
  } catch {
    return DEFAULT_READER_PREFERENCES;
  }
}

function getSnapshot(): ReaderPreferences {
  if (cached === null) cached = read();
  return cached;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function persist(preferences: ReaderPreferences): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    /* stockage indisponible : la préférence reste en mémoire */
  }
}

/** Met à jour une préférence (globale au navigateur, pas au webtoon). */
export function updateReaderPreference(
  patch: Partial<ReaderPreferences>,
): void {
  cached = { ...getSnapshot(), ...patch };
  persist(cached);
  for (const listener of listeners) listener();
}

export function useReaderPreferences(): {
  preferences: ReaderPreferences;
  update: typeof updateReaderPreference;
} {
  const preferences = React.useSyncExternalStore(
    subscribe,
    getSnapshot,
    () => DEFAULT_READER_PREFERENCES,
  );
  return { preferences, update: updateReaderPreference };
}
