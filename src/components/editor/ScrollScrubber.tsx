"use client";

import { useTranslations } from "next-intl";
import { Slider } from "@/components/ui/slider";

interface ScrollScrubberProps {
  progress: number;
  onProgressChange: (progress: number) => void;
}

export function ScrollScrubber({ progress, onProgressChange }: ScrollScrubberProps) {
  const t = useTranslations("editor");
  const percent = Math.round(progress * 100);
  return (
    <div
      role="group"
      aria-label={t("scrollProgress")}
      className="flex min-w-0 items-center gap-2.5 border-t border-border bg-muted/40 px-3 py-2"
    >
      <span aria-hidden="true" className="w-8 shrink-0 text-[11px] text-muted-foreground tabular-nums">0%</span>
      <Slider
        value={[Math.round(progress * 100)]}
        onValueChange={(value) => onProgressChange(value[0] / 100)}
        max={100}
        step={1}
        aria-label={t("scrollProgress")}
        className="min-w-0 flex-1"
      />
      <span aria-hidden="true" className="hidden w-8 shrink-0 text-right text-[11px] text-muted-foreground tabular-nums sm:inline">100%</span>
      <span
        role="status"
        aria-live="polite"
        className="w-12 shrink-0 rounded-md bg-background px-1.5 py-0.5 text-center text-[11px] font-medium text-foreground tabular-nums ring-1 ring-border"
      >
        {`${percent}\u00A0%`}
      </span>
    </div>
  );
}
