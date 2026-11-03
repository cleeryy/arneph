"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";

import { panDistance, panXFromProgress } from "@/lib/scroll/transforms";
import { SCROLL_DISTANCES } from "@/lib/scroll/constants";
import type { SectionWithImages } from "@/lib/db/queries";
import type { PanXSectionConfig } from "@/types/webtoon";
import { getSupabasePublicObjectUrl } from "@/lib/supabase/public-url";

/** URL publique d'un objet du bucket storage `webtoon-images`. */
function storageUrl(path: string): string {
  return getSupabasePublicObjectUrl(path);
}

/** Premier chemin non vide (les chaînes blanches comptent comme absentes). */
function firstNonBlank(...candidates: Array<string | undefined | null>): string {
  for (const candidate of candidates) {
    const value = typeof candidate === "string" ? candidate.trim() : "";
    if (value) return value;
  }
  return "";
}

/**
 * Section pan-x : image large pannée horizontalement par le scroll sticky (T17).
 *
 * Trois états distincts, dans cet ordre :
 * 1. média absent → placeholder borné (jamais de zone de scroll vide) ;
 * 2. viewport inconnu (ou pan impossible / reduced-motion) → boîte neutre d'un
 *    écran, sans position sticky ni hauteur synthétique ;
 * 3. viewport mesuré et pan possible → mode scroll-driven (`distanceVh`).
 *
 * La bascule 2 → 3 ne change pas la boîte visible (même `h-screen`
 * `overflow-hidden`, même position de départ de l'image) : le
 * ResizeObserver ne provoque donc aucun saut de lecture.
 */
export default function PanXSection({ section }: { section: SectionWithImages }) {
  const t = useTranslations("reader.section");

  // T7 : `config` est l'autorité (dimensions réelles de l'image). L'enregistrement
  // `images[0]` fournit le chemin storage ; `config.imagePath` est le repli
  // (même sémantique de chemin). Un chemin vide/blanc des deux côtés = média
  // absent : on ne construit surtout pas d'URL vers la racine du bucket.
  const config = section.config as PanXSectionConfig;
  const image = section.images[0];
  const imageWidth = config.width ?? image?.width ?? 0;
  const imageHeight = config.height ?? image?.height ?? 0;
  const storagePath = firstNonBlank(image?.storagePath, config.imagePath);
  const src = storagePath ? storageUrl(storagePath) : undefined;

  const sectionRef = React.useRef<HTMLElement>(null);
  const stickyRef = React.useRef<HTMLDivElement>(null);

  // Largeur réelle du conteneur (le "viewport" de pan). Mesurée au montage via
  // ResizeObserver. 0 = viewport encore inconnu → mode neutre, jamais de
  // hauteur 300vh sur la base d'une mesure absente.
  const [viewportWidth, setViewportWidth] = React.useState(0);
  const measured = viewportWidth > 0;

  const reduceMotion = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start start", "end end"],
  });

  // maxPan = surplus de largeur, clampé à 0 si l'image ≤ viewport (T9).
  // Tant que le viewport n'est pas mesuré, il n'y a pas de pan calculable.
  const maxPan = measured ? panXFromProgress(1, imageWidth, viewportWidth) : 0;
  const canPan = measured && maxPan > 0;

  // Distance de scroll synthétique (vh) pour parcourir tout le pan. Défaut :
  // SCROLL_DISTANCES['pan-x'] (300). Si `panSpeed` est fourni (px de pan par
  // vh, T9), on dérive la hauteur depuis panDistance. Cette distance n'est
  // appliquée qu'en mode scroll (jamais avant la mesure).
  const distanceVh = React.useMemo(() => {
    if (config.panSpeed != null && measured) {
      const vh = panDistance(imageWidth, viewportWidth, config.panSpeed);
      return vh > 0 ? vh : SCROLL_DISTANCES["pan-x"];
    }
    return SCROLL_DISTANCES["pan-x"];
  }, [config.panSpeed, imageWidth, measured, viewportWidth]);

  // Le transform va de 0 à -maxPan : l'image part alignée à gauche et glisse
  // vers la gauche pour révéler son côté droit.
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
  const sectionData = {
    role: "article",
    "aria-label": label,
    "data-testid": "pan-x-section",
    "data-section-id": section.id,
    "data-section-position": section.position,
    "data-section-type": section.type,
  } as const;

  // 1. Média absent : placeholder borné (une section pleine hauteur vide
  //    donnerait une zone de scroll morte et une requête 404).
  if (!src) {
    return (
      <section {...sectionData} className="relative bg-background">
        <div
          data-testid="pan-x-placeholder"
          className="mx-auto h-40 max-h-[40vh] w-full max-w-3xl overflow-hidden border-b border-border bg-muted/20"
        />
      </section>
    );
  }

  const mediaImg = (props: { withTransform: boolean }) => (
    <motion.img
      src={src}
      alt={label}
      data-testid="pan-x-image"
      className="block shrink-0 bg-muted/20 select-none"
      style={{
        width: imageWidth,
        height: imageHeight,
        ...(props.withTransform ? { x, willChange: "transform" } : {}),
      }}
      loading="lazy"
      decoding="async"
      draggable={false}
    />
  );

  // 2a. Flux natif : reduced-motion, ou image qui tient déjà dans le viewport
  //     (maxPan ≤ 0) → aucun défilement synthétique, image rétrécie au besoin.
  if (reduceMotion || (measured && maxPan <= 0)) {
    return (
      <section
        {...sectionData}
        className="mx-auto grid w-full place-items-center overflow-hidden border-b border-border bg-background"
      >
        <img
          src={src}
          alt={label}
          data-testid="pan-x-image"
          className="mx-auto block h-auto bg-muted/20 select-none"
          style={{ width: imageWidth, maxWidth: "100%", height: imageHeight }}
          loading="lazy"
          decoding="async"
          draggable={false}
        />
      </section>
    );
  }

  // 2b. Viewport inconnu : état neutre borné à un écran, sans sticky ni
  //     hauteur synthétique. L'image est déjà dans sa boîte finale (largeur
  //     réelle, alignée à gauche) pour que la bascule vers le mode scroll ne
  //     déplace rien de ce que le lecteur voit.
  if (!canPan) {
    return (
      <section ref={sectionRef} {...sectionData} className="relative bg-background">
        <div
          ref={stickyRef}
          data-testid="pan-x-neutral"
          className="h-screen overflow-hidden supports-[height:100svh]:h-[100svh]"
        >
          <div className="flex h-full items-center">{mediaImg({ withTransform: false })}</div>
        </div>
      </section>
    );
  }

  // 3. Mode scroll-driven : le sticky et la hauteur `distanceVh` n'apparaissent
  //    qu'une fois le viewport mesuré et le pan possible.
  return (
    <section
      ref={sectionRef}
      {...sectionData}
      className="relative bg-background"
      style={{ height: `${distanceVh}vh` }}
    >
      <div
        ref={stickyRef}
        data-testid="pan-x-sticky"
        className="sticky top-0 h-screen overflow-hidden supports-[height:100svh]:h-[100svh]"
      >
        <div className="flex h-full items-center">
          {/* will-change UNIQUEMENT sur l'élément animé (le motion.img) —
              jamais sur le conteneur sticky. */}
          {mediaImg({ withTransform: true })}
        </div>
      </div>
    </section>
  );
}
