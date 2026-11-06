/**
 * Types domaine partagés lecteur / éditeur / BDD.
 * Source unique — la couche DB (T10) fera son propre mapping.
 * Aucune logique métier ici : types + validation uniquement.
 */

export type SectionType = 'image' | 'long-y' | 'pan-x' | 'animation';

/** Configuration de l'overlay FX (GIF/WebP animé) positionné sur une section. */
export interface FxOverlayConfig {
  position: { x: 'left' | 'center' | 'right'; y: 'top' | 'center' | 'bottom' };
  size: { mode: 'px' | 'percent'; width?: number; height?: number };
  opacity: number;
}

/** Cadrage d'une image simple dans son écran plein. */
export type ImageFit = 'contain' | 'cover' | 'width';
/** Point focal vertical, utilisé par le mode `cover`. */
export type ImageFocus = 'top' | 'center' | 'bottom';

/** Affichage statique. */
export interface ImageSectionConfig {
  type: 'image';
  imagePath: string;
  width: number;
  height: number;
  /** Cadrage dans l'écran (défaut `contain`). */
  fit?: ImageFit;
  /** Point focal vertical pour `cover` (défaut `center`). */
  focus?: ImageFocus;
  audioPath?: string;
  /** Overlay GIF/WebP animé (positionné par fxConfig). */
  fxPath?: string;
  /** Configuration de positionnement/opacité de l'overlay. */
  fxConfig?: FxOverlayConfig;
}

/** Image haute, défilement natif sans animation. */
export interface LongYSectionConfig {
  type: 'long-y';
  imagePath: string;
  width: number;
  height: number;
  audioPath?: string;
  /** Overlay GIF/WebP animé (positionné par fxConfig). */
  fxPath?: string;
  /** Configuration de positionnement/opacité de l'overlay. */
  fxConfig?: FxOverlayConfig;
}

/** Image large qui panne horizontalement au scroll. */
export interface PanXSectionConfig {
  type: 'pan-x';
  imagePath: string;
  width: number;
  height: number;
  /**
   * Longueur d'épinglage en vh (100–400, défaut 150). Remplace `panSpeed`,
   * conservé uniquement pour relire les anciennes données.
   */
  panDistance?: number;
  /** Sens du glissement (défaut `ltr`). */
  direction?: 'ltr' | 'rtl';
  /** @deprecated Ignoré, remplacé par `panDistance`. */
  panSpeed?: number;
  audioPath?: string;
}

/** Sprite sheet 2D animée par scroll. */
export interface AnimationSectionConfig {
  type: 'animation';
  /**
   * Frames individuelles (recommandé) : une image par frame, chargées à la
   * demande. Prioritaire sur `spritePath` quand la liste est non vide.
   */
  framePaths?: string[];
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
  /** Verrou optimiste : incrémenté à chaque sauvegarde transactionnelle. */
  revision: number;
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
