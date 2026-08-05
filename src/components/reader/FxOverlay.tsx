"use client";

import { useReducedMotion } from "motion/react";
import { getSupabasePublicObjectUrl } from "@/lib/supabase/public-url";
import type { FxOverlayConfig } from "@/types/webtoon";

interface FxOverlayProps {
  fxPath: string;
  fxConfig?: FxOverlayConfig;
  alt?: string;
}

const DEFAULT_FX_CONFIG: FxOverlayConfig = {
  position: { x: "center", y: "center" },
  size: { mode: "percent", width: 100 },
  opacity: 1,
};

export function FxOverlay({ fxPath, fxConfig, alt }: FxOverlayProps) {
  const reducedMotion = useReducedMotion() === true;

  if (!fxPath) return null;

  const src = getSupabasePublicObjectUrl(fxPath);
  const config = { ...DEFAULT_FX_CONFIG, ...fxConfig };
  const pos = config.position;
  const size = config.size;

  const transformParts: string[] = [];

  const style: React.CSSProperties = {
    position: "absolute",
    opacity: config.opacity,
    pointerEvents: "none",
  };

  if (size.mode === "percent") {
    style.width = `${size.width}%`;
    style.height = "auto";
  } else {
    style.width = `${size.width}px`;
    style.height = size.height != null ? `${size.height}px` : "auto";
  }

  if (pos.x === "center" && pos.y === "center") {
    style.left = "50%";
    style.top = "50%";
    style.transform = "translate(-50%, -50%)";
  } else {
    if (pos.x === "center") {
      style.left = "50%";
      transformParts.push("translateX(-50%)");
    } else if (pos.x === "right") {
      style.right = "0";
    } else {
      style.left = "0";
    }

    if (pos.y === "center") {
      style.top = "50%";
      transformParts.push("translateY(-50%)");
    } else if (pos.y === "bottom") {
      style.bottom = "0";
    } else {
      style.top = "0";
    }

    if (transformParts.length > 0) {
      style.transform = transformParts.join(" ");
    }
  }

  return (
    <img
      data-testid="fx-overlay"
      src={src}
      alt={alt ?? ""}
      style={style}
      loading="lazy"
      decoding="async"
      {...(reducedMotion ? { "aria-hidden": "true" } : {})}
    />
  );
}

export default FxOverlay;