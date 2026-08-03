"use client";

import * as React from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";

import { panDistance, panXFromProgress } from "@/lib/scroll/transforms";
import { SCROLL_DISTANCES } from "@/lib/scroll/constants";
import { webtoonSizes } from "@/lib/image/sizes";
import type { SectionWithImages } from "@/lib/db/queries";
import type { PanXSectionConfig } from "@/types/webtoon";

/** URL publique d'un objet du bucket storage `webtoon-images`. */
function storageUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return `${base}/storage/v1/object/public/webtoon-images/${path}`;
}

/** Section pan-x : image large pannée horizontalement par le scroll sticky (T17). */
export default function PanXSection({ section }: { section: SectionWithImages }) {
  const t = useTranslations("reader.section");

  // T7 : `config` est l'autorité (dimensions réelles de l'image). L'enregistrement
  // `images[0]` fournit le chemin storage ; `config.imagePath` est le repli
  // (même sémantique de chemin).
  const config = section.config as PanXSectionConfig;
  const image = section.images[0];
  const imageWidth = config.width ?? image?.width ?? 0;
  const imageHeight = config.height ?? image?.height ?? 0;
  const src = image?.storagePath
    ? storageUrl(image.storagePath)
    : config.imagePath
      ? storageUrl(config.imagePath)
      : undefined;

  const sectionRef = React.useRef<HTMLElement>(null);
  const stickyRef = React.useRef<HTMLDivElement>(null);

  // Largeur réelle du conteneur sticky (le "viewport" de pan). Mesurée au
  // montage via ResizeObserver — le pan ne peut être calculé qu'une fois le
  // conteneur rendu. 0 avant mesure → aucun pan transitoire.
  const [viewportWidth, setViewportWidth] = React.useState(0);

  const reduceMotion = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start start", "end end"],
  });

  // Distance de scroll synthétique (vh) pour parcourir tout le pan. Défaut :
  // SCROLL_DISTANCES['pan-x'] (300). Si `panSpeed` est fourni (px de pan par
  // vh, T9), on dérive la hauteur depuis panDistance — mais jamais avant la
  // mesure du viewport (évite un mismatch SSR/hydration).
  const distanceVh = React.useMemo(() => {
    if (config.panSpeed != null && viewportWidth > 0) {
      const vh = panDistance(imageWidth, viewportWidth, config.panSpeed);
      return vh > 0 ? vh : SCROLL_DISTANCES["pan-x"];
    }
    return SCROLL_DISTANCES["pan-x"];
  }, [config.panSpeed, imageWidth, viewportWidth]);

  // maxPan = panXFromProgress(1, ...) → surplus de largeur, clampé à 0 si
  // l'image ≤ viewport (T9). Le transform va de 0 à -maxPan : l'image part
  // alignée à gauche et glisse vers la gauche pour révéler son côté droit.
  const maxPan = React.useMemo(
    () => panXFromProgress(1, imageWidth, viewportWidth),
    [imageWidth, viewportWidth],
  );
  const x = useTransform(scrollYProgress, [0, 1], [0, -maxPan]);

  React.useEffect(() => {
    const el = stickyRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width > 0) setViewportWidth(width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const label = t("panX");

  // reduced-motion OU rien à panner (image ≤ conteneur) : rendu statique —
  // image centrée, clampée au conteneur, aucune section synthétique.
  // Utilise next/image (pas de <img> natif) pour l'optimisation.
  if (reduceMotion || maxPan <= 0) {
    return (
      <section
        role="article"
        aria-label={label}
        data-testid="pan-x-section"
        data-section-id={section.id}
        data-section-position={section.position}
        data-section-type={section.type}
        className="mx-auto w-full overflow-hidden border-b border-border bg-muted/20"
      >
        {src && image ? (
          <Image
            src={src}
            alt={label}
            width={image.width}
            height={image.height}
            sizes={webtoonSizes()}
            className="mx-auto block h-auto w-full"
            style={{ maxWidth: imageWidth > 0 ? imageWidth : undefined }}
          />
        ) : null}
      </section>
    );
  }

  return (
    <section
      ref={sectionRef}
      role="article"
      aria-label={label}
      data-testid="pan-x-section"
      data-section-id={section.id}
      data-section-position={section.position}
      data-section-type={section.type}
      className="relative"
      style={{ height: `${distanceVh}vh` }}
    >
      <div
        ref={stickyRef}
        data-testid="pan-x-sticky"
        className="sticky top-0 h-screen overflow-hidden"
      >
        <div className="flex h-full items-center">
          {/* will-change UNIQUEMENT sur l'élément animé (le motion.img) —
              jamais sur le conteneur sticky. */}
          <motion.img
            src={src}
            alt={label}
            data-testid="pan-x-image"
            className="block shrink-0"
            style={{ width: imageWidth, height: imageHeight, x, willChange: "transform" }}
          />
        </div>
      </div>
    </section>
  );
}
