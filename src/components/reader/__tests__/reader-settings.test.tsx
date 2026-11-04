import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";

import { ReaderSettings } from "../ReaderSettings";
import {
  DEFAULT_READER_PREFERENCES,
  updateReaderPreference,
} from "@/hooks/useReaderPreferences";
import frMessages from "../../../../messages/fr.json";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  updateReaderPreference(DEFAULT_READER_PREFERENCES);
});

function renderSettings(onClose = vi.fn()) {
  render(
    <NextIntlClientProvider locale="fr" messages={frMessages}>
      <ReaderSettings open onClose={onClose} />
    </NextIntlClientProvider>,
  );
  return onClose;
}

describe("ReaderSettings", () => {
  test("affiche les deux réglages de fluidité", () => {
    renderSettings();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByLabelText("Transitions verticales fluides")).toBeChecked();
    expect(screen.getByLabelText("Panoramique fluide")).toBeChecked();
  });

  test("désactiver un réglage le persiste", () => {
    renderSettings();
    fireEvent.click(screen.getByLabelText("Transitions verticales fluides"));
    expect(
      JSON.parse(window.localStorage.getItem("arneph:reader-prefs:v1") as string),
    ).toEqual({ smoothY: false, smoothX: true });
  });

  test("Échap et la croix ferment le panneau", () => {
    const onClose = renderSettings();
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Fermer les réglages" }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
