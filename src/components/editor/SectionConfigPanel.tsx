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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { SectionPreview } from "./SectionPreview";
import {
  resizeImage,
  toWebP,
  buildSpriteSheet,
  ImageProcessingError,
} from "@/lib/image/process";
import type { SectionWithImages } from "@/lib/db/queries";
import type { SectionType, ImageRecord } from "@/types/webtoon";

interface SectionConfigPanelProps {
  section: SectionWithImages;
  onSectionChange: (section: SectionWithImages) => void;
  onClose: () => void;
}

const SECTION_TYPE_LABELS: Record<SectionType, string> = {
  image: "Image",
  "long-y": "Long-scroll",
  "pan-x": "Panoramic",
  animation: "Animation",
};

const AUDIO_MIME_TYPES = ["audio/mpeg", "audio/webm", "audio/ogg"];

function createDefaultConfig(type: SectionType): SectionWithImages["config"] {
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

  const handleTypeChange = (newType: string | null) => {
    if (!newType) return;
    setError(null);
    const updated: SectionWithImages = {
      ...section,
      type: newType as SectionType,
      config: createDefaultConfig(newType as SectionType),
    };
    onSectionChange(updated);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);

    if (!isImageFile(file)) {
      setError("Veuillez sélectionner un fichier image.");
      return;
    }

    setUploading(true);
    try {
      const resized = await resizeImage(file);
      const webp = await toWebP(resized);
      const path = generateStoragePath(section.id, file.name);

      const { createClient } = await import("@supabase/supabase-js");
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      if (!supabaseUrl) throw new Error("Supabase URL not configured");
      const supabase = createClient(supabaseUrl, "");
      const { data: uploadData, error: uploadError } = await supabase
        .storage
        .from("webtoon-images")
        .upload(path, webp, { contentType: "image/webp", upsert: false });

      if (uploadError) throw uploadError;

       const imageConfig = section.config as Extract<SectionWithImages["config"], { type: "image" | "long-y" | "pan-x" }>;
       const imageRecord: ImageRecord = {
         id: crypto.randomUUID(),
         sectionId: section.id,
         webtoonId: section.webtoonId,
         storagePath: uploadData.path,
         width: resized.size > 0 ? imageConfig.width : 0,
         height: resized.size > 0 ? imageConfig.height : 0,
         mimeType: "image/webp",
         position: section.images.length,
       };

       const updatedSection: SectionWithImages = {
         ...section,
         images: [...section.images, imageRecord],
         config: {
           ...imageConfig,
           imagePath: uploadData.path,
         },
       };
      onSectionChange(updatedSection);
    } catch (err) {
      if (err instanceof ImageProcessingError) {
        setError(err.message);
      } else {
        setError("Erreur lors du téléchargement de l'image.");
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
      setError("Tous les fichiers doivent être des images.");
      return;
    }

    setUploading(true);
    try {
      const spriteSheet = await buildSpriteSheet(fileArray);
      const path = generateStoragePath(section.id, `sprite-${Date.now()}.webp`);

      const { createClient } = await import("@supabase/supabase-js");
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      if (!supabaseUrl) throw new Error("Supabase URL not configured");
      const supabase = createClient(supabaseUrl, "");
      const { data: uploadData, error: uploadError } = await supabase
        .storage
        .from("webtoon-images")
        .upload(path, spriteSheet.spriteBlob, { contentType: "image/webp", upsert: false });

      if (uploadError) throw uploadError;

      const updatedSection: SectionWithImages = {
        ...section,
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
        setError("Erreur lors de la création de la sprite sheet.");
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
      setError("Veuillez sélectionner un fichier audio (MP3, WebM ou OGG).");
      return;
    }

    setUploading(true);
    try {
      const path = generateStoragePath(section.id, file.name);

      const { createClient } = await import("@supabase/supabase-js");
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      if (!supabaseUrl) throw new Error("Supabase URL not configured");
      const supabase = createClient(supabaseUrl, "");
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
      setError("Erreur lors du téléchargement de l'audio.");
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

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="flex flex-row items-center justify-between">
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
            <SelectTrigger id="section-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(SECTION_TYPE_LABELS) as SectionType[]).map((type) => (
                <SelectItem key={type} value={type}>
                  {SECTION_TYPE_LABELS[type]}
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
              <p className="text-xs text-muted-foreground">
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
              <p className="text-xs text-muted-foreground">
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
            <div className="flex items-center gap-2">
              <FileAudio className="size-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground truncate">
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
          <div className="flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <AlertCircle className="size-4 shrink-0" />
            {error}
          </div>
        )}

        {uploading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Upload className="size-4 animate-pulse" />
            {t("uploading")}
          </div>
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
