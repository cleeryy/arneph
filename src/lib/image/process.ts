/**
 * Traitement d'image client-side : lecture de dimensions, resize (downscale
 * seulement), encodage WebP et sprite sheet 2D.
 *
 * Aucun accès direct au canvas navigateur ici : tout passe par l'abstraction
 * `CanvasFactory`, injectable en test. jsdom n'implémente pas le rendu 2D
 * (`getContext('2d')` → null) — c'est la raison de cette injection.
 * `createBrowserFactory()` branche le vrai DOM en runtime navigateur.
 */

import {
  LONG_Y_TILE_HEIGHT,
  MAX_IMAGE_PIXELS,
  MAX_LONG_Y_PIXELS,
  MAX_LONG_Y_TILES,
  MAX_SPRITE_PIXELS,
} from "./limits";
import { isAnimatedImage } from "./animated";

export const DEFAULT_WEBP_QUALITY = 0.9;
export const DEFAULT_MAX_COLUMNS = 10;
export const MAX_CANVAS_DIMENSION = 16384;
/** Plafond de frames acceptées par `buildSpriteSheet`. */
export const MAX_SPRITE_FRAMES = 120;
/** Décodages simultanés maximum pendant la construction d'une sprite sheet. */
const SPRITE_DECODE_CONCURRENCY = 4;

export { MAX_IMAGE_PIXELS, MAX_SPRITE_PIXELS } from "./limits";
export const SUPPORTED_IMAGE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/avif",
] as const;

export type ImageProcessingErrorCode =
  | "NOT_IMAGE"
  | "UNSUPPORTED_TYPE"
  | "INVALID_IMAGE"
  | "INVALID_TARGET"
  | "IMAGE_TOO_LARGE"
  | "SPRITE_TOO_LARGE"
  | "TOO_MANY_FRAMES"
  | "EMPTY_BATCH"
  | "CANVAS_UNAVAILABLE"
  | "ENCODE_FAILED";

export class ImageProcessingError extends Error {
  constructor(
    readonly code: ImageProcessingErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ImageProcessingError";
  }
}

export interface ImageContext2D {
  drawImage(
    image: DecodedImage,
    dx: number,
    dy: number,
    dw: number,
    dh: number,
  ): void;
  /**
   * Dessine une région source de l'image dans la toile de destination.
   * Utilisé par le découpage de sprite sheet : `drawImage` seul ne permet pas
   * de choisir la cellule lue.
   */
  drawImageRegion(
    image: DecodedImage,
    sx: number,
    sy: number,
    sw: number,
    sh: number,
    dx: number,
    dy: number,
    dw: number,
    dh: number,
  ): void;
}

export interface DecodedImage {
  readonly width: number;
  readonly height: number;
}

export interface CanvasLike {
  width: number;
  height: number;
  getContext2D(): ImageContext2D | null;
  toBlob(
    callback: (blob: Blob | null) => void,
    type?: string,
    quality?: number,
  ): void;
}

export interface CanvasFactory {
  createCanvas(width: number, height: number): CanvasLike;
  decodeImage(blob: Blob): Promise<DecodedImage>;
}

export interface ProcessOptions {
  quality?: number;
  /**
   * Borne les **deux** dimensions en conservant le ratio. Utilisé pour les
   * images de page ; ignoré quand `maxWidth` est fourni.
   */
  maxDimension?: number;
  /**
   * Borne uniquement la largeur, en conservant le ratio. Indispensable pour
   * une planche `long-y` : `maxDimension` écraserait sa hauteur.
   */
  maxWidth?: number;
  supportedTypes?: readonly string[];
  factory?: CanvasFactory;
}

export interface SpriteSheetOptions extends ProcessOptions {
  maxColumns?: number;
}

export interface SpriteSheet {
  spriteBlob: Blob;
  frameWidth: number;
  frameHeight: number;
  columns: number;
  rows: number;
  frameCount: number;
}

/** Géométrie d'une grille déjà assemblée, telle que renvoyée par `buildSpriteSheet`. */
export interface SpriteSliceGeometry {
  columns: number;
  rows: number;
  frameWidth: number;
  frameHeight: number;
  frameCount: number;
}

