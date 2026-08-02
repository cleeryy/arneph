"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { ArrowUp } from "lucide-react";

import { useSectionAudio, type UseSectionAudioResult } from "@/hooks/useSectionAudio";
import { SectionAudioContext } from "./section-audio-context";
import { SectionRenderer } from "./SectionRenderer";
import type { ReaderPageData } from "@/app/read/[webtoonId]/page";

// Valeur audio par défaut (SSR + première passe d'hydration). Le hook T13
// appelle useSyncExternalStore SANS getServerSnapshot → throw "Missing
// getServerSnapshot" s'il est invoqué pendant le rendu serveur. Le vrai objet
// (fonctions play/pause + isPlaying réactif) est fourni après montage par
// <AudioBinder />. Conséquence pour T16-18 : consommer l'audio via
// useSectionAudioContext(), PAS via useSectionAudio() direct (même erreur SSR).
const FALLBACK_AUDIO: UseSectionAudioResult = {
  playSectionAudio: () => {},
  pauseCurrent: () => {},
  isPlaying: false,
};

/** Monte le hook T13 côté client uniquement et pousse la valeur réelle au provider. */
function AudioBinder({ onAudio }: { onAudio: (a: UseSectionAudioResult) => void }) {
  const audio = useSectionAudio();
  const lastIsPlaying = React.useRef<boolean | null>(null);
  React.useEffect(() => {
    if (lastIsPlaying.current !== audio.isPlaying) {
      lastIsPlaying.current = audio.isPlaying;
      onAudio(audio);
    }
  }, [audio, onAudio]);
  return null;
}

/**
 * Conteneur lecteur mobile-first (PoC).
 *
 * Reçoit `ReaderPageData` du Server Component T14, rend les sections dans
 * l'ordre `position` via `SectionRenderer`, et fournit l'API audio (T13) à
 * l'arbre via `SectionAudioContext`. Aucune logique de scroll ici — elle vit
 * dans chaque composant de section (T16/T17/T18).
 */
export default function ReaderShell({ data }: { data: ReaderPageData }) {
  const t = useTranslations("reader");
  const [mounted, setMounted] = React.useState(false);
  const [audio, setAudio] = React.useState<UseSectionAudioResult>(FALLBACK_AUDIO);
  const [showBackToTop, setShowBackToTop] = React.useState(false);

  const handleAudio = React.useCallback((a: UseSectionAudioResult) => setAudio(a), []);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  React.useEffect(() => {
    const onScroll = () => setShowBackToTop(window.scrollY > 600);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Le serveur trie déjà (getWebtoon), mais le shell ne doit jamais dépendre
  // de l'ordre reçu — l'ordre de lecture est celui des positions.
  const sections = [...data.webtoon.sections].sort((a, b) => a.position - b.position);

  return (
    <SectionAudioContext.Provider value={audio}>
      <main className="flex min-h-dvh flex-col bg-background">
        <div data-testid="reader-container" className="mx-auto w-full max-w-[800px]">
          <header className="sticky top-0 z-10 border-b border-border bg-background/90 backdrop-blur">
            <div className="flex items-center justify-between gap-4 px-4 py-3">
              <h1 className="truncate font-heading text-base font-semibold tracking-tight text-foreground">
                {data.webtoon.title}
              </h1>
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                {sections.length} section{sections.length > 1 ? "s" : ""}
              </span>
            </div>
          </header>

          <div data-testid="reader-sections" className="flex flex-col">
            {sections.map((section) => (
              <SectionRenderer key={section.id} section={section} />
            ))}
          </div>
        </div>

        {showBackToTop ? (
          <button
            type="button"
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            aria-label={t("backToTop")}
            title={t("backToTop")}
            className="fixed bottom-6 right-6 z-20 inline-flex size-11 items-center justify-center rounded-full border border-border bg-background text-foreground shadow-lg transition-colors hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <ArrowUp aria-hidden="true" className="size-4" />
          </button>
        ) : null}
      </main>
      {/* Gate position enfant : le provider + main restent stables (pas de
          changement de type racine) — seul AudioBinder (hook T13 non SSR-safe)
          monte après hydration. */}
      {mounted ? <AudioBinder onAudio={handleAudio} /> : null}
    </SectionAudioContext.Provider>
  );
}
