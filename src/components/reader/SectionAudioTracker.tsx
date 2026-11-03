"use client";

import * as React from "react";

import { useSectionAudioContext } from "./section-audio-context";
import type { SectionWithImages } from "@/lib/db/queries";
import { getSupabasePublicObjectUrl } from "@/lib/supabase/public-url";

const AUDIO_THRESHOLD = 0.4;
const DEBOUNCE_MS = 150;

interface SectionAudioTrackerProps {
  sections: SectionWithImages[];
}

interface PendingPlay {
  sectionId: string;
  audioUrl: string;
}

export function SectionAudioTracker({ sections }: SectionAudioTrackerProps) {
  const { playSectionAudio, pauseCurrent, unlocked, onUnlocked } = useSectionAudioContext();

  const sectionsRef = React.useRef(sections);
  const debounceTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  // Section dont la lecture a été demandée (en attente de déverrouillage ou en
  // cours) : seule sa propre sortie doit couper le son.
  const requestedSectionRef = React.useRef<string | null>(null);
  // Lecture mémorisée tant que l'autoplay n'est pas déverrouillé : sans ça une
  // section déjà visible au chargement ne jouerait jamais.
  const pendingPlayRef = React.useRef<PendingPlay | null>(null);

  const unlockedRef = React.useRef(unlocked);
  const pauseCurrentRef = React.useRef(pauseCurrent);

  React.useEffect(() => {
    sectionsRef.current = sections;
  }, [sections]);

  React.useEffect(() => {
    unlockedRef.current = unlocked;
  }, [unlocked]);

  React.useEffect(() => {
    pauseCurrentRef.current = pauseCurrent;
  }, [pauseCurrent]);

  // Quitter le lecteur doit couper la piste : l'élément média est un singleton
  // module, il survivrait à l'unmount et continuerait à jouer.
  React.useEffect(
    () => () => {
      pauseCurrentRef.current();
    },
    [],
  );

  // Autoplay différé : la lecture reste bloquée jusqu'au premier geste réel. On
  // rejoue la section mémorisée dès que le hook signale le déverrouillage.
  React.useEffect(() => {
    const flushPending = () => {
      const pending = pendingPlayRef.current;
      if (pending === null) return;
      // Vidé avant l'appel : le timer de debounce encore en vol ne doit pas
      // rejouer la piste une seconde fois.
      pendingPlayRef.current = null;
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      requestedSectionRef.current = pending.sectionId;
      playSectionAudio(pending.sectionId, pending.audioUrl);
    };

    // Le geste a pu déverrouiller l'audio avant le montage de ce tracker.
    if (unlocked) flushPending();

    if (typeof onUnlocked !== "function") return;
    return onUnlocked(flushPending);
  }, [onUnlocked, playSectionAudio, unlocked]);

  React.useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;

    const schedulePlay = (sectionId: string) => {
      const section = sectionsRef.current.find((candidate) => candidate.id === sectionId);
      if (!section?.audioPath) return;

      const pending: PendingPlay = {
        sectionId,
        audioUrl: buildAudioUrl(section.audioPath),
      };
      requestedSectionRef.current = sectionId;
      pendingPlayRef.current = pending;

      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      debounceTimerRef.current = setTimeout(() => {
        debounceTimerRef.current = null;
        // Une section plus récente a pris la main entre-temps.
        if (pendingPlayRef.current !== pending) return;
        playSectionAudio(pending.sectionId, pending.audioUrl);
        if (unlockedRef.current) pendingPlayRef.current = null;
      }, DEBOUNCE_MS);
    };

    const handleExit = (sectionId: string) => {
      // La sortie d'une autre section ne doit jamais annuler la lecture en
      // cours ni une lecture en attente. Sans section demandée (état inconnu),
      // on laisse la vérification ci-dessous décider.
      const requested = requestedSectionRef.current;
      if (requested !== null && requested !== sectionId) return;
      const section = sectionsRef.current.find((candidate) => candidate.id === sectionId);
      // Rien ne joue pour une section sans audio : ne pas couper la piste.
      if (!section?.audioPath) return;

      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      pendingPlayRef.current = null;
      requestedSectionRef.current = null;
      pauseCurrent();
    };

    const observer = new IntersectionObserver(
      (entries) => {
        const entering: string[] = [];
        const leaving: string[] = [];

        for (const entry of entries) {
          const sectionId = entry.target.getAttribute("data-section-id");
          if (!sectionId) continue;

          if (entry.isIntersecting && entry.intersectionRatio >= AUDIO_THRESHOLD) {
            entering.push(sectionId);
          } else if (!entry.isIntersecting) {
            leaving.push(sectionId);
          }
        }

        // Entrées traitées en premier : un même batch peut contenir l'entrée
        // d'une section et la sortie d'une autre (scroll rapide). La sortie ne
        // doit pas annuler la lecture de la section qui entre.
        for (const sectionId of entering) schedulePlay(sectionId);
        for (const sectionId of leaving) handleExit(sectionId);
      },
      { threshold: AUDIO_THRESHOLD },
    );

    const sectionElements = document.querySelectorAll("[data-section-id]");
    sectionElements.forEach((el) => observer.observe(el));

    return () => {
      observer.disconnect();
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    };
  }, [playSectionAudio, pauseCurrent]);

  return null;
}

function buildAudioUrl(audioPath: string): string {
  return getSupabasePublicObjectUrl(audioPath);
}