/** Frames individuelles extraites d'une sprite sheet. */
export interface SlicedSpriteFrames {
  frames: Blob[];
  frameWidth: number;
  frameHeight: number;
}

function getFactory(factory: CanvasFactory | undefined): CanvasFactory {
  return factory ?? createBrowserFactory();
}

function assertImageFile(file: Blob, supportedTypes: readonly string[]): void {
  const type = (file.type ?? "").trim().toLowerCase();
  if (type === "" || !type.startsWith("image/")) {
    throw new ImageProcessingError(
      "NOT_IMAGE",
      `Fichier non-image (type "${file.type}").`,
    );
  }
  if (!supportedTypes.includes(type)) {
    throw new ImageProcessingError(
      "UNSUPPORTED_TYPE",
      `Type "${type}" non supporté.`,
    );
  }
}

function assertValidDimensions(width: number, height: number): void {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    throw new ImageProcessingError(
      "INVALID_IMAGE",
      `Dimensions invalides après décodage : ${width}×${height}.`,
    );
  }
}

function requireContext(canvas: CanvasLike): ImageContext2D {
  const context = canvas.getContext2D();
  if (!context) {
    throw new ImageProcessingError(
      "CANVAS_UNAVAILABLE",
      "Le canvas n'expose aucun contexte 2D.",
    );
  }
  return context;
}

function toBlobAsync(
  canvas: CanvasLike,
  type: string,
  quality: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else {
          reject(
            new ImageProcessingError(
              "ENCODE_FAILED",
              `Encodage "${type}" échoué par le canvas.`,
            ),
          );
        }
      },
      type,
      quality,
    );
  });
}

/**
 * Rejette les images qui dépassent le budget canvas : une dimension au-delà de
 * `MAX_CANVAS_DIMENSION` ou une surface au-delà de `MAX_IMAGE_PIXELS`.
 *
 * Ce garde-fou s'applique à la source, avant tout downscale : une planche
 * `1200×30000` est rejetée proprement (`IMAGE_TOO_LARGE`) au lieu de laisser
 * `canvas.toBlob` renvoyer `null` (ou faire tomber l'onglet).
 */
export function assertWithinCanvasBudget(width: number, height: number): void {
  if (
    width > MAX_CANVAS_DIMENSION ||
    height > MAX_CANVAS_DIMENSION ||
    width * height > MAX_IMAGE_PIXELS
  ) {
    throw new ImageProcessingError(
      "IMAGE_TOO_LARGE",
      `Image ${width}×${height}px trop grande : limite ${MAX_CANVAS_DIMENSION}px par côté et ${MAX_IMAGE_PIXELS} pixels au total.`,
    );
  }
}

/**
 * Borne **les deux** dimensions à `maxDimension` en conservant le ratio.
 * Jamais d'upscale : un facteur ≥ 1 laisse la taille native intacte.
 */
export function fitWithin(
  width: number,
  height: number,
  maxDimension: number,
): { width: number; height: number } {
  const scale = Math.min(1, maxDimension / width, maxDimension / height);
  if (scale >= 1) return { width, height };
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/**
 * Borne **la largeur seule** à `maxWidth` en conservant le ratio (la hauteur
 * suit proportionnellement). Jamais d'upscale.
 */
function fitWidth(
  width: number,
  height: number,
  maxWidth: number,
): { width: number; height: number } {
  const scale = Math.min(1, maxWidth / width);
  if (scale >= 1) return { width, height };
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** Libère un `ImageBitmap` décodé quand le runtime l'expose. */
function closeDecodedImage(image: DecodedImage): void {
  if ("close" in image) {
    const close = (image as { close?: unknown }).close;
    if (typeof close === "function") close.call(image);
  }
}

/**
 * Applique `mapper` à `items` avec au plus `concurrency` appels en vol.
 * L'ordre des résultats suit celui des entrées.
 */
async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workerCount = Math.max(1, Math.min(concurrency, items.length));

  const workers = Array.from({ length: workerCount }, async () => {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      results[index] = await mapper(items[index]);
    }
  });

  await Promise.all(workers);
  return results;
}

