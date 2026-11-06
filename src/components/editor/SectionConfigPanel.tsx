"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { X, Upload, Trash2, FileAudio, AlertCircle } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { SectionPreview } from "./SectionPreview";
import {
  AnimationFramesEditor,
  type AnimationFrameUploadResult,
  type AnimationFramesValue,
} from "./AnimationFramesEditor";
import {
  resizeImage,
  buildSpriteSheet,
  sliceSpriteSheet,
  sliceLongYImage,
  readImageDimensions,
  MAX_CANVAS_DIMENSION,
  ImageProcessingError,
} from "@/lib/image/process";
import { isAnimatedImage } from "@/lib/image/animated";
import { imageErrorKey } from "@/lib/image/error-message";
import { MAX_IMAGE_PIXELS, MAX_UPLOAD_BYTES } from "@/lib/image/limits";
import { SCROLL_DISTANCES } from "@/lib/scroll/constants";
import { uploadSectionAsset, removeSectionAssets } from "@/lib/supabase/upload";
import { sectionTypeLabel } from "@/lib/editor/section-labels";
import type { SectionWithImages } from "@/lib/db/queries";
import type {
  SectionType,
  ImageRecord,
  ImageFit,
  ImageFocus,
  ImageSectionConfig,
  FxOverlayConfig,
  LongYSectionConfig,
  PanXSectionConfig,
  AnimationSectionConfig,
} from "@/types/webtoon";

interface SectionConfigPanelProps {
  section: SectionWithImages;
  onSectionChange: (section: SectionWithImages) => void;
  onClose: () => void;
}

const AUDIO_MIME_TYPES = ["audio/mpeg", "audio/webm", "audio/ogg"];

/** Les images de section sont rendues plein écran : 1600 px suffit. */
const SECTION_IMAGE_MAX_DIMENSION = 1600;
/** Une planche `long-y` n'est bornée qu'en largeur, jamais en hauteur. */
const SECTION_IMAGE_MAX_WIDTH = 1600;

type StaticSectionConfig = Extract<
  SectionWithImages["config"],
  { type: "image" | "long-y" | "pan-x" }
>;
type FxSectionConfig = Extract<SectionWithImages["config"], { type: "image" | "long-y" }>;

function isStaticSectionType(type: SectionType): boolean {
  return type === "image" || type === "long-y" || type === "pan-x";
}

/**
 * Modèle média d'une section : `animation` consomme une sprite sheet unique,
 * tous les autres types une image de page. Changer de modèle invalide
 * `section.images` (aperçu et lecteur lisent `images[0]` en priorité), donc le
 * média est réinitialisé au lieu de rester en place et de s'afficher à tort.
 */
function mediaModelOf(type: SectionType): "page" | "sprite" {
  return type === "animation" ? "sprite" : "page";
}

/** Cadrage et point focal : valeurs par défaut du schéma, exposées par l'UI. */
const IMAGE_FIT_DEFAULT: ImageFit = "contain";
const IMAGE_FOCUS_DEFAULT: ImageFocus = "center";

/**
 * Longueur d'épinglage d'un panoramique, en vh. La valeur est bornée à
 * [100, 400] pour rester dans le domaine accepté par `panXSectionConfigSchema`.
 */
const PAN_DISTANCE_MIN = 100;
const PAN_DISTANCE_MAX = 400;
const PAN_DISTANCE_DEFAULT = 150;
const PAN_DIRECTION_DEFAULT: "ltr" | "rtl" = "ltr";

function parsePanDistance(value: string): number | null {
  if (value.trim() === "") return null;
  const next = Number(value);
  if (!Number.isFinite(next)) return null;
  return Math.min(PAN_DISTANCE_MAX, Math.max(PAN_DISTANCE_MIN, next));
}

/**
 * Réglages pan-x : `panSpeed` est déprécié et ignoré par le lecteur dès que
 * `panDistance` existe. Toute écriture le retire pour ne jamais le réintroduire.
 */
function withPanSettings(
  config: PanXSectionConfig,
  updates: Partial<Pick<PanXSectionConfig, "panDistance" | "direction">>,
): PanXSectionConfig {
  const next: PanXSectionConfig = { ...config, ...updates };
  delete next.panSpeed;
  return next;
}

/** `scrollHeight` est `positive()` dans le schéma Zod : jamais 0/NaN. */
function parsePositiveNumber(value: string): number | null {
  const next = Number(value);
  if (!Number.isFinite(next) || next <= 0) return null;
  return next;
}

