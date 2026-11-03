import type { SectionType } from "@/types/webtoon";

/**
 * Sous-ensemble du traducteur `editor` de next-intl utile aux libellés de
 * type : juste assez de surface pour rester testable sans provider i18n.
 */
export type SectionTypeLabelTranslator = (key: string) => string;

/**
 * Libellé traduit d'un type de section — source unique partagée par le panneau
 * de configuration, la liste des calques et l'en-tête de l'éditeur.
 */
export function sectionTypeLabel(
  t: SectionTypeLabelTranslator,
  type: SectionType,
): string {
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