/** Dimensions réelles d'une image, via le décodeur du fournisseur. */
export async function readImageDimensions(
  file: Blob,
  factory?: CanvasFactory,
): Promise<{ width: number; height: number }> {
  const canvasFactory = getFactory(factory);
  assertImageFile(file, SUPPORTED_IMAGE_TYPES);
  const image = await canvasFactory.decodeImage(file);
  try {
    assertValidDimensions(image.width, image.height);
    return { width: image.width, height: image.height };
  } finally {
    closeDecodedImage(image);
  }
}

export async function resizeImage(
  file: Blob,
  options: ProcessOptions = {},
): Promise<Blob> {
  const canvasFactory = getFactory(options.factory);
  const supportedTypes = options.supportedTypes ?? SUPPORTED_IMAGE_TYPES;

  assertImageFile(file, supportedTypes);
  const image = await canvasFactory.decodeImage(file);
  try {
    assertValidDimensions(image.width, image.height);
    assertWithinCanvasBudget(image.width, image.height);

    const fitted =
      options.maxWidth !== undefined
        ? fitWidth(image.width, image.height, options.maxWidth)
        : fitWithin(
            image.width,
            image.height,
            options.maxDimension ?? MAX_CANVAS_DIMENSION,
          );
    const outWidth = fitted.width;
    const outHeight = fitted.height;

    const canvas = canvasFactory.createCanvas(outWidth, outHeight);
    const context = requireContext(canvas);
    context.drawImage(image, 0, 0, outWidth, outHeight);
    return await toBlobAsync(
      canvas,
      "image/webp",
      options.quality ?? DEFAULT_WEBP_QUALITY,
    );
  } finally {
    closeDecodedImage(image);
  }
}

/** Options de découpage d'une planche `long-y` en tuiles verticales. */
export interface LongYSliceOptions {
  /** Hauteur source d'une tuile (défaut `LONG_Y_TILE_HEIGHT`). */
  tileHeight?: number;
  /** Largeur de sortie, ratio conservé (défaut 1600). */
  maxWidth?: number;
  quality?: number;
  factory?: CanvasFactory;
}

/** Tuiles WebP d'une planche `long-y`, avec la géométrie de sortie. */
export interface LongYSlice {
  tiles: Blob[];
  width: number;
  height: number;
  tileHeight: number;
}

/**
 * Découpe une planche `long-y` en tuiles WebP verticales, sans chevauchement.
 *
 * La source n'est décodée qu'une fois et jamais dessinée en pleine hauteur :
 * chaque tuile a sa propre toile `outWidth × outTileHeight`. La géométrie
 * renvoyée (`width`, `height`, `tileHeight`) est celle des tuiles de sortie,
 * pour que le lecteur puisse réserver les hauteurs sans mesurer les images.
 *
 * Une planche trop large, trop haute ou au-delà de `MAX_LONG_Y_PIXELS` est
 * rejetée (`IMAGE_TOO_LARGE`) avant toute allocation de canvas.
 */
export async function sliceLongYImage(
  file: Blob,
  options: LongYSliceOptions = {},
): Promise<LongYSlice> {
  const canvasFactory = getFactory(options.factory);
  const quality = options.quality ?? DEFAULT_WEBP_QUALITY;
  const rawTileHeight = options.tileHeight ?? LONG_Y_TILE_HEIGHT;
  if (!Number.isFinite(rawTileHeight) || rawTileHeight < 1) {
    throw new ImageProcessingError(
      "INVALID_TARGET",
      `Hauteur de tuile invalide : ${rawTileHeight}.`,
    );
  }
  const tileHeight = Math.floor(rawTileHeight);

  assertImageFile(file, SUPPORTED_IMAGE_TYPES);
  const image = await canvasFactory.decodeImage(file);
  try {
    assertValidDimensions(image.width, image.height);

    const tileCount = Math.ceil(image.height / tileHeight);
    if (
      image.width > MAX_CANVAS_DIMENSION ||
      tileCount > MAX_LONG_Y_TILES ||
      image.width * image.height > MAX_LONG_Y_PIXELS
    ) {
      throw new ImageProcessingError(
        "IMAGE_TOO_LARGE",
        `Planche ${image.width}×${image.height}px trop grande : limite ${MAX_CANVAS_DIMENSION}px de large, ${MAX_LONG_Y_TILES} tuiles de ${tileHeight}px et ${MAX_LONG_Y_PIXELS} pixels au total.`,
      );
    }

    const outWidth = Math.min(image.width, options.maxWidth ?? 1600);
    const scale = outWidth / image.width;
    const outHeight = Math.max(1, Math.round(image.height * scale));
    const outTileHeight = Math.max(1, Math.round(tileHeight * scale));

    const tiles: Blob[] = [];
    for (let sourceY = 0; sourceY < image.height; sourceY += tileHeight) {
      const sourceHeight = Math.min(tileHeight, image.height - sourceY);
      const outSliceHeight = Math.max(1, Math.round(sourceHeight * scale));
      const canvas = canvasFactory.createCanvas(outWidth, outSliceHeight);
      const context = requireContext(canvas);
      context.drawImageRegion(
        image,
        0,
        sourceY,
        image.width,
        sourceHeight,
        0,
        0,
        outWidth,
        outSliceHeight,
      );
      tiles.push(await toBlobAsync(canvas, "image/webp", quality));
    }

    return {
      tiles,
      width: outWidth,
      height: outHeight,
      tileHeight: outTileHeight,
    };
  } finally {
    closeDecodedImage(image);
  }
}