export function createDefaultConfig(type: SectionType): SectionWithImages["config"] {
  switch (type) {
    case "image":
      return { type: "image", imagePath: "", width: 0, height: 0 };
    case "long-y":
      return { type: "long-y", imagePath: "", width: 0, height: 0 };
    case "pan-x":
      return {
        type: "pan-x",
        imagePath: "",
        width: 0,
        height: 0,
        panDistance: PAN_DISTANCE_DEFAULT,
        direction: PAN_DIRECTION_DEFAULT,
      };
    case "animation":
      return {
        type: "animation",
        spritePath: "",
        frameWidth: 0,
        frameHeight: 0,
        columns: 0,
        rows: 0,
        frameCount: 0,
        scrollHeight: SCROLL_DISTANCES.animation,
      };
  }
}

function isImageFile(file: File): boolean {
  return file.type.startsWith("image/");
}

/** Refuse un fichier trop lourd avant `resizeImage()` / décodage. */
function isFileTooLarge(file: File): boolean {
  return file.size > MAX_UPLOAD_BYTES;
}

function isAudioFile(file: File): boolean {
  return AUDIO_MIME_TYPES.includes(file.type);
}

function generateStoragePath(sectionId: string, filename: string): string {
  const timestamp = Date.now();
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `webtoons/sections/${sectionId}/${timestamp}-${safeName}`;
}

export function SectionConfigPanel({
  section,
  onSectionChange,
  onClose,
}: SectionConfigPanelProps) {
  const t = useTranslations("editor");
  /**
   * Traducteur racine : `imageErrorKey()` renvoie des clés complètes
   * (`editor.imageErrors.<code>`), pas des clés relatives au namespace.
   */
  const tRoot = useTranslations();
  const [error, setError] = React.useState<string | null>(null);
  const [uploading, setUploading] = React.useState(false);
  /**
   * Valeur affichée du slider d'opacité pendant un glissement. L'historique
   * n'est écrit qu'au commit (`onValueCommitted`), pas à chaque tick.
   */
  const [opacityDraft, setOpacityDraft] = React.useState<{
    sectionId: string;
    value: number;
  } | null>(null);
  const imageInputRef = React.useRef<HTMLInputElement>(null);
  const animationInputRef = React.useRef<HTMLInputElement>(null);
  const audioInputRef = React.useRef<HTMLInputElement>(null);
  const fxInputRef = React.useRef<HTMLInputElement>(null);

  const handleTypeChange = (newType: string | null) => {
    if (!newType) return;
    setError(null);
    const nextType = newType as SectionType;
    const currentConfig = section.config;
    const nextConfig = createDefaultConfig(nextType);

    // `config.audioPath` est indépendant du type de média : toujours préservé.
    if (currentConfig.audioPath !== undefined) {
      nextConfig.audioPath = currentConfig.audioPath;
    }

    if (isStaticSectionType(section.type) && isStaticSectionType(nextType)) {
      const current = currentConfig as StaticSectionConfig;
      const target = nextConfig as StaticSectionConfig;
      target.imagePath = current.imagePath;
      target.width = current.width;
      target.height = current.height;

      // L'overlay FX n'existe que sur image/long-y : un passage par pan-x (ou
      // vers animation) le supprime explicitement au lieu de le laisser traîner.
      const keepsFx = nextType === "image" || nextType === "long-y";
      if (keepsFx && (section.type === "image" || section.type === "long-y")) {
        const currentFx = current as FxSectionConfig;
        const targetFx = nextConfig as FxSectionConfig;
        if (currentFx.fxPath !== undefined) targetFx.fxPath = currentFx.fxPath;
        if (currentFx.fxConfig !== undefined) targetFx.fxConfig = currentFx.fxConfig;
      }
    }

    const mediaModelChanged = mediaModelOf(section.type) !== mediaModelOf(nextType);

    const updated: SectionWithImages = {
      ...section,
      type: nextType,
      config: nextConfig,
      // Un sprite et une image de page ne sont pas interchangeables : ne jamais
      // laisser l'ancien média alimenter l'aperçu du nouveau type.
      images: mediaModelChanged ? [] : section.images,
    };
    onSectionChange(updated);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);

    if (!isImageFile(file)) {
      setError(t("uploadImageError"));
      return;
    }
    if (isFileTooLarge(file)) {
      setError(t("fileTooLarge"));
      return;
    }

    setUploading(true);
    // Tuiles déjà écrites sur Storage : retirées si le lot échoue en route.
    const uploadedTiles: string[] = [];
    const buildImageRecord = (
      storagePath: string,
      dimensions: { width: number; height: number },
      mimeType: string,
    ): ImageRecord => ({
      id: crypto.randomUUID(),
      sectionId: section.id,
      webtoonId: section.webtoonId,
      storagePath,
      width: dimensions.width,
      height: dimensions.height,
      mimeType,
      position: 0,
    });

    try {
      const animated = await isAnimatedImage(file);

      if (animated) {
        const dimensions = await readImageDimensions(file);
        const storagePath = await uploadSectionAsset(
          generateStoragePath(section.id, file.name),
          file,
          file.type,
        );

        if (section.config.type === "long-y") {
          const nextConfig: LongYSectionConfig = {
            ...(section.config as LongYSectionConfig),
            imagePath: storagePath,
            width: dimensions.width,
            height: dimensions.height,
          };
          // Un GIF remplace la planche tuilée : aucune tuile périmée.
          delete nextConfig.tiles;
          delete nextConfig.tileHeight;
          onSectionChange({
            ...section,
            images: [buildImageRecord(storagePath, dimensions, file.type)],
            config: nextConfig,
          });
          return;
        }

        const imageConfig = section.config as Extract<
          SectionWithImages["config"],
          { type: "image" | "pan-x" }
        >;
        onSectionChange({
          ...section,
          images: [buildImageRecord(storagePath, dimensions, file.type)],
          config: {
            ...imageConfig,
            imagePath: storagePath,
            width: dimensions.width,
            height: dimensions.height,
          },
        });
        return;
      }

      // Dimensions lues AVANT de choisir le pipeline : une planche `long-y`
      // au-delà du canvas ne doit jamais passer par `resizeImage`.
      const source = await readImageDimensions(file);
      const needsTiling =
        section.config.type === "long-y" &&
        (source.height > MAX_CANVAS_DIMENSION ||
          source.width * source.height > MAX_IMAGE_PIXELS);

      if (needsTiling) {
        const sliced = await sliceLongYImage(file);
        // Batch horodaté : `upsert: false`, donc un ré-upload doit écrire
        // dans un dossier neuf au lieu d'écraser les tuiles précédentes.
        const tileBatch = Date.now();
        const tiles: string[] = [];
        for (let index = 0; index < sliced.tiles.length; index += 1) {
          const tilePath = await uploadSectionAsset(
            `webtoons/sections/${section.id}/tiles-${tileBatch}/${index}.webp`,
            sliced.tiles[index],
            "image/webp",
          );
          uploadedTiles.push(tilePath);
          tiles.push(tilePath);
        }

        const longYConfig = section.config as LongYSectionConfig;
        onSectionChange({
          ...section,
          images: [],
          config: {
            ...longYConfig,
            type: "long-y",
            imagePath: tiles[0],
            tiles,
            tileHeight: sliced.tileHeight,
            width: sliced.width,
            height: sliced.height,
          },
        });
        return;
      }

      // Planche `long-y` sous les limites : ne réduire QUE la largeur.
      // `maxDimension` écraserait la hauteur sous la limite canvas.
      const resized = await resizeImage(
        file,
        section.config.type === "long-y"
          ? { maxWidth: SECTION_IMAGE_MAX_WIDTH }
          : { maxDimension: SECTION_IMAGE_MAX_DIMENSION },
      );
      const dimensions = await readImageDimensions(resized);
      const storagePath = await uploadSectionAsset(
        generateStoragePath(section.id, file.name),
        resized,
        "image/webp",
      );
      const imageRecord = buildImageRecord(storagePath, dimensions, "image/webp");

      if (section.config.type === "long-y") {
        const nextConfig: LongYSectionConfig = {
          ...(section.config as LongYSectionConfig),
          imagePath: storagePath,
          width: dimensions.width,
          height: dimensions.height,
        };
        // Une ré-upload simple remplace le tuilage : jamais de `tiles`
        // périmées pointant vers l'ancien batch.
        delete nextConfig.tiles;
        delete nextConfig.tileHeight;

        onSectionChange({
          ...section,
          images: [imageRecord],
          config: nextConfig,
        });
        return;
      }

      const imageConfig = section.config as Extract<
        SectionWithImages["config"],
        { type: "image" | "pan-x" }
      >;
      onSectionChange({
        ...section,
        images: [imageRecord],
        config: {
          ...imageConfig,
          imagePath: storagePath,
          width: dimensions.width,
          height: dimensions.height,
        },
      });
    } catch (err) {
      if (uploadedTiles.length > 0) {
        await removeSectionAssets(uploadedTiles).catch(() => {
          // Nettoyage best-effort : ne pas masquer l'erreur d'upload.
        });
      }
      if (err instanceof ImageProcessingError) {
        setError(tRoot(imageErrorKey(err.code)));
      } else {
        setError(t("uploadImageErrorGeneric"));
      }
    } finally {
      setUploading(false);
      if (imageInputRef.current) imageInputRef.current.value = "";
    }
  };

  const handleAnimationUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setError(null);

    const fileArray = Array.from(files);
    const invalidFile = fileArray.find((f) => !isImageFile(f));
    if (invalidFile) {
      setError(t("uploadAnimationError"));
      return;
    }
    if (fileArray.some(isFileTooLarge)) {
      setError(t("fileTooLarge"));
      return;
    }

    setUploading(true);
    // Tout ce qui est déjà parti sur Storage doit pouvoir être retiré si un
    // upload suivant échoue : jamais de sprite orphelin sans frames.
    const uploadedPaths: string[] = [];
    try {
      const spriteSheet = await buildSpriteSheet(fileArray);

      // Le lecteur consomme les frames individuelles : la feuille n'est
      // uploadée que comme repli pour les données migrées côté serveur.
      const sliced = await sliceSpriteSheet(spriteSheet.spriteBlob, {
        columns: spriteSheet.columns,
        rows: spriteSheet.rows,
        frameWidth: spriteSheet.frameWidth,
        frameHeight: spriteSheet.frameHeight,
        frameCount: spriteSheet.frameCount,
      });

      const path = generateStoragePath(section.id, `sprite-${Date.now()}.webp`);
      const storagePath = await uploadSectionAsset(path, spriteSheet.spriteBlob, "image/webp");
      uploadedPaths.push(storagePath);

      // Batch horodaté : un ré-upload complet sur la même section écrit dans
      // un dossier neuf, donc `upsert: false` ne casse plus dès la frame 0.
      const frameBatch = Date.now();
      const framePaths: string[] = [];
      // Une frame = un asset : aucun écran ne rend plus une grille géante.
      // Upload séquentiel pour que `framePaths` suive l'ordre de lecture et
      // qu'un échec stoppe avant toute écriture dans la section.
      for (let index = 0; index < sliced.frames.length; index += 1) {
        const framePath = await uploadSectionAsset(
          `webtoons/sections/${section.id}/frames/${frameBatch}/${index}.webp`,
          sliced.frames[index],
          "image/webp",
        );
        uploadedPaths.push(framePath);
        framePaths.push(framePath);
      }

      const frameCount = sliced.frames.length;
      const scrollHeight =
        section.config.type === "animation"
          ? section.config.scrollHeight
          : undefined;

      const spriteRecord: ImageRecord = {
        id: crypto.randomUUID(),
        sectionId: section.id,
        webtoonId: section.webtoonId,
        storagePath,
        width: spriteSheet.frameWidth * spriteSheet.columns,
        height: spriteSheet.frameHeight * spriteSheet.rows,
        mimeType: "image/webp",
        position: 0,
      };

      const updatedSection: SectionWithImages = {
        ...section,
        images: [spriteRecord],
        config: {
          type: "animation",
          spritePath: storagePath,
          framePaths,
          frameWidth: sliced.frameWidth,
          frameHeight: sliced.frameHeight,
          frameCount,
          columns: frameCount,
          rows: 1,
          ...(scrollHeight !== undefined ? { scrollHeight } : {}),
        },
      };
      onSectionChange(updatedSection);
    } catch (err) {
      await removeSectionAssets(uploadedPaths).catch(() => {
        // Nettoyage best-effort : un orphelin Storage ne doit pas masquer
        // l'erreur d'upload affichée à l'utilisateur.
      });
      if (err instanceof ImageProcessingError) {
        setError(tRoot(imageErrorKey(err.code)));
      } else {
        setError(t("uploadAnimationErrorGeneric"));
      }
    } finally {
      setUploading(false);
      if (animationInputRef.current) animationInputRef.current.value = "";
    }
  };

  /**
   * Upload des frames ajoutées depuis l'éditeur : chaque fichier passe par
   * `resizeImage()` (WebP) puis Storage. La géométrie existante est conservée
   * et n'est déduite de la première frame que si la section n'en avait pas.
   */
  const handleAnimationFrameUpload = async (
    files: File[],
  ): Promise<AnimationFrameUploadResult> => {
    if (section.config.type !== "animation") {
      throw new Error("Section animation requise pour uploader des frames.");
    }
    if (files.some(isFileTooLarge)) {
      throw new ImageProcessingError("IMAGE_TOO_LARGE", t("fileTooLarge"));
    }

    const animationConfig = section.config;
    const timestamp = Date.now();
    const uploadedFrames: string[] = [];
    let frameWidth = animationConfig.frameWidth;
    let frameHeight = animationConfig.frameHeight;

    for (let index = 0; index < files.length; index += 1) {
      const resized = await resizeImage(files[index], {
        maxDimension: SECTION_IMAGE_MAX_DIMENSION,
      });
      if (frameWidth <= 0 || frameHeight <= 0) {
        const dimensions = await readImageDimensions(resized);
        frameWidth = dimensions.width;
        frameHeight = dimensions.height;
      }
      uploadedFrames.push(
        await uploadSectionAsset(
          `webtoons/sections/${section.id}/frames/${timestamp}-${index}.webp`,
          resized,
          "image/webp",
        ),
      );
    }

    return { frames: uploadedFrames, frameWidth, frameHeight };
  };

  const handleAnimationFramesChange = (next: AnimationFramesValue) => {
    if (section.config.type !== "animation") return;
    setError(null);
    onSectionChange({
      ...section,
      config: {
        ...section.config,
        framePaths: next.frames,
        frameCount: next.frames.length,
        frameWidth: next.frameWidth,
        frameHeight: next.frameHeight,
        columns: next.frames.length,
        rows: 1,
      },
    });
  };

  const handleAudioUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);

    if (!isAudioFile(file)) {
      setError(t("uploadAudioError"));
      return;
    }

    setUploading(true);
    try {
      const path = generateStoragePath(section.id, file.name);
      const storagePath = await uploadSectionAsset(path, file, file.type);

      const updatedSection: SectionWithImages = {
        ...section,
        audioPath: storagePath,
      };
      onSectionChange(updatedSection);
    } catch (err) {
      if (err instanceof ImageProcessingError) {
        setError(tRoot(imageErrorKey(err.code)));
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError(t("uploadScriptError"));
      }
    } finally {
      setUploading(false);
      if (audioInputRef.current) audioInputRef.current.value = "";
    }
  };

  const handleAudioDelete = () => {
    setError(null);
    const updated: SectionWithImages = {
      ...section,
      audioPath: undefined,
    };
    onSectionChange(updated);
  };

  const isImageType =
    section.type === "image" || section.type === "long-y" || section.type === "pan-x";
  const isAnimationType = section.type === "animation";
  const isFxType = section.type === "image" || section.type === "long-y";
  const fxSectionConfig = isFxType
    ? (section.config as Extract<SectionWithImages["config"], { type: "image" | "long-y" }>)
    : null;
  const fxPath = fxSectionConfig?.fxPath;
  const fxConfig = fxSectionConfig?.fxConfig ?? {
    position: { x: "center", y: "center" },
    size: { mode: "percent", width: 100 },
    opacity: 1,
  };

  const fxOpacityPercent =
    opacityDraft?.sectionId === section.id
      ? opacityDraft.value
      : Math.round(fxConfig.opacity * 100);

  const handleFxUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);

    if (!["image/gif", "image/webp"].includes(file.type)) {
      setError(t("fxUploadError"));
      return;
    }
    if (isFileTooLarge(file)) {
      setError(t("fileTooLarge"));
      return;
    }

    setUploading(true);
    try {
      const animated = await isAnimatedImage(file);
      if (!animated) {
        setError(t("fxUploadError"));
        return;
      }

      const path = generateStoragePath(section.id, file.name);
      const storagePath = await uploadSectionAsset(path, file, file.type);

      const fxSectionConfig = section.config as Extract<
        SectionWithImages["config"],
        { type: "image" | "long-y" }
      >;
      const updatedSection: SectionWithImages = {
        ...section,
        config: {
          ...fxSectionConfig,
          fxPath: storagePath,
          fxConfig: {
            position: { x: "center", y: "center" },
            size: { mode: "percent", width: 100 },
            opacity: 1,
          },
        },
      } as SectionWithImages;
      onSectionChange(updatedSection);
    } catch (err) {
      if (err instanceof ImageProcessingError) {
        setError(tRoot(imageErrorKey(err.code)));
      } else {
        setError(t("uploadImageErrorGeneric"));
      }
    } finally {
      setUploading(false);
      if (fxInputRef.current) fxInputRef.current.value = "";
    }
  };

  const handleFxDelete = () => {
    setError(null);
    const fxSectionConfig = section.config as Extract<
      SectionWithImages["config"],
      { type: "image" | "long-y" }
    >;
    const updatedSection: SectionWithImages = {
      ...section,
      config: {
        ...fxSectionConfig,
        fxPath: undefined,
        fxConfig: undefined,
      },
    } as SectionWithImages;
    onSectionChange(updatedSection);
  };

  const handleFxConfigChange = (updates: Partial<FxOverlayConfig>) => {
    const currentFxConfig = (section.config as Extract<
      SectionWithImages["config"],
      { type: "image" | "long-y" }
    >).fxConfig ?? {
      position: { x: "center", y: "center" },
      size: { mode: "percent", width: 100 },
      opacity: 1,
    };
    const updatedFxConfig = { ...currentFxConfig, ...updates };
    const updatedSection: SectionWithImages = {
      ...section,
      config: {
        ...section.config,
        fxConfig: updatedFxConfig,
      },
    } as SectionWithImages;
    onSectionChange(updatedSection);
  };

  const panXConfig = section.config.type === "pan-x" ? (section.config as PanXSectionConfig) : null;
  const animationConfig =
    section.config.type === "animation" ? (section.config as AnimationSectionConfig) : null;
  const imageConfig =
    section.config.type === "image" ? (section.config as ImageSectionConfig) : null;

  const imageFit = imageConfig?.fit ?? IMAGE_FIT_DEFAULT;
  const imageFocus = imageConfig?.focus ?? IMAGE_FOCUS_DEFAULT;

  const handleImageFitChange = (value: string | null) => {
    if (!value || section.config.type !== "image") return;
    onSectionChange({
      ...section,
      config: { ...section.config, fit: value as ImageFit },
    });
  };

  const handleImageFocusChange = (value: string | null) => {
    if (!value || section.config.type !== "image") return;
    onSectionChange({
      ...section,
      config: { ...section.config, focus: value as ImageFocus },
    });
  };

  const handlePanDistanceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const panDistance = parsePanDistance(e.target.value);
    if (panDistance === null || section.config.type !== "pan-x") return;
    onSectionChange({
      ...section,
      config: withPanSettings(section.config, { panDistance }),
    });
  };

  const handlePanDirectionChange = (value: string | null) => {
    if (!value || section.config.type !== "pan-x") return;
    onSectionChange({
      ...section,
      config: withPanSettings(section.config, { direction: value as "ltr" | "rtl" }),
    });
  };

  const handleScrollHeightChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const scrollHeight = parsePositiveNumber(e.target.value);
    if (scrollHeight === null || section.config.type !== "animation") return;
    onSectionChange({
      ...section,
      config: { ...section.config, scrollHeight },
    });
  };

  return (
    <Card className="mx-auto w-full max-w-full sm:max-w-md">
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle>{t("configPanelTitle")}</CardTitle>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          aria-label={t("closePanel")}
          disabled={uploading}
        >
          <X className="size-4" />
        </Button>
      </CardHeader>

      <CardContent className="space-y-4">
        {/*
          Un upload long ne doit pas pouvoir être écrasé par une édition
          concurrente : tous les contrôles de configuration sont désactivés
          pendant l'envoi (le `fieldset` couvre aussi les boutons du sous-éditeur).
        */}
        <fieldset
          disabled={uploading}
          aria-busy={uploading}
          className="m-0 min-w-0 space-y-4 border-0 p-0"
        >
        <div className="space-y-2">
          <label htmlFor="section-type" className="text-sm font-medium text-foreground">
            {t("sectionType")}
          </label>
          <Select value={section.type} onValueChange={handleTypeChange}>
            <SelectTrigger id="section-type" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(["image", "long-y", "pan-x", "animation"] as SectionType[]).map((type) => (
                <SelectItem key={type} value={type}>
                  {sectionTypeLabel(t, type)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Separator />

        {isImageType && (
          <div className="space-y-2">
            <label htmlFor="image-upload" className="text-sm font-medium text-foreground">{t("imageUpload")}</label>
            <Input
              id="image-upload"
              ref={imageInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              disabled={uploading}
              className="cursor-pointer"
            />
            {section.images.length > 0 && (
              <p className="text-xs text-muted-foreground" role="status">
                {t("imageCount", { count: section.images.length })}
              </p>
            )}
          </div>
        )}

        {section.type === "image" && (
          <>
            <div className="space-y-2">
              <label htmlFor="image-fit" className="text-sm font-medium text-foreground">
                {t("imageFit")}
              </label>
              <Select value={imageFit} onValueChange={handleImageFitChange}>
                <SelectTrigger id="image-fit" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="contain">{t("imageFitContain")}</SelectItem>
                  <SelectItem value="cover">{t("imageFitCover")}</SelectItem>
                  <SelectItem value="width">{t("imageFitWidth")}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {imageFit === "cover" && (
              <div className="space-y-2">
                <label htmlFor="image-focus" className="text-sm font-medium text-foreground">
                  {t("imageFocus")}
                </label>
                <Select value={imageFocus} onValueChange={handleImageFocusChange}>
                  <SelectTrigger id="image-focus" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="top">{t("imageFocusTop")}</SelectItem>
                    <SelectItem value="center">{t("imageFocusCenter")}</SelectItem>
                    <SelectItem value="bottom">{t("imageFocusBottom")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </>
        )}

        {isAnimationType && (
          <div className="space-y-2">
            <label htmlFor="animation-upload" className="text-sm font-medium text-foreground">{t("animationUpload")}</label>
            <Input
              id="animation-upload"
              ref={animationInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleAnimationUpload}
              disabled={uploading}
              className="cursor-pointer"
            />
            {section.config.type === "animation" && section.config.frameCount > 0 && (
              <p className="text-xs text-muted-foreground" role="status">
                {t("frameCount", { count: section.config.frameCount })}
              </p>
            )}
          </div>
        )}

        {section.type === "pan-x" && (
          <>
            <div className="space-y-2">
              <label htmlFor="pan-distance" className="text-sm font-medium text-foreground">
                {t("panDistance")}
              </label>
              <Input
                id="pan-distance"
                type="number"
                min={PAN_DISTANCE_MIN}
                max={PAN_DISTANCE_MAX}
                step={10}
                inputMode="numeric"
                value={panXConfig?.panDistance ?? PAN_DISTANCE_DEFAULT}
                onChange={handlePanDistanceChange}
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="pan-direction" className="text-sm font-medium text-foreground">
                {t("panDirection")}
              </label>
              <Select
                value={panXConfig?.direction ?? PAN_DIRECTION_DEFAULT}
                onValueChange={handlePanDirectionChange}
              >
                <SelectTrigger id="pan-direction" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ltr">{t("panLtr")}</SelectItem>
                  <SelectItem value="rtl">{t("panRtl")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </>
        )}

        {isAnimationType && (
          <AnimationFramesEditor
            frames={animationConfig?.framePaths ?? []}
            frameWidth={animationConfig?.frameWidth ?? 0}
            frameHeight={animationConfig?.frameHeight ?? 0}
            onChange={handleAnimationFramesChange}
            onUploadFiles={handleAnimationFrameUpload}
            disabled={uploading}
          />
        )}

        {isAnimationType && (
          <div className="space-y-2">
            <label htmlFor="animation-scroll-height" className="text-sm font-medium text-foreground">
              {t("animationScrollHeight")}
            </label>
            <Input
              id="animation-scroll-height"
              type="number"
              min={1}
              step={1}
              inputMode="numeric"
              value={animationConfig?.scrollHeight ?? SCROLL_DISTANCES.animation}
              onChange={handleScrollHeightChange}
            />
          </div>
        )}

        <Separator />

        <div className="space-y-2">
          <label htmlFor="audio-upload" className="text-sm font-medium text-foreground">{t("audioUpload")}</label>
          <Input
            id="audio-upload"
            ref={audioInputRef}
            type="file"
            accept="audio/mpeg,audio/webm,audio/ogg"
            onChange={handleAudioUpload}
            disabled={uploading}
            className="cursor-pointer"
          />
          {section.audioPath && (
            <div className="flex min-w-0 items-center gap-2">
              <FileAudio className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                {section.audioPath.split("/").pop()}
              </span>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={handleAudioDelete}
                aria-label={t("deleteAudio")}
                className="size-6 text-destructive hover:text-destructive"
              >
                <Trash2 className="size-3" />
              </Button>
            </div>
          )}
        </div>

        {error && (
          <div role="alert" className="flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
            {error}
          </div>
        )}

        {uploading && (
          <div role="status" aria-live="polite" className="flex items-center gap-2 text-sm text-muted-foreground">
            <Upload className="size-4 animate-pulse" aria-hidden="true" />
            {t("uploading")}
          </div>
        )}

        {isFxType && (
          <>
            <Separator />

            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2">
                <CardTitle>{t("fxOverlay")}</CardTitle>
                {fxPath && (
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={handleFxDelete}
                    aria-label={t("deleteFx")}
                    title={t("deleteFx")}
                    className="size-6 shrink-0 text-destructive hover:text-destructive"
                  >
                    <Trash2 className="size-3" />
                  </Button>
                )}
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <label htmlFor="fx-upload" className="text-sm font-medium text-foreground">
                    {t("fxUpload")}
                  </label>
                  <Input
                    id="fx-upload"
                    ref={fxInputRef}
                    type="file"
                    accept="image/gif,image/webp"
                    onChange={handleFxUpload}
                    disabled={uploading}
                    className="cursor-pointer"
                  />
                </div>

                {fxPath && (
                  <div className="space-y-4 pt-2">
                    <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 sm:gap-4">
                      <div className="min-w-0 space-y-1">
                        <label htmlFor="fx-position-x" className="text-xs text-muted-foreground">
                          {t("fxPositionX")}
                        </label>
                        <Select
                          value={fxConfig.position.x}
                          onValueChange={(value) =>
                            handleFxConfigChange({
                              position: { ...fxConfig.position, x: value as "left" | "center" | "right" },
                            })
                          }
                        >
                          <SelectTrigger id="fx-position-x">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="left">{t("fxLeft")}</SelectItem>
                            <SelectItem value="center">{t("fxCenter")}</SelectItem>
                            <SelectItem value="right">{t("fxRight")}</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="min-w-0 space-y-1">
                        <label htmlFor="fx-position-y" className="text-xs text-muted-foreground">
                          {t("fxPositionY")}
                        </label>
                        <Select
                          value={fxConfig.position.y}
                          onValueChange={(value) =>
                            handleFxConfigChange({
                              position: { ...fxConfig.position, y: value as "top" | "center" | "bottom" },
                            })
                          }
                        >
                          <SelectTrigger id="fx-position-y">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="top">{t("fxTop")}</SelectItem>
                            <SelectItem value="center">{t("fxCenterY")}</SelectItem>
                            <SelectItem value="bottom">{t("fxBottom")}</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 sm:gap-4">
                      <div className="min-w-0 space-y-1">
                        <label htmlFor="fx-size-mode" className="text-xs text-muted-foreground">
                          {t("fxSizeMode")}
                        </label>
                        <Select
                          value={fxConfig.size.mode}
                          onValueChange={(value) =>
                            handleFxConfigChange({
                              size: { ...fxConfig.size, mode: value as "px" | "percent" },
                            })
                          }
                        >
                          <SelectTrigger id="fx-size-mode">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="px">{t("fxPx")}</SelectItem>
                            <SelectItem value="percent">{t("fxPercent")}</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex-1 space-y-1">
                        <label htmlFor="fx-width" className="text-xs text-muted-foreground">
                          {t("fxSizeWidth")}
                        </label>
                        <Input
                          id="fx-width"
                          type="number"
                          min={0}
                          value={fxConfig.size.width ?? 100}
                          onChange={(e) =>
                            handleFxConfigChange({
                              size: { ...fxConfig.size, width: Number(e.target.value) },
                            })
                          }
                        />
                      </div>
                      {fxConfig.size.mode === "px" && (
                        <div className="flex-1 space-y-1">
                          <label htmlFor="fx-height" className="text-xs text-muted-foreground">
                            {t("fxSizeHeight")}
                          </label>
                          <Input
                            id="fx-height"
                            type="number"
                            min={0}
                            value={fxConfig.size.height ?? 100}
                            onChange={(e) =>
                              handleFxConfigChange({
                                size: { ...fxConfig.size, height: Number(e.target.value) },
                              })
                            }
                          />
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-3">
                      <label htmlFor="fx-opacity" className="text-xs text-muted-foreground whitespace-nowrap">
                        {t("fxOpacity")}
                      </label>
                      <Slider
                        value={[fxOpacityPercent]}
                        onValueChange={(value) =>
                          setOpacityDraft({ sectionId: section.id, value: value[0] })
                        }
                        onValueCommitted={(value) => {
                          handleFxConfigChange({ opacity: value[0] / 100 });
                          setOpacityDraft(null);
                        }}
                        max={100}
                        step={1}
                        className="flex-1"
                      />
                      <span className="text-xs text-muted-foreground tabular-nums w-10 text-right">
                        {fxOpacityPercent}%
                      </span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}

        <Separator />

        <div className="space-y-2">
          <label htmlFor="preview" className="text-sm font-medium text-foreground">{t("preview")}</label>
          <SectionPreview section={section} />
        </div>
        </fieldset>
      </CardContent>
    </Card>
  );
}
