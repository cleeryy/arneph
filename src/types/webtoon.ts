/**
 * Types domaine partagés lecteur / éditeur / BDD.
 * Source unique — la couche DB (T10) fera son propre mapping.
 * Aucune logique métier ici : types + validation uniquement.
 */

export type SectionType = 'image' | 'long-y' | 'pan-x' | 'animation';

/** Affichage statique. */
export interface ImageSectionConfig {
  type: 'image';
  imagePath: string;
  width: number;
  height: number;
  audioPath?: string;
}

/** Image haute, défilement natif sans animation. */
export interface LongYSectionConfig {
  type: 'long-y';
  imagePath: string;
  width: number;
  height: number;
  audioPath?: string;
}

/** Image large qui panne horizontalement au scroll. */
export interface PanXSectionConfig {
  type: 'pan-x';
  imagePath: string;
  width: number;
  height: number;
  /** Distance de scroll en vh ; défaut : SCROLL_DISTANCES['pan-x']. */
  panSpeed?: number;
  audioPath?: string;
}

/** Sprite sheet 2D animée par scroll. */
export interface AnimationSectionConfig {
  type: 'animation';
  spritePath: string;
  frameWidth: number;
  frameHeight: number;
  columns: number;
  rows: number;
  frameCount: number;
  /** Hauteur de scroll en vh ; défaut : SCROLL_DISTANCES['animation']. */
  scrollHeight?: number;
  audioPath?: string;
}

export type SectionConfig =
  | ImageSectionConfig
  | LongYSectionConfig
  | PanXSectionConfig
  | AnimationSectionConfig;

export type SectionVisibility = 'draft' | 'published';

/** Bloc de lecture du webtoon (image, pan-x, animation...). */
export interface Section {
  id: string;
  webtoonId: string;
  /** Ordre de lecture. */
  position: number;
  /** Invariant : doit correspondre à config.type. */
  type: SectionType;
  config: SectionConfig;
  audioPath?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Webtoon {
  id: string;
  title: string;
  description?: string;
  coverPath?: string;
  visibility: SectionVisibility;
  settings: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

/** Référence d'une image stockée (upload / optimisation). */
export interface ImageRecord {
  id: string;
  sectionId: string;
  webtoonId: string;
  storagePath: string;
  width: number;
  height: number;
  mimeType: string;
  position: number;
}