/** Ré-encode n'importe quelle image décodable en WebP à la qualité donnée. */
export async function toWebP(
  blob: Blob,
  quality = DEFAULT_WEBP_QUALITY,
  options: ProcessOptions = {},
): Promise<Blob> {
  const canvasFactory = getFactory(options.factory);
  const supportedTypes = options.supportedTypes ?? SUPPORTED_IMAGE_TYPES;

  assertImageFile(blob, supportedTypes);
  const image = await canvasFactory.decodeImage(blob);
  try {
    assertValidDimensions(image.width, image.height);
    assertWithinCanvasBudget(image.width, image.height);

    const canvas = canvasFactory.createCanvas(image.width, image.height);
    const context = requireContext(canvas);
    context.drawImage(image, 0, 0, image.width, image.height);
    return await toBlobAsync(canvas, "image/webp", quality);
  } finally {
    closeDecodedImage(image);
  }
}

/**
 * Assemble une grille 2D de frames normalisées et l'exporte en WebP.
 * Normalisation : chaque frame est bornée à `maxDimension` sur les deux côtés
 * (jamais upscalée), puis la cellule commune est la plus grande taille
 * résultante — les frames plus petites sont centrées dans la cellule (ratio
 * toujours conservé). La grille (columns ≤ maxColumns) contourne la limite
 * canvas ~16384px ; une grille qui la dépasserait est rejetée.
 * Maximum `MAX_SPRITE_FRAMES` frames, décodées avec une concurrence bornée.
 */
