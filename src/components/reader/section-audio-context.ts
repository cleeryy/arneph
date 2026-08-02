"use client";

import * as React from "react";

import type { UseSectionAudioResult } from "@/hooks/useSectionAudio";

/**
 * Contexte audio fourni par ReaderShell (T15) à l'arbre des sections.
 *
 * Décision (documentée dans learnings.md T15) : le hook T13 est un singleton
 * module ("une piste à la fois") et n'a pas besoin de contexte pour
 * fonctionner. On fournit quand même l'objet renvoyé par useSectionAudio()
 * via ce contexte pour satisfaire le contrat T15 ("provider audio à ce
 * niveau") : les sections T16/T17/T18 le consomment via
 * useSectionAudioContext() sans props audio explicites. Fichier séparé pour
 * éviter le cycle d'import ReaderShell → SectionRenderer → ReaderShell.
 */
export const SectionAudioContext = React.createContext<UseSectionAudioResult | null>(null);

export function useSectionAudioContext(): UseSectionAudioResult {
  const ctx = React.useContext(SectionAudioContext);
  if (ctx === null) {
    throw new Error(
      "useSectionAudioContext must be used within ReaderShell (SectionAudioContext.Provider)",
    );
  }
  return ctx;
}
