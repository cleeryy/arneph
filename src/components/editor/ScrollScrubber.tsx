"use client";

import { Slider } from "@/components/ui/slider";

interface ScrollScrubberProps {
  progress: number;
  onProgressChange: (progress: number) => void;
}

export function ScrollScrubber({ progress, onProgressChange }: ScrollScrubberProps) {
  return (
    <div className="flex items-center gap-3 px-2 py-1">
      <span className="text-xs text-muted-foreground tabular-nums">0%</span>
      <Slider
        value={[Math.round(progress * 100)]}
        onValueChange={(value) => onProgressChange(value[0] / 100)}
        max={100}
        step={1}
        className="flex-1"
      />
      <span className="text-xs text-muted-foreground tabular-nums">100%</span>
    </div>
  );
}
