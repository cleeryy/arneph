"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { X } from "lucide-react";

import { useReaderPreferences } from "@/hooks/useReaderPreferences";

export interface ReaderSettingsProps {
  open: boolean;
  onClose: () => void;
}

function Toggle({
  id,
  label,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label
      htmlFor={id}
      className="flex items-center justify-between gap-4 rounded-lg border border-border/60 px-3 py-2.5"
    >
      <span className="text-sm text-foreground">{label}</span>
      <input
        id={id}
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="size-5 accent-primary"
      />
    </label>
  );
}

/** Panneau de réglages du lecteur (préférences globales du navigateur). */
export function ReaderSettings({ open, onClose }: ReaderSettingsProps) {
  const t = useTranslations("reader");
  const { preferences, update } = useReaderPreferences();
  const closeButtonRef = React.useRef<HTMLButtonElement>(null);
  const previouslyFocused = React.useRef<HTMLElement | null>(null);

  React.useEffect(() => {
    if (!open) return;
    const active = document.activeElement;
    previouslyFocused.current = active instanceof HTMLElement ? active : null;
    closeButtonRef.current?.focus();
    return () => {
      const target = previouslyFocused.current;
      previouslyFocused.current = null;
      if (target && typeof target.focus === "function" && target.isConnected) {
        target.focus();
      }
    };
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="reader-settings-title"
      data-testid="reader-settings"
      className="absolute inset-0 z-40 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      onClick={(event) => {
        // La modale est posée au-dessus du deck : aucun geste ne doit fuir
        // vers la navigation (clic, molette, tactile).
        event.stopPropagation();
        if (event.target === event.currentTarget) onClose();
      }}
      onWheel={(event) => event.stopPropagation()}
      onTouchStart={(event) => event.stopPropagation()}
      onTouchMove={(event) => event.stopPropagation()}
    >
      <div
        className="w-full max-w-sm rounded-xl border border-border bg-background p-4 shadow-xl"
        onClick={(event) => event.stopPropagation()}
        onWheel={(event) => event.stopPropagation()}
        onTouchStart={(event) => event.stopPropagation()}
        onTouchMove={(event) => event.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2
            id="reader-settings-title"
            className="font-heading text-base font-semibold"
          >
            {t("settingsTitle")}
          </h2>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label={t("settingsClose")}
            className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        </div>

        <div className="flex flex-col gap-2">
          <Toggle
            id="reader-smooth-y"
            label={t("settingsSmoothY")}
            checked={preferences.smoothY}
            onChange={(smoothY) => update({ smoothY })}
          />
          <Toggle
            id="reader-smooth-x"
            label={t("settingsSmoothX")}
            checked={preferences.smoothX}
            onChange={(smoothX) => update({ smoothX })}
          />
        </div>

        <p className="mt-3 text-xs text-muted-foreground">{t("settingsHint")}</p>
      </div>
    </div>
  );
}
