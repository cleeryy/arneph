"use client";

import * as React from "react";

import { useSectionAudioContext } from "./section-audio-context";
import type { SectionWithImages } from "@/lib/db/queries";

const AUDIO_THRESHOLD = 0.4;
const DEBOUNCE_MS = 150;

interface SectionAudioTrackerProps {
  sections: SectionWithImages[];
}

export function SectionAudioTracker({ sections }: SectionAudioTrackerProps) {
  const { playSectionAudio, pauseCurrent } = useSectionAudioContext();
  const sectionsRef = React.useRef(sections);
  const debounceTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  sectionsRef.current = sections;

  React.useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const sectionId = entry.target.getAttribute("data-section-id");
          if (!sectionId) continue;

          if (entry.isIntersecting && entry.intersectionRatio >= AUDIO_THRESHOLD) {
            if (debounceTimerRef.current) {
              clearTimeout(debounceTimerRef.current);
            }
            debounceTimerRef.current = setTimeout(() => {
              const currentSections = sectionsRef.current;
              const section = currentSections.find((s) => s.id === sectionId);
              if (section?.audioPath) {
                playSectionAudio(section.id, buildAudioUrl(section.audioPath));
              }
            }, DEBOUNCE_MS);
          } else if (!entry.isIntersecting) {
            if (debounceTimerRef.current) {
              clearTimeout(debounceTimerRef.current);
              debounceTimerRef.current = null;
            }
            pauseCurrent();
          }
        }
      },
      { threshold: AUDIO_THRESHOLD }
    );

    const sectionElements = document.querySelectorAll("[data-section-id]");
    sectionElements.forEach((el) => observer.observe(el));

    return () => {
      observer.disconnect();
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [playSectionAudio, pauseCurrent]);

  return null;
}

function buildAudioUrl(audioPath: string): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  return `${base}/storage/v1/object/public/webtoon-images/${audioPath}`;
}
