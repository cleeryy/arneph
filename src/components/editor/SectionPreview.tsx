"use client";

import type { SectionWithImages } from "@/lib/db/queries";
import { PreviewRenderer } from "./PreviewRenderer";
import { ScrollScrubber } from "./ScrollScrubber";
import { useState, useCallback } from "react";

interface SectionPreviewProps {
  section: SectionWithImages;
}

export function SectionPreview({ section }: SectionPreviewProps) {
  const isScrollDriven = section.type === "pan-x" || section.type === "animation";
  const [progress, setProgress] = useState(0);
  const handleProgressChange = useCallback((value: number) => {
    setProgress(value);
  }, []);

  return (
    <div data-testid="section-preview" data-section-type={section.type}>
      <PreviewRenderer section={section} progress={progress} />
      {isScrollDriven ? (
        <ScrollScrubber progress={progress} onProgressChange={handleProgressChange} />
      ) : null}
    </div>
  );
}
