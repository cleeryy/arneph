"use client";

import { useSyncExternalStore } from "react";

import { getSupabasePublicObjectUrl } from "@/lib/supabase/public-url";
import type { FxOverlayConfig } from "@/types/webtoon";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeToReducedMotion(onChange: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return () => {};
  }
  const mediaQuery = window.matchMedia(REDUCED_MOTION_QUERY);
  mediaQuery.addEventListener("change", onChange);
  return () => mediaQuery.removeEventListener("change", onChange);
}

function getReducedMotionSnapshot(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

/** Snapshot serveur/hydratation : aucune préférence connue → mouvement autorisé. */
function getReducedMotionServerSnapshot(): boolean {
  return false;
}

/**
 * Préférence système `prefers-reduced-motion` sans dépendance à `motion`.
 *
 * `useSyncExternalStore` garde le rendu SSR stable (`false`) puis se synchronise
 * avec le média côté navigateur, y compris quand l'utilisateur change le réglage.
 */
function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeToReducedMotion,
    getReducedMotionSnapshot,
    getReducedMotionServerSnapshot,
  );
}

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
  const reducedMotion = usePrefersReducedMotion();

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
    zIndex: 1,
    maxWidth: "100%",
    userSelect: "none",
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