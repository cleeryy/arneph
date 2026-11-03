"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";

import { supabase } from "@/lib/db/server";
import { sectionSchema } from "@/lib/schemas";
import {
  type SectionWithImages,
} from "@/lib/db/queries";
import {
  createSection,
  createWebtoon,
  deleteWebtoon,
  getWebtoon,
  reorderSections,
  updateWebtoon,
} from "@/lib/db/queries";
import type { ImageRecord } from "@/types/webtoon";

const imageRecordSchema = z.object({
  id: z.string().min(1),
  sectionId: z.string().min(1),
  webtoonId: z.string().min(1),
  storagePath: z.string().min(1),
  width: z.number().positive(),
  height: z.number().positive(),
  mimeType: z.string().min(1),
  position: z.number().int().nonnegative(),
});

const sectionWithImagesSchema = sectionSchema.extend({
  images: z.array(imageRecordSchema),
});

const saveWebtoonSchema = z.object({
  webtoonId: z.string().min(1),
  sections: z.array(sectionWithImagesSchema),
});

const publishWebtoonSchema = z.object({
  webtoonId: z.string().min(1),
});

const createWebtoonSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Le titre est requis")
    .max(120, "Le titre ne doit pas dépasser 120 caractères")
    .optional(),
  description: z
    .string()
    .max(2000, "La description ne doit pas dépasser 2000 caractères")
    .optional(),
});

const updateWebtoonMetadataSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Le titre est requis")
    .max(120, "Le titre ne doit pas dépasser 120 caractères"),
  description: z
    .string()
    .max(2000, "La description ne doit pas dépasser 2000 caractères")
    .optional(),
  // `undefined` = couverture inchangée ; `""` = suppression (voir l'action).
  coverPath: z
    .string()
    .max(512, "Le chemin de la couverture ne doit pas dépasser 512 caractères")
    .refine((path) => path === "" || path.trim().length > 0, {
      message: "Le chemin de la couverture est invalide",
    })
    .optional(),
});

const DEFAULT_WEBTOON_TITLE = "Nouveau webtoon";
const MAX_UNIQUE_TITLE_ATTEMPTS = 50;

const DUPLICATE_TITLE_ERROR =
  "Un webtoon porte déjà ce titre. Choisissez un autre titre.";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

/** Détecte une violation de la contrainte unique `unique_webtoons_title`. */
function isDuplicateTitleError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = (error as { code?: unknown }).code;
  if (code === "23505") return true;
  const message = errorMessage(error);
  return /duplicate key|unique constraint|unique_webtoons_title/i.test(message);
}

function titleWithSuffix(title: string, attempt: number): string {
  return attempt <= 1 ? title : `${title} (${attempt})`;
}

/**
 * Crée un webtoon en évitant la collision de titre unique.
 * Réessaie avec un suffixe numérique (`Titre (2)`, `Titre (3)`, …) au lieu
 * de propager une erreur duplicate-key à l'UI.
 */
async function createWebtoonWithUniqueTitle(
  title: string,
  description?: string,
) {
  for (let attempt = 1; attempt <= MAX_UNIQUE_TITLE_ATTEMPTS; attempt += 1) {
    try {
      return await createWebtoon({
        title: titleWithSuffix(title, attempt),
        description,
        visibility: "draft",
      });
    } catch (error) {
      if (attempt === MAX_UNIQUE_TITLE_ATTEMPTS || !isDuplicateTitleError(error)) {
        throw error;
      }
    }
  }

  throw new Error("createWebtoonWithUniqueTitle: épuisement des tentatives");
}

function collectSectionStoragePaths(section: {
  images: { storagePath: string }[];
  audioPath?: string | null;
  config: { imagePath?: unknown; spritePath?: unknown; fxPath?: unknown };
}): string[] {
  return [
    ...section.images.map((image) => image.storagePath),
    section.audioPath,
    "imagePath" in section.config ? section.config.imagePath : undefined,
    "spritePath" in section.config ? section.config.spritePath : undefined,
    "fxPath" in section.config ? section.config.fxPath : undefined,
  ].filter((path): path is string => typeof path === "string" && path.length > 0);
}

async function removeStoragePaths(paths: string[]): Promise<void> {
  const uniquePaths = [...new Set(paths)];
  if (uniquePaths.length === 0) return;

  const { error: removeError } = await supabase
    .storage
    .from("webtoon-images")
    .remove(uniquePaths);

  if (removeError) {
    console.warn("removeStoragePaths failed:", removeError.message);
  }
}

