import type { ReactElement } from "react";
import { NextIntlClientProvider } from "next-intl";

import type { SectionWithImages } from "@/lib/db/queries";
import type { ImageRecord, SectionConfig, SectionType } from "@/types/webtoon";
import frMessages from "../../../../../messages/fr.json";

/** Enveloppe next-intl (les composants deck lisent `reader.section.*`). */
export function wrap(ui: ReactElement) {
  return (
    <NextIntlClientProvider locale="fr" messages={frMessages}>
      {ui}
    </NextIntlClientProvider>
  );
}

export function makeImage(overrides: Partial<ImageRecord> = {}): ImageRecord {
  return {
    id: "img-1",
    sectionId: "sec-image",
    webtoonId: "w1",
    storagePath: "test/asset.webp",
    width: 800,
    height: 1200,
    mimeType: "image/webp",
    position: 0,
    ...overrides,
  };
}

export function makeSection(
  type: SectionType,
  config: SectionConfig,
  overrides: Partial<SectionWithImages> = {},
): SectionWithImages {
  const { images, ...rest } = overrides;
  return {
    id: `sec-${type}`,
    webtoonId: "w1",
    position: 1,
    type,
    config,
    audioPath: undefined,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...rest,
    images: images ?? [makeImage()],
  };
}
