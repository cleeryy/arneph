import type { SectionWithImages } from "@/lib/db/queries";
import type { SectionType } from "@/types/webtoon";

const SECTION_TYPES: readonly string[] = ["image", "long-y", "pan-x", "animation"];

/**
 * Reassigne des positions contiguës 1-based à l'ordre reçu.
 *
 * Pure : retourne de nouveaux objets et ne mute jamais l'entrée. L'ordre de
 * l'argument fait foi (pas `section.position`), ce qui permet de renuméroter
 * aussi bien une suppression qu'un déplacement.
 */
export function renumberSections(sections: SectionWithImages[]): SectionWithImages[] {
  return sections.map((section, index) => ({
    ...section,
    position: index + 1,
  }));
}

/** Garde de type runtime sur les valeurs de `SectionType`. */
export function isSectionType(value: unknown): value is SectionType {
  return typeof value === "string" && SECTION_TYPES.includes(value);
}
