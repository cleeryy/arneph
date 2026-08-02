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
  updateSection,
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

async function cleanupSectionStorage(sectionId: string): Promise<void> {
  const prefix = `webtoons/sections/${sectionId}/`;
  const { data: files, error: listError } = await supabase
    .storage
    .from("webtoon-images")
    .list(prefix, { limit: 1000 });

  if (listError || !files || files.length === 0) return;

  const paths = files.map((f) => `${prefix}${f.name}`);
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

    const removedIds = [...existingSectionIds].filter(
      (id) => !incomingSectionIds.has(id),
    );
    await Promise.all(removedIds.map(cleanupSectionStorage));

    for (const section of incomingSections) {
      if (existingSectionIds.has(section.id)) {
        await upsertSection(section);
      } else {
        await createSection({
          webtoonId: section.webtoonId,
          type: section.type,
          config: section.config,
          position: section.position,
          audioPath: section.audioPath,
        });
        await syncImages(section.id, section.images);
      }
    }

    const orderedIds = incomingSections
      .sort((a, b) => a.position - b.position)
      .map((s) => s.id);
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
        section_id: img.sectionId,
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
      const sectionIds = current.sections.map((s) => s.id);
      await Promise.all(sectionIds.map(cleanupSectionStorage));
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
