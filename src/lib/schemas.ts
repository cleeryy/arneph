import { z } from 'zod';

/**
 * Schémas zod de validation du domaine webtoon (T7).
 * Miroir de src/types/webtoon.ts — source unique partagée lecteur/éditeur/BDD.
 */

export const fxOverlayConfigSchema = z.object({
  position: z.object({
    x: z.enum(["left", "center", "right"]),
    y: z.enum(["top", "center", "bottom"]),
  }),
  size: z.object({
    mode: z.enum(["px", "percent"]),
    width: z.number().positive().optional(),
    height: z.number().positive().optional(),
  }),
  opacity: z.number().min(0).max(1),
});

export const imageSectionConfigSchema = z.object({
  type: z.literal('image'),
  imagePath: z.string().min(1),
  width: z.number().positive(),
  height: z.number().positive(),
  audioPath: z.string().optional(),
  fxPath: z.string().optional(),
  fxConfig: fxOverlayConfigSchema.optional(),
});

export const longYSectionConfigSchema = z.object({
  type: z.literal('long-y'),
  imagePath: z.string().min(1),
  width: z.number().positive(),
  height: z.number().positive(),
  audioPath: z.string().optional(),
  fxPath: z.string().optional(),
  fxConfig: fxOverlayConfigSchema.optional(),
});

export const panXSectionConfigSchema = z.object({
  type: z.literal('pan-x'),
  imagePath: z.string().min(1),
  width: z.number().positive(),
  height: z.number().positive(),
  panSpeed: z.number().positive().optional(),
  audioPath: z.string().optional(),
});

export const animationSectionConfigSchema = z.object({
  type: z.literal('animation'),
  spritePath: z.string().min(1),
  frameWidth: z.number().positive(),
  frameHeight: z.number().positive(),
  columns: z.number().int().positive(),
  rows: z.number().int().positive(),
  frameCount: z.number().int().positive(),
  scrollHeight: z.number().positive().optional(),
  audioPath: z.string().optional(),
});

export const sectionConfigSchema = z.discriminatedUnion('type', [
  imageSectionConfigSchema,
  longYSectionConfigSchema,
  panXSectionConfigSchema,
  animationSectionConfigSchema,
]);

export const sectionTypeSchema = z.enum(['image', 'long-y', 'pan-x', 'animation']);
export const sectionVisibilitySchema = z.enum(['draft', 'published']);

export const sectionSchema = z
  .object({
    id: z.string().min(1),
    webtoonId: z.string().min(1),
    position: z.number().int().nonnegative(),
    type: sectionTypeSchema,
    config: sectionConfigSchema,
    audioPath: z.string().optional(),
    createdAt: z.string().min(1),
    updatedAt: z.string().min(1),
  })
  .refine((s) => s.type === s.config.type, {
    message: 'section.type doit correspondre à section.config.type',
    path: ['type'],
  });

export const webtoonSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1, 'title requis (min 1 caractère)'),
  description: z.string().optional(),
  coverPath: z.string().optional(),
  visibility: sectionVisibilitySchema,
  settings: z.record(z.string(), z.unknown()),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});

export type FxOverlayConfig = z.infer<typeof fxOverlayConfigSchema>;
export type ImageSectionConfig = z.infer<typeof imageSectionConfigSchema>;
export type LongYSectionConfig = z.infer<typeof longYSectionConfigSchema>;
export type PanXSectionConfig = z.infer<typeof panXSectionConfigSchema>;
export type AnimationSectionConfig = z.infer<typeof animationSectionConfigSchema>;
export type SectionConfig = z.infer<typeof sectionConfigSchema>;
export type SectionType = z.infer<typeof sectionTypeSchema>;
export type SectionVisibility = z.infer<typeof sectionVisibilitySchema>;
export type Section = z.infer<typeof sectionSchema>;
export type Webtoon = z.infer<typeof webtoonSchema>;
