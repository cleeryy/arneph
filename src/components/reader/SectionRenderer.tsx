"use client";

import type { SectionWithImages } from "@/lib/db/queries";
import { AnimationSection } from "./AnimationSection";
import { ImageSection } from "./ImageSection";
import { LongYSection } from "./LongYSection";
import PanXSection from "./PanXSection";

export interface SectionRendererProps {
  section: SectionWithImages;
}

export function SectionRenderer({ section }: SectionRendererProps) {
  switch (section.type) {
    case "image":
      return <ImageSection section={section} priority={section.position === 1} />;
    case "long-y":
      return <LongYSection section={section} priority={section.position === 1} />;
    case "pan-x":
      return <PanXSection section={section} />;
    case "animation":
      return <AnimationSection section={section} />;
    default:
      // Union fermée (T7) — jamais atteint, préserve l'exhaustivité.
      return null;
  }
}
