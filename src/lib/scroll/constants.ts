import type { SectionType } from '@/types/webtoon';

/** Largeur cible d'export des images à l'upload (optimisation, décision utilisateur). */
export const TARGET_WIDTH = 1600;

/**
 * Distance de scroll synthétique (en vh) générée pour chaque type de section.
 * Les types statiques (image, long-y) n'ajoutent pas de hauteur : défilement natif.
 */
export const SCROLL_DISTANCES: Record<SectionType, number> = {
  image: 0,
  'long-y': 0,
  'pan-x': 300,
  animation: 200,
};