async function cleanupSectionStorage(sectionId: string, knownPaths: string[] = []): Promise<void> {
  const prefix = `webtoons/sections/${sectionId}/`;
  const { data: files, error: listError } = await supabase
    .storage
    .from("webtoon-images")
    .list(prefix, { limit: 1000 });

  const listedPaths = listError || !files ? [] : files.map((file: { name: string }) => `${prefix}${file.name}`);
  const paths = [...new Set([...knownPaths, ...listedPaths])];
  if (paths.length === 0) return;

  const { error: removeError } = await supabase
    .storage
    .from("webtoon-images")
    .remove(paths);

  if (removeError) {
    console.warn(`cleanupSectionStorage failed for ${sectionId}:`, removeError.message);
  }
}

export async function createWebtoonAction(
  input?: { title?: string; description?: string },
): Promise<{ ok: boolean; error?: string; webtoonId?: string }> {
  const parse = createWebtoonSchema.safeParse(input ?? {});
  if (!parse.success) {
    return {
      ok: false,
      error: parse.error.issues.map((i) => i.message).join("; "),
    };
  }

  try {
    const webtoon = await createWebtoonWithUniqueTitle(
      parse.data.title ?? DEFAULT_WEBTOON_TITLE,
      parse.data.description,
    );

    revalidatePath("/editor");
    revalidatePath("/read");

    return { ok: true, webtoonId: webtoon.id };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}

export async function updateWebtoonMetadataAction(
  webtoonId: string,
  metadata: {
    title: string;
    description?: string | null;
    /** `undefined` = inchangée ; `""` (ou `null`) = suppression. */
    coverPath?: string | null;
  },
): Promise<{ ok: boolean; error?: string }> {
  const idParse = publishWebtoonSchema.safeParse({ webtoonId });
  if (!idParse.success) {
    return {
      ok: false,
      error: idParse.error.issues.map((i) => i.message).join("; "),
    };
  }

  const parse = updateWebtoonMetadataSchema.safeParse({
    title: metadata?.title,
    description: metadata?.description ?? undefined,
    coverPath: metadata?.coverPath === null ? "" : metadata?.coverPath,
  });
  if (!parse.success) {
    return {
      ok: false,
      error: parse.error.issues.map((i) => i.message).join("; "),
    };
  }

  try {
    const patch: Parameters<typeof updateWebtoon>[1] = {
      title: parse.data.title,
      description: parse.data.description,
    };
    if (parse.data.coverPath !== undefined) {
      // `webtoons.cover_path` est nullable : `null` efface la couverture.
      // `UpdateWebtoonData` n'expose pas encore `null` pour ce champ.
      (patch as { coverPath?: string | null }).coverPath =
        parse.data.coverPath === "" ? null : parse.data.coverPath;
    }

    const updated = await updateWebtoon(webtoonId, patch);
    if (!updated) {
      return { ok: false, error: "Webtoon introuvable." };
    }

    revalidatePath("/editor");
    revalidatePath("/read");

    return { ok: true };
  } catch (error) {
    if (isDuplicateTitleError(error)) {
      return { ok: false, error: DUPLICATE_TITLE_ERROR };
    }
    return { ok: false, error: errorMessage(error) };
  }
}

export async function saveWebtoon(
  webtoonId: string,
  sections: SectionWithImages[],
): Promise<{ ok: boolean; error?: string; sectionIds?: Record<string, string> }> {
  const parse = saveWebtoonSchema.safeParse({ webtoonId, sections });
  if (!parse.success) {
    return {
      ok: false,
      error: parse.error.issues.map((i) => i.message).join("; "),
    };
  }

  try {
    const { webtoonId: wid, sections: incomingSections } = parse.data;
    const current = await getWebtoon(wid);
    const existingSectionIds = new Set(
      current?.sections.map((s) => s.id) ?? [],
    );
    const incomingSectionIds = new Set(
      incomingSections.map((s) => s.id),
    );

    const removedSections = (current?.sections ?? []).filter(
      (section) => !incomingSectionIds.has(section.id),
    );
    const removedIds = removedSections.map((section) => section.id);
    const removedStorage = removedSections.map((section) =>
      collectSectionStoragePaths(section),
    );
    const retainedSections = new Map(
      (current?.sections ?? [])
        .filter((section) => incomingSectionIds.has(section.id))
        .map((section) => [section.id, section] as const),
    );
    const persistedIds = new Map<string, string>();
    for (const section of incomingSections) {
      if (existingSectionIds.has(section.id)) {
        await upsertSection(wid, section);
        persistedIds.set(section.id, section.id);
      } else {
        const created = await createSection({
          webtoonId: wid,
          type: section.type,
          config: section.config,
          position: section.position,
          audioPath: section.audioPath,
        });
        persistedIds.set(section.id, created.id);
        await syncImages(wid, created.id, section.images);
      }
    }

    const orderedIds = [...incomingSections]
      .sort((a, b) => a.position - b.position)
      .map((s) => persistedIds.get(s.id))
      .filter((id): id is string => Boolean(id));
    await reorderSections(wid, orderedIds);

    const incomingPaths = new Set(
      incomingSections.flatMap((section) => collectSectionStoragePaths(section)),
    );
    const replacedPaths = [...retainedSections.values()].flatMap((previous) =>
      collectSectionStoragePaths(previous).filter((path) => !incomingPaths.has(path)),
    );
    await removeStoragePaths(replacedPaths);

    await Promise.all(
      removedIds.map((id, index) => cleanupSectionStorage(id, removedStorage[index])),
    );

    revalidatePath(`/editor/${wid}`);
    revalidatePath("/read");

    return { ok: true, sectionIds: Object.fromEntries(persistedIds) };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { ok: false, error: message };
  }
}

async function upsertSection(
  webtoonId: string,
  section: SectionWithImages,
): Promise<void> {
  const { data: rows, error } = await supabase
    .from("sections")
    .update({
      type: section.type,
      config: section.config,
      position: section.position,
      audio_path: section.audioPath ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", section.id)
    .eq("webtoon_id", webtoonId)
    .select("id");

  if (error) throw new Error(`updateSection failed: ${error.message}`);
  if (!rows || rows.length === 0) {
    throw new Error(
      `updateSection failed: section ${section.id} introuvable pour le webtoon ${webtoonId}`,
    );
  }
  await syncImages(webtoonId, section.id, section.images);
}

async function syncImages(
  webtoonId: string,
  sectionId: string,
  images: ImageRecord[],
): Promise<void> {
  const { error: deleteError } = await supabase.from("images").delete().eq("section_id", sectionId);

  if (deleteError) throw new Error(`syncImages failed: ${deleteError.message}`);

  if (images.length === 0) return;

  const { error: imgError } = await supabase
    .from("images")
    .insert(
      images.map((img) => ({
        id: img.id,
        section_id: sectionId,
        webtoon_id: webtoonId,
        storage_path: img.storagePath,
        width: img.width,
        height: img.height,
        mime_type: img.mimeType,
        position: img.position,
      })),
    );

  if (imgError) throw new Error(`syncImages failed: ${imgError.message}`);
}

export async function publishWebtoon(
  webtoonId: string,
): Promise<{ ok: boolean; error?: string }> {
  const parse = publishWebtoonSchema.safeParse({ webtoonId });
  if (!parse.success) {
    return {
      ok: false,
      error: parse.error.issues.map((i) => i.message).join("; "),
    };
  }

  try {
    const current = await getWebtoon(webtoonId);
    if (!current) {
      return { ok: false, error: "Webtoon introuvable." };
    }
    if (current.sections.length === 0) {
      return {
        ok: false,
        error: "Impossible de publier un webtoon sans section.",
      };
    }

    const result = await updateWebtoon(webtoonId, {
      visibility: "published",
    });
    if (!result) {
      return { ok: false, error: "Webtoon introuvable." };
    }

    revalidatePath(`/editor/${webtoonId}`);
    revalidatePath("/read");
    revalidatePath(`/read/${webtoonId}`);

    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { ok: false, error: message };
  }
}

export async function unpublishWebtoon(
  webtoonId: string,
): Promise<{ ok: boolean; error?: string }> {
  const parse = publishWebtoonSchema.safeParse({ webtoonId });
  if (!parse.success) {
    return {
      ok: false,
      error: parse.error.issues.map((i) => i.message).join("; "),
    };
  }

  try {
    const result = await updateWebtoon(webtoonId, {
      visibility: "draft",
    });
    if (!result) throw new Error("Webtoon not found");

    revalidatePath(`/editor/${webtoonId}`);
    revalidatePath("/read");

    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { ok: false, error: message };
  }
}

export async function deleteWebtoonAction(
  webtoonId: string,
): Promise<{ ok: boolean; error?: string }> {
  const parse = publishWebtoonSchema.safeParse({ webtoonId });
  if (!parse.success) {
    return {
      ok: false,
      error: parse.error.issues.map((i) => i.message).join("; "),
    };
  }

  try {
    // Storage cleanup is best-effort: an outage must never block deleting
    // the database row (orphan objects can be swept later).
    try {
      const current = await getWebtoon(webtoonId);
      if (current?.sections) {
        await Promise.all(
          current.sections.map((section) =>
            cleanupSectionStorage(section.id, [
              ...section.images.map((image) => image.storagePath),
              section.audioPath,
              "imagePath" in section.config ? section.config.imagePath : undefined,
              "spritePath" in section.config ? section.config.spritePath : undefined,
              "fxPath" in section.config ? section.config.fxPath : undefined,
            ].filter((path): path is string => Boolean(path))),
          ),
        );
      }
    } catch (cleanupError) {
      console.warn(
        `deleteWebtoonAction storage cleanup failed for ${webtoonId}:`,
        errorMessage(cleanupError),
      );
    }

    await deleteWebtoon(webtoonId);

    revalidatePath("/editor");
    revalidatePath("/read");

    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { ok: false, error: message };
  }
}
