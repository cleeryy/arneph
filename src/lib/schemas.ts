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

export const imageFitSchema = z.enum(['contain', 'cover', 'width']);
export const imageFocusSchema = z.enum(['top', 'center', 'bottom']);

export const imageSectionConfigSchema = z.object({
  type: z.literal('image'),
  imagePath: z.string().min(1),
  width: z.number().positive(),
  height: z.number().positive(),
  fit: imageFitSchema.optional(),
  focus: imageFocusSchema.optional(),
  audioPath: z.string().optional(),
  fxPath: z.string().optional(),
  fxConfig: fxOverlayConfigSchema.optional(),
});

export const longYSectionConfigSchema = z.object({
  type: z.literal('long-y'),
  imagePath: z.string().min(1),
  width: z.number().positive(),
  height: z.number().positive(),
  /**
   * Tuiles verticales d'une planche trop haute pour un canvas unique.
   * `imagePath` reste la première tuile. Absent = rendu historique en une
   * seule image.
   */
  tiles: z.array(z.string().min(1)).min(2).max(32).optional(),
  /** Hauteur d'une tuile (celle des tuiles de sortie, pas de la source). */
  tileHeight: z.number().int().min(256).max(16384).optional(),
  audioPath: z.string().optional(),
  fxPath: z.string().optional(),
  fxConfig: fxOverlayConfigSchema.optional(),
});

export const panXSectionConfigSchema = z.object({
  type: z.literal('pan-x'),
  imagePath: z.string().min(1),
  width: z.number().positive(),
  height: z.number().positive(),
  panDistance: z.number().min(100).max(400).optional(),
  direction: z.enum(['ltr', 'rtl']).optional(),
  /** @deprecated Conservé pour relire les anciennes données. */
  panSpeed: z.number().positive().optional(),
  audioPath: z.string().optional(),
});

export const animationSectionConfigSchema = z.object({
  type: z.literal('animation'),
  spritePath: z.string().min(1),
  framePaths: z.array(z.string().min(1)).max(500).optional(),
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
  })
  .superRefine((section, ctx) => {
    // Cohérence des tuiles `long-y` : soit aucune tuile (rendu historique en
    // une image), soit un lot complet avec sa hauteur de tuile. La plage de
    // hauteur est dérivée du nombre de tuiles, avec 1 px de tolérance pour les
    // arrondis du redimensionnement navigateur.
    if (section.config.type !== 'long-y') return;
    const { tiles, tileHeight, height } = section.config;

    if (!tiles) {
      if (tileHeight !== undefined) {
        ctx.addIssue({
          code: 'custom',
          message: 'tileHeight exige une liste tiles non vide',
          path: ['config', 'tileHeight'],
        });
      }
      return;
    }

    if (tileHeight === undefined) {
      ctx.addIssue({
        code: 'custom',
        message: 'tileHeight est requis quand tiles est fourni',
        path: ['config', 'tileHeight'],
      });
      return;
    }

    if (new Set(tiles).size !== tiles.length) {
      ctx.addIssue({
        code: 'custom',
        message: 'Les tuiles long-y doivent être uniques',
        path: ['config', 'tiles'],
      });
    }

    const minHeight = (tiles.length - 1) * tileHeight;
    const maxHeight = tiles.length * tileHeight;
    if (height < minHeight - 1 || height > maxHeight + 1) {
      ctx.addIssue({
        code: 'custom',
        message: `Hauteur ${height}px incohérente avec ${tiles.length} tuiles de ${tileHeight}px (attendu entre ${minHeight + 1} et ${maxHeight}px)`,
        path: ['config', 'height'],
      });
    }
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
