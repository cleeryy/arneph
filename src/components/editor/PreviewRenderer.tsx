"use client";

import * as React from "react";

import { panXFromProgress, frameIndexFromProgress, spritePositionFromFrame } from "@/lib/scroll/transforms";
import type { SectionWithImages } from "@/lib/db/queries";
import type { PanXSectionConfig, AnimationSectionConfig } from "@/types/webtoon";
import { getSupabasePublicObjectUrl } from "@/lib/supabase/public-url";
import { ImageSection } from "../reader/ImageSection";
import { LongYSection } from "../reader/LongYSection";

interface PreviewRendererProps {
  section: SectionWithImages;
  progress?: number;
}

export function PreviewRenderer({ section, progress = 0 }: PreviewRendererProps) {
  switch (section.type) {
    case "image":
      return <ImageSection section={section} priority={section.position === 1} />;
    case "long-y":
      return <LongYSection section={section} priority={section.position === 1} />;
    case "pan-x":
      return <PanXPreview section={section} progress={progress} />;
    case "animation":
      return <AnimationPreview section={section} progress={progress} />;
    default:
      return null;
  }
}

function PanXPreview({ section, progress }: { section: SectionWithImages; progress: number }) {
  const config = section.config as PanXSectionConfig;
  const image = section.images[0];
  const imageWidth = config.width ?? image?.width ?? 0;
  const imageHeight = config.height ?? image?.height ?? 0;
  const src = image?.storagePath
    ? sectionImageUrl(image.storagePath)
    : config.imagePath
      ? sectionImageUrl(config.imagePath)
      : undefined;

  const containerRef = React.useRef<HTMLDivElement>(null);
  const [viewportWidth, setViewportWidth] = React.useState(0);

  React.useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width > 0) setViewportWidth(width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const panX = panXFromProgress(progress, imageWidth, viewportWidth || imageWidth);

  if (!src || !image) return null;

  return (
    <div
      ref={containerRef}
      data-testid="preview-pan-x"
      data-section-type="pan-x"
      className="relative mx-auto w-full overflow-hidden border-b border-border bg-muted/20"
      style={{ aspectRatio: `${imageWidth} / ${imageHeight}`, maxHeight: "300px" }}
    >
      {/* Pan pixel-exact (translateX) sur image 1600px : next/image cassé la
          géométrie via optimization/sizes — <img> natif requis ici. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt="pan-x preview"
        className="block h-full w-auto shrink-0"
        style={{ width: imageWidth, transform: `translateX(-${panX}px)` }}
      />
    </div>
  );
}

function AnimationPreview({ section, progress }: { section: SectionWithImages; progress: number }) {
  const config = section.config as AnimationSectionConfig;
  const frameCount = Math.max(1, Math.floor(config.frameCount));
  const columns = Math.max(1, Math.floor(config.columns));
  const rows = Math.max(1, Math.floor(config.rows));
  const frameIndex = frameIndexFromProgress(progress, frameCount);
  const { x, y } = spritePositionFromFrame(
    frameIndex,
    columns,
    config.frameWidth,
    config.frameHeight,
  );

  const spritePath = section.images[0]?.storagePath ?? config.spritePath;
  const backgroundImage = spriteUrl(spritePath);
  const backgroundSize = `${columns * config.frameWidth}px ${rows * config.frameHeight}px`;

  return (
    <div
      data-testid="preview-animation"
      data-section-type="animation"
      className="relative mx-auto w-full overflow-hidden border-b border-border bg-muted/20"
      style={{
        aspectRatio: `${config.frameWidth * columns} / ${config.frameHeight * rows}`,
        maxHeight: "300px",
      }}
    >
      <div
        className="h-full w-full"
        style={{
          backgroundImage: `url("${backgroundImage}")`,
          backgroundSize,
          backgroundRepeat: "no-repeat",
          backgroundPosition: `-${x}px -${y}px`,
          imageRendering: "pixelated",
        }}
      />
    </div>
  );
}

function sectionImageUrl(storagePath: string): string {
  return getSupabasePublicObjectUrl(storagePath);
}

function spriteUrl(storagePath: string): string {
  return getSupabasePublicObjectUrl(storagePath);
}
