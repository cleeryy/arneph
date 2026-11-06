"use client";

import * as React from "react";
import { Slider } from "@base-ui/react/slider";

import { cn } from "@/lib/utils";

function SliderComponent({
  className,
  value,
  defaultValue,
  onValueChange,
  onValueCommitted,
  max = 100,
  step = 1,
  min = 0,
  ...props
}: {
  value?: number[];
  defaultValue?: number[];
  onValueChange?: (value: number[]) => void;
  onValueCommitted?: (value: number[]) => void;
  max?: number;
  min?: number;
  step?: number;
  className?: string;
}) {
  return (
    <Slider.Root
      data-slot="slider"
      className={cn(
        "relative flex w-full touch-none select-none items-center",
        className,
      )}
      value={value}
      defaultValue={defaultValue}
      onValueChange={onValueChange}
      onValueCommitted={onValueCommitted}
      max={max}
      min={min}
      step={step}
      {...props}
    >
      <Slider.Track className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-muted">
        <Slider.Indicator className="absolute h-full rounded-full bg-primary" />
      </Slider.Track>
      <Slider.Thumb className="block h-4 w-4 rounded-full border-2 border-primary bg-background ring-offset-background transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" />
    </Slider.Root>
  );
}

export { SliderComponent as Slider };