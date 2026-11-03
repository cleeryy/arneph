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
  resizeImage,
  toWebP,
  buildSpriteSheet,
  readImageDimensions,
  ImageProcessingError,
} from "@/lib/image/process";
import { isAnimatedImage } from "@/lib/image/animated";
import type { SectionWithImages } from "@/lib/db/queries";
import type { SectionType, ImageRecord, FxOverlayConfig } from "@/types/webtoon";

interface SectionConfigPanelProps {
  section: SectionWithImages;
  onSectionChange: (section: SectionWithImages) => void;
  onClose: () => void;
}

function getSectionTypeLabel(t: ReturnType<typeof useTranslations>, type: SectionType): string {
  switch (type) {
    case "image":
      return t("sectionTypeImage");
    case "long-y":
      return t("sectionTypeLongY");
    case "pan-x":
      return t("sectionTypePanX");
    case "animation":
      return t("sectionTypeAnimation");
  }
}

const AUDIO_MIME_TYPES = ["audio/mpeg", "audio/webm", "audio/ogg"];

export function createDefaultConfig(type: SectionType): SectionWithImages["config"] {
  switch (type) {
    case "image":
      return { type: "image", imagePath: "", width: 0, height: 0 };
    case "long-y":
      return { type: "long-y", imagePath: "", width: 0, height: 0 };
    case "pan-x":
      return { type: "pan-x", imagePath: "", width: 0, height: 0 };
    case "animation":
      return {
        type: "animation",
        spritePath: "",
        frameWidth: 0,
        frameHeight: 0,
        columns: 0,
        rows: 0,
        frameCount: 0,
      };
  }
}

function isImageFile(file: File): boolean {
  return file.type.startsWith("image/");
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
  const [error, setError] = React.useState<string | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const imageInputRef = React.useRef<HTMLInputElement>(null);
  const animationInputRef = React.useRef<HTMLInputElement>(null);
  const audioInputRef = React.useRef<HTMLInputElement>(null);
  const fxInputRef = React.useRef<HTMLInputElement>(null);

  const handleTypeChange = (newType: string | null) => {
    if (!newType) return;
    setError(null);
    const nextType = newType as SectionType;
    const staticTypes: SectionType[] = ["image", "long-y", "pan-x"];
    const isCompatibleSwitch =
      staticTypes.includes(section.type) && staticTypes.includes(nextType);
    const nextConfig = createDefaultConfig(nextType);
    if (isCompatibleSwitch) {
      const current = section.config as Extract<
        SectionWithImages["config"],
        { type: "image" | "long-y" | "pan-x" }
      >;
      const target = nextConfig as Extract<
        SectionWithImages["config"],
        { type: "image" | "long-y" | "pan-x" }
      >;
      target.imagePath = current.imagePath;
      target.width = current.width;
      target.height = current.height;
    }
    const updated: SectionWithImages = {
      ...section,
      type: nextType,
      config: nextConfig,
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

    setUploading(true);
    try {
      const animated = await isAnimatedImage(file);

      let uploadBlob: Blob;
      let mimeType: string;
      let dimensions: { width: number; height: number };

      if (animated) {
        uploadBlob = file;
        mimeType = file.type;
        dimensions = await readImageDimensions(file);
      } else {
        const resized = await resizeImage(file);
        const webp = await toWebP(resized);
        dimensions = await readImageDimensions(webp);
        uploadBlob = webp;
        mimeType = "image/webp";
      }

      const path = generateStoragePath(section.id, file.name);

      const { createClient } = await import("@supabase/supabase-js");
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (!supabaseUrl || !supabaseAnonKey)
        throw new Error("Supabase URL or anon key not configured");
      const supabase = createClient(supabaseUrl, supabaseAnonKey);
      const { data: uploadData, error: uploadError } = await supabase
        .storage
        .from("webtoon-images")
        .upload(path, uploadBlob, { contentType: mimeType, upsert: false });

      if (uploadError) throw uploadError;

       const imageConfig = section.config as Extract<SectionWithImages["config"], { type: "image" | "long-y" | "pan-x" }>;
        const imageRecord: ImageRecord = {
          id: crypto.randomUUID(),
          sectionId: section.id,
          webtoonId: section.webtoonId,
          storagePath: uploadData.path,
          width: dimensions.width,
          height: dimensions.height,
          mimeType,
          position: 0,
        };

        const updatedSection: SectionWithImages = {
          ...section,
          images: [imageRecord],
         config: {
           ...imageConfig,
           imagePath: uploadData.path,
           width: dimensions.width,
           height: dimensions.height,
         },
       };
      onSectionChange(updatedSection);
    } catch (err) {
      if (err instanceof ImageProcessingError) {
        setError(err.message);
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

    setUploading(true);
    try {
      const spriteSheet = await buildSpriteSheet(fileArray);
      const path = generateStoragePath(section.id, `sprite-${Date.now()}.webp`);

      const { createClient } = await import("@supabase/supabase-js");
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (!supabaseUrl || !supabaseAnonKey)
        throw new Error("Supabase URL or anon key not configured");
      const supabase = createClient(supabaseUrl, supabaseAnonKey);
      const { data: uploadData, error: uploadError } = await supabase
        .storage
        .from("webtoon-images")
        .upload(path, spriteSheet.spriteBlob, { contentType: "image/webp", upsert: false });

      if (uploadError) throw uploadError;

      const spriteRecord: ImageRecord = {
        id: crypto.randomUUID(),
        sectionId: section.id,
        webtoonId: section.webtoonId,
        storagePath: uploadData.path,
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
          spritePath: uploadData.path,
          frameWidth: spriteSheet.frameWidth,
          frameHeight: spriteSheet.frameHeight,
          columns: spriteSheet.columns,
          rows: spriteSheet.rows,
          frameCount: spriteSheet.frameCount,
        },
      };
      onSectionChange(updatedSection);
    } catch (err) {
      if (err instanceof ImageProcessingError) {
        setError(err.message);
      } else {
        setError(t("uploadAnimationErrorGeneric"));
      }
    } finally {
      setUploading(false);
      if (animationInputRef.current) animationInputRef.current.value = "";
    }
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

      const { createClient } = await import("@supabase/supabase-js");
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (!supabaseUrl || !supabaseAnonKey)
        throw new Error("Supabase URL or anon key not configured");
      const supabase = createClient(supabaseUrl, supabaseAnonKey);
      const { data: uploadData, error: uploadError } = await supabase
        .storage
        .from("webtoon-images")
        .upload(path, file, { contentType: file.type, upsert: false });

      if (uploadError) throw uploadError;

      const updatedSection: SectionWithImages = {
        ...section,
        audioPath: uploadData.path,
      };
      onSectionChange(updatedSection);
    } catch (err) {
      if (err instanceof ImageProcessingError) {
        setError(err.message);
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

  const handleFxUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);

    if (!["image/gif", "image/webp"].includes(file.type)) {
      setError(t("fxUploadError"));
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

      const { createClient } = await import("@supabase/supabase-js");
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (!supabaseUrl || !supabaseAnonKey)
        throw new Error("Supabase URL or anon key not configured");
      const supabase = createClient(supabaseUrl, supabaseAnonKey);
      const { data: uploadData, error: uploadError } = await supabase
        .storage
        .from("webtoon-images")
        .upload(path, file, { contentType: file.type, upsert: false });

      if (uploadError) throw uploadError;

       const fxSectionConfig = section.config as Extract<
         SectionWithImages["config"],
         { type: "image" | "long-y" }
       >;
       const updatedSection: SectionWithImages = {
         ...section,
         config: {
           ...fxSectionConfig,
           fxPath: uploadData.path,
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
        setError(err.message);
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

  return (
    <Card className="mx-auto w-full max-w-full sm:max-w-md">
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle>{t("configPanelTitle")}</CardTitle>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label={t("closePanel")}>
          <X className="size-4" />
        </Button>
      </CardHeader>

      <CardContent className="space-y-4">
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
                  {getSectionTypeLabel(t, type)}
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
                    aria-label={t("deleteAudio")}
                    title={t("deleteAudio")}
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
                        value={[Math.round(fxConfig.opacity * 100)]}
                        onValueChange={(value) => handleFxConfigChange({ opacity: value[0] / 100 })}
                        max={100}
                        step={1}
                        className="flex-1"
                      />
                      <span className="text-xs text-muted-foreground tabular-nums w-10 text-right">
                        {Math.round(fxConfig.opacity * 100)}%
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
      </CardContent>
    </Card>
  );
}