export async function buildSpriteSheet(
  files: Blob[],
  options: SpriteSheetOptions = {},
): Promise<SpriteSheet> {
  const canvasFactory = getFactory(options.factory);
  const rawColumns = Math.floor(options.maxColumns ?? DEFAULT_MAX_COLUMNS);
  const maxColumns =
    Number.isFinite(rawColumns) && rawColumns >= 1 ? rawColumns : 1;
  const maxDimension = options.maxDimension ?? MAX_CANVAS_DIMENSION;
  const supportedTypes = options.supportedTypes ?? SUPPORTED_IMAGE_TYPES;

  if (files.length === 0) {
    throw new ImageProcessingError(
      "EMPTY_BATCH",
      "Aucune image fournie pour la sprite sheet.",
    );
  }

  if (files.length > MAX_SPRITE_FRAMES) {
    throw new ImageProcessingError(
      "TOO_MANY_FRAMES",
      `${files.length} frames fournies : le maximum est ${MAX_SPRITE_FRAMES} par sprite sheet.`,
    );
  }

  interface DecodedFrame {
    image: DecodedImage;
    fittedWidth: number;
    fittedHeight: number;
  }

  // Décodage borné : `Promise.all` sur 100 frames 1600² décodait ~1 Go avant
  // même d'appliquer `MAX_SPRITE_PIXELS`. Les bitmaps sont libérés dans le
  // `finally`, y compris si un décodage ou un encodage échoue.
  const frames: DecodedFrame[] = [];
  let disposed = false;

  try {
    await mapWithConcurrency(
      files,
      SPRITE_DECODE_CONCURRENCY,
      async (file) => {
        assertImageFile(file, supportedTypes);
        if (await isAnimatedImage(file)) {
          throw new ImageProcessingError(
            "UNSUPPORTED_TYPE",
            "le type animation attend des frames statiques, pas un fichier animé",
          );
        }
        const image = await canvasFactory.decodeImage(file);
        if (disposed) {
          closeDecodedImage(image);
          return;
        }
        try {
          assertValidDimensions(image.width, image.height);
          const fitted = fitWithin(image.width, image.height, maxDimension);
          frames.push({
            image,
            fittedWidth: fitted.width,
            fittedHeight: fitted.height,
          });
        } catch (error) {
          closeDecodedImage(image);
          throw error;
        }
      },
    );

    const maxFrameWidth = Math.max(...frames.map((frame) => frame.fittedWidth));
    const maxFrameHeight = Math.max(
      ...frames.map((frame) => frame.fittedHeight),
    );
    const columns = Math.min(maxColumns, frames.length);
    const rows = Math.ceil(frames.length / columns);

    // Budget mémoire : on réduit d'abord la taille des frames, jamais la grille,
    // pour rester sous `MAX_SPRITE_PIXELS` (sinon le décodage fait tomber l'onglet).
    const rawPixels = columns * maxFrameWidth * rows * maxFrameHeight;
    const scale =
      rawPixels > MAX_SPRITE_PIXELS
        ? Math.sqrt(MAX_SPRITE_PIXELS / rawPixels)
        : 1;
    const frameWidth = Math.max(1, Math.floor(maxFrameWidth * scale));
    const frameHeight = Math.max(1, Math.floor(maxFrameHeight * scale));
    const sheetWidth = columns * frameWidth;
    const sheetHeight = rows * frameHeight;

    if (sheetWidth > maxDimension || sheetHeight > maxDimension) {
      throw new ImageProcessingError(
        "SPRITE_TOO_LARGE",
        `Grille ${sheetWidth}×${sheetHeight}px trop grande pour la limite canvas (${maxDimension}px).`,
      );
    }

    const canvas = canvasFactory.createCanvas(sheetWidth, sheetHeight);
    const context = requireContext(canvas);

    frames.forEach((frame, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      const fittedWidth = Math.max(1, Math.round(frame.fittedWidth * scale));
      const fittedHeight = Math.max(1, Math.round(frame.fittedHeight * scale));
      const dx = Math.round(
        column * frameWidth + (frameWidth - fittedWidth) / 2,
      );
      const dy = Math.round(
        row * frameHeight + (frameHeight - fittedHeight) / 2,
      );
      context.drawImage(frame.image, dx, dy, fittedWidth, fittedHeight);
    });

    const spriteBlob = await toBlobAsync(
      canvas,
      "image/webp",
      options.quality ?? DEFAULT_WEBP_QUALITY,
    );
    return {
      spriteBlob,
      frameWidth,
      frameHeight,
      columns,
      rows,
      frameCount: frames.length,
    };
  } finally {
    disposed = true;
    for (const frame of frames) closeDecodedImage(frame.image);
  }
}

function assertSliceGeometry(geometry: SpriteSliceGeometry): void {
  const { columns, rows, frameWidth, frameHeight, frameCount } = geometry;
  const positiveIntegers = [columns, rows, frameCount].every(
    (value) => Number.isInteger(value) && value > 0,
  );
  const positiveDimensions = [frameWidth, frameHeight].every(
    (value) => Number.isFinite(value) && value > 0,
  );
  if (
    !positiveIntegers ||
    !positiveDimensions ||
    frameCount > columns * rows
  ) {
    throw new ImageProcessingError(
      "INVALID_TARGET",
      `Géométrie de sprite invalide : ${columns}×${rows} cellules de ${frameWidth}×${frameHeight}px pour ${frameCount} frame(s).`,
    );
  }
}

/**
 * Découpe une sprite sheet en frames individuelles WebP, en ordre de lecture
 * (gauche → droite, puis haut → bas), limitées à `frameCount`.
 *
 * La feuille n'est décodée qu'une seule fois ; chaque frame est dessinée dans
 * une toile aux dimensions de la cellule puis encodée séparément. Aucun accès
 * DOM direct : tout passe par le `CanvasFactory` injecté.
 */
