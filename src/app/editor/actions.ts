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

export async function saveWebtoon(
  webtoonId: string,
  sections: SectionWithImages[],
): Promise<{ ok: boolean; error?: string }> {
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
    const removedStorage = removedSections.map((section) => [
      ...section.images.map((image) => image.storagePath),
      section.audioPath,
      "imagePath" in section.config ? section.config.imagePath : undefined,
      "spritePath" in section.config ? section.config.spritePath : undefined,
    ].filter((path): path is string => Boolean(path)));
    await Promise.all(
      removedIds.map((id, index) => cleanupSectionStorage(id, removedStorage[index])),
    );

    const persistedIds = new Map<string, string>();
    for (const section of incomingSections) {
      if (existingSectionIds.has(section.id)) {
        await upsertSection(section);
        persistedIds.set(section.id, section.id);
      } else {
        const created = await createSection({
          webtoonId: section.webtoonId,
          type: section.type,
          config: section.config,
          position: section.position,
          audioPath: section.audioPath,
        });
        persistedIds.set(section.id, created.id);
        await syncImages(created.id, section.images);
      }
    }

    const orderedIds = [...incomingSections]
      .sort((a, b) => a.position - b.position)
      .map((s) => persistedIds.get(s.id))
      .filter((id): id is string => Boolean(id));
    await reorderSections(wid, orderedIds);

    revalidatePath(`/editor/${wid}`);
    revalidatePath("/read");

    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { ok: false, error: message };
  }
}

async function upsertSection(section: SectionWithImages): Promise<void> {
  const { error } = await supabase
    .from("sections")
    .update({
      type: section.type,
      config: section.config,
      position: section.position,
      audio_path: section.audioPath ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", section.id)
    .eq("webtoon_id", section.webtoonId);

  if (error) throw new Error(`updateSection failed: ${error.message}`);
  await syncImages(section.id, section.images);
}

async function syncImages(
  sectionId: string,
  images: ImageRecord[],
): Promise<void> {
  await supabase.from("images").delete().eq("section_id", sectionId);

  if (images.length === 0) return;

  const { error: imgError } = await supabase
    .from("images")
    .insert(
      images.map((img) => ({
        id: img.id,
        section_id: sectionId,
        webtoon_id: img.webtoonId,
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
    const result = await updateWebtoon(webtoonId, {
      visibility: "published",
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
    const current = await getWebtoon(webtoonId);
    if (current?.sections) {
      await Promise.all(
        current.sections.map((section) =>
          cleanupSectionStorage(section.id, [
            ...section.images.map((image) => image.storagePath),
            section.audioPath,
            "imagePath" in section.config ? section.config.imagePath : undefined,
            "spritePath" in section.config ? section.config.spritePath : undefined,
          ].filter((path): path is string => Boolean(path))),
        ),
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
