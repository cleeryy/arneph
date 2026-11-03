"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Image as ImageIcon, FileText, ArrowLeftRight, Play } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { SectionType } from "@/types/webtoon";

interface NewSectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (type: SectionType) => void;
}

const SECTION_OPTIONS: { type: SectionType; icon: React.ReactNode; label: string }[] = [
  { type: "image", icon: <ImageIcon aria-hidden="true" className="size-6" />, label: "sectionTypeImage" },
  { type: "long-y", icon: <FileText aria-hidden="true" className="size-6" />, label: "sectionTypeLongY" },
  { type: "pan-x", icon: <ArrowLeftRight aria-hidden="true" className="size-6" />, label: "sectionTypePanX" },
  { type: "animation", icon: <Play aria-hidden="true" className="size-6" />, label: "sectionTypeAnimation" },
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
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("newSectionTitle")}</DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">{t("newSectionDescription")}</p>

        <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
          {SECTION_OPTIONS.map((option) => (
            <button
              key={option.type}
              type="button"
              aria-pressed={selectedType === option.type}
              onClick={() => setSelectedType(option.type)}
              className={`flex min-h-20 flex-col items-center justify-center gap-2 rounded-lg border p-4 text-sm transition-all outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                selectedType === option.type
                  ? "border-primary ring-2 ring-primary/20 bg-primary/5 font-medium"
                  : "border-border hover:border-muted-foreground/30 hover:bg-muted/40"
              }`}
            >
              {option.icon}
              <span>{t(option.label)}</span>
            </button>
          ))}
        </div>

        <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
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