export async function sliceSpriteSheet(
  sprite: Blob,
  geometry: SpriteSliceGeometry,
  options: ProcessOptions = {},
): Promise<SlicedSpriteFrames> {
  assertSliceGeometry(geometry);

  const canvasFactory = getFactory(options.factory);
  const quality = options.quality ?? DEFAULT_WEBP_QUALITY;
  const { columns, frameWidth, frameHeight, frameCount } = geometry;

  const image = await canvasFactory.decodeImage(sprite);
  try {
    assertValidDimensions(image.width, image.height);

    const usedRows = Math.ceil(frameCount / columns);
    if (
      frameWidth * columns > image.width ||
      frameHeight * usedRows > image.height
    ) {
      throw new ImageProcessingError(
        "INVALID_IMAGE",
        `Sprite ${image.width}×${image.height}px trop petite pour une grille de ${columns}×${usedRows} cellules de ${frameWidth}×${frameHeight}px.`,
      );
    }

    const frames: Blob[] = [];
    for (let index = 0; index < frameCount; index += 1) {
      const column = index % columns;
      const row = Math.floor(index / columns);
      const canvas = canvasFactory.createCanvas(frameWidth, frameHeight);
      const context = requireContext(canvas);
      context.drawImageRegion(
        image,
        column * frameWidth,
        row * frameHeight,
        frameWidth,
        frameHeight,
        0,
        0,
        frameWidth,
        frameHeight,
      );
      frames.push(await toBlobAsync(canvas, "image/webp", quality));
    }

    return { frames, frameWidth, frameHeight };
  } finally {
    closeDecodedImage(image);
  }
}

class BrowserCanvas implements CanvasLike {
  constructor(private readonly element: HTMLCanvasElement) {}

  get width(): number {
    return this.element.width;
  }

  set width(value: number) {
    this.element.width = value;
  }

  get height(): number {
    return this.element.height;
  }

  set height(value: number) {
    this.element.height = value;
  }

  getContext2D(): ImageContext2D | null {
    const context = this.element.getContext("2d");
    if (!context) return null;
    return {
      drawImage(image, dx, dy, dw, dh) {
        context.drawImage(
          image as unknown as CanvasImageSource,
          dx,
          dy,
          dw,
          dh,
        );
      },
      drawImageRegion(image, sx, sy, sw, sh, dx, dy, dw, dh) {
        context.drawImage(
          image as unknown as CanvasImageSource,
          sx,
          sy,
          sw,
          sh,
          dx,
          dy,
          dw,
          dh,
        );
      },
    };
  }

  toBlob(
    callback: (blob: Blob | null) => void,
    type?: string,
    quality?: number,
  ): void {
    this.element.toBlob(callback, type, quality);
  }
}

function decodeViaImageElement(blob: Blob): Promise<DecodedImage> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(blob);
    const element = new Image();
    element.onload = () => {
      const width = element.naturalWidth;
      const height = element.naturalHeight;
      URL.revokeObjectURL(objectUrl);
      if (!(width > 0 && height > 0)) {
        reject(
          new ImageProcessingError(
            "INVALID_IMAGE",
            `Dimensions nulles après décodage (${width}×${height}).`,
          ),
        );
        return;
      }
      const drawable = element as unknown as HTMLImageElement;
      Object.defineProperty(drawable, "width", {
        get: () => element.naturalWidth,
      });
      Object.defineProperty(drawable, "height", {
        get: () => element.naturalHeight,
      });
      resolve(drawable as unknown as DecodedImage);
    };
    element.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(
        new ImageProcessingError("INVALID_IMAGE", "Décodage de l'image impossible."),
      );
    };
    element.src = objectUrl;
  });
}

/** Fournisseur navigateur : canvas DOM réel + createImageBitmap (repli Image). */
export function createBrowserFactory(): CanvasFactory {
  return {
    createCanvas(width, height) {
      const element = document.createElement("canvas");
      element.width = width;
      element.height = height;
      return new BrowserCanvas(element);
    },
    async decodeImage(blob) {
      if (typeof createImageBitmap === "function") {
        try {
          return await createImageBitmap(blob);
        } catch {
          // repli pour les sources que createImageBitmap refuse
        }
      }
      return decodeViaImageElement(blob);
    },
  };
}
