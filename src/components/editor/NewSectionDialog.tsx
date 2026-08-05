"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Image, FileText, ArrowLeftRight, Play } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { SectionType } from "@/types/webtoon";

interface NewSectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (type: SectionType) => void;
}

const SECTION_OPTIONS: { type: SectionType; icon: React.ReactNode; label: string }[] = [
  { type: "image", icon: <Image className="size-6" />, label: "sectionTypeImage" },
  { type: "long-y", icon: <FileText className="size-6" />, label: "sectionTypeLongY" },
  { type: "pan-x", icon: <ArrowLeftRight className="size-6" />, label: "sectionTypePanX" },
  { type: "animation", icon: <Play className="size-6" />, label: "sectionTypeAnimation" },
];

export function NewSectionDialog({
  open,
  onOpenChange,
  onConfirm,
}: NewSectionDialogProps) {
  const t = useTranslations("editor");
  const [selectedType, setSelectedType] = React.useState<SectionType>("image");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("newSectionTitle")}</DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">{t("newSectionDescription")}</p>

        <div className="grid grid-cols-2 gap-3">
          {SECTION_OPTIONS.map((option) => (
            <button
              key={option.type}
              type="button"
              onClick={() => setSelectedType(option.type)}
              className={`flex flex-col items-center gap-2 rounded-lg border p-4 text-sm transition-all focus-visible:ring-2 focus-visible:ring-ring ${
                selectedType === option.type
                  ? "border-primary ring-2 ring-primary/20 bg-primary/5"
                  : "border-border hover:border-muted-foreground/30"
              }`}
            >
              {option.icon}
              <span>{t(option.label)}</span>
            </button>
          ))}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </Button>
          <Button onClick={() => onConfirm(selectedType)}>
            {t("createSection")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
