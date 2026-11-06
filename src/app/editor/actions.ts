"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";

import { supabase } from "@/lib/db/server";
import { requireUser } from "@/lib/auth/require-user";
import { sectionSchema } from "@/lib/schemas";
import {
  type SectionWithImages,
} from "@/lib/db/queries";
import {
  createSection,
  createWebtoon,
  deleteSection,
  deleteSectionsByIds,
  deleteWebtoon,
  getWebtoon,
  getWebtoonCoverPath,
  reorderSections,
  updateWebtoon,
  type UpdateWebtoonData,
} from "@/lib/db/queries";
import type { ImageRecord } from "@/types/webtoon";

const imageRecordSchema = z.object({
  id: z.string().min(1),
  sectionId: z.string().min(1),
  webtoonId: z.string().min(1),
  storagePath: z.string().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  mimeType: z.string().min(1),
  position: z.number().int().nonnegative(),
});

function hasUniqueIds(items: { id: string }[]): boolean {
  return new Set(items.map((item) => item.id)).size === items.length;
}

const sectionWithImagesSchema = sectionSchema
  .extend({
    images: z
      .array(imageRecordSchema)
      .max(20, "Une section ne peut pas contenir plus de 20 images"),
  })
  .refine((section) => hasUniqueIds(section.images), {
    message: "Les identifiants d'image doivent être uniques dans une section",
    path: ["images"],
  });

const saveWebtoonSchema = z.object({
  webtoonId: z.string().min(1),
  sections: z
    .array(sectionWithImagesSchema)
    .max(500, "Un webtoon ne peut pas contenir plus de 500 sections")
    .refine(hasUniqueIds, {
      message: "Les identifiants de section doivent être uniques",
      path: ["sections"],
    }),
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

/**
 * Message renvoyé au navigateur pour une panne interne.
 * Le détail (SQL, hôte, contraintes) reste dans les logs serveur.
 */
const GENERIC_ERROR_MESSAGE =
  "Une erreur est survenue. Réessayez dans quelques instants.";

const BUSINESS_ERROR_PATTERN =
  /introuvable|aucune section|nettoyage partiel|Impossible de publier/i;
const INTERNAL_ERROR_PATTERN =
  /db\.|fetch failed|ECONN|duplicate key|violates|timeout/i;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

/**
 * Transforme une erreur serveur en message public.
 * Les erreurs métier explicites passent telles quelles ; les pannes
 * d'infrastructure sont journalisées puis remplacées par un message générique.
 */
function publicErrorMessage(error: unknown): string {
  const message = errorMessage(error);
  console.error("[editor-actions] operation failed:", message);

  if (BUSINESS_ERROR_PATTERN.test(message)) return message;
  if (INTERNAL_ERROR_PATTERN.test(message)) return GENERIC_ERROR_MESSAGE;
  return message;
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
  description: string | undefined,
  ownerId: string,
) {
  for (let attempt = 1; attempt <= MAX_UNIQUE_TITLE_ATTEMPTS; attempt += 1) {
    try {
      return await createWebtoon({
        title: titleWithSuffix(title, attempt),
        description,
        visibility: "draft",
        ownerId,
      });
    } catch (error) {
      if (attempt === MAX_UNIQUE_TITLE_ATTEMPTS || !isDuplicateTitleError(error)) {
        throw error;
      }
    }
  }

  throw new Error("createWebtoonWithUniqueTitle: épuisement des tentatives");
}

interface SectionStorageSource {
  images: { storagePath: string }[];
  audioPath?: string | null;
  config: {
    imagePath?: string;
    spritePath?: string;
    fxPath?: string;
    audioPath?: string;
    framePaths?: string[];
  };
}

const STORAGE_BUCKET = "webtoon-images";
const STORAGE_REMOVE_BATCH_SIZE = 1000;

/** Tous les chemins Storage référencés par une section (images + config). */
function collectSectionStoragePaths(section: SectionStorageSource): string[] {
  return [
    ...section.images.map((image) => image.storagePath),
    section.audioPath,
    section.config.audioPath,
    section.config.imagePath,
    section.config.spritePath,
    section.config.fxPath,
    ...(section.config.framePaths ?? []),
  ].filter((path): path is string => typeof path === "string" && path.length > 0);
}

/** Tous les chemins Storage référencés par un webtoon (couverture + sections). */
function collectWebtoonStoragePaths(webtoon: {
  coverPath?: string | null;
  sections: SectionStorageSource[];
}): string[] {
  return [
    webtoon.coverPath,
    ...webtoon.sections.flatMap((section) => collectSectionStoragePaths(section)),
  ].filter((path): path is string => typeof path === "string" && path.length > 0);
}

/**
 * Supprime des objets Storage par lots (l'API accepte au plus 1000 clés).
 * Best-effort : une panne Storage est journalisée, jamais propagée.
 */
async function removeStoragePaths(paths: string[]): Promise<void> {
  const uniquePaths = [...new Set(paths)];
  if (uniquePaths.length === 0) return;

  for (let index = 0; index < uniquePaths.length; index += STORAGE_REMOVE_BATCH_SIZE) {
    const batch = uniquePaths.slice(index, index + STORAGE_REMOVE_BATCH_SIZE);
    const { error: removeError } = await supabase
      .storage
      .from(STORAGE_BUCKET)
      .remove(batch);

    if (removeError) {
      console.warn("removeStoragePaths failed:", removeError.message);
    }
  }
}

/**
 * Liste les fichiers d'un dossier Storage.
 * `depth` contrôle la descente dans les sous-dossiers : les frames d'animation
 * vivent dans `frames/<timestamp>/`, d'où la récursion bornée.
 */
async function listStorageFiles(prefix: string, depth: number): Promise<string[]> {
  const { data: files, error: listError } = await supabase
    .storage
    .from(STORAGE_BUCKET)
    .list(prefix, { limit: 1000 });

  if (listError || !files) return [];

  const paths: string[] = [];
  for (const file of files as { name: string; id?: string | null }[]) {
    const path = `${prefix}${file.name}`;
    // Les dossiers sont renvoyés avec `id: null` par l'API Storage.
    if (file.id === null) {
      if (depth > 0) {
        const nested = await listStorageFiles(`${path}/`, depth - 1);
        paths.push(...nested);
      }
      continue;
    }
    paths.push(path);
  }
  return paths;
}

const EMPTY_KEEP_PATHS: ReadonlySet<string> = new Set();

/**
 * Nettoie le dossier Storage d'une section supprimée.
 * Combine les chemins connus (base) et un listing du dossier (orphelins), en
 * préservant les chemins encore référencés par la sauvegarde en cours.
 */
async function cleanupSectionStorage(
  sectionId: string,
  knownPaths: string[] = [],
  keepPaths: ReadonlySet<string> = EMPTY_KEEP_PATHS,
): Promise<void> {
  const prefix = `webtoons/sections/${sectionId}/`;
  const [directFiles, frameFiles] = await Promise.all([
    listStorageFiles(prefix, 0),
    listStorageFiles(`${prefix}frames/`, 2),
  ]);

  const paths = [...new Set([...knownPaths, ...directFiles, ...frameFiles])].filter(
    (path) => !keepPaths.has(path),
  );
  if (paths.length === 0) return;

  await removeStoragePaths(paths);
}

/**
 * Compense une sauvegarde qui a échoué après la création de sections :
 * supprime (au mieux) les sections créées pendant la tentative. Sans ce
 * rollback, un retry recréerait les sections déjà persistées et dupliquerait
 * le webtoon. Les images liées partent via la cascade SQL
 * (`images.section_id ... on delete cascade`). Les sections préexistantes ne
 * sont jamais passées ici : seul l'appelant garde la liste des ids créés.
 *
 * Retourne le message d'échec de compensation, ou `null` si tout a été nettoyé.
 */
async function rollbackCreatedSections(
  createdSectionIds: string[],
): Promise<string | null> {
  let failure: string | null = null;

  // Ordre inverse de création : la dernière section persistée part en premier.
  for (const sectionId of [...createdSectionIds].reverse()) {
    try {
      await deleteSection(sectionId);
    } catch (cleanupError) {
      const cleanupMessage = errorMessage(cleanupError);
      failure ??= cleanupMessage;
      console.warn(
        `rollbackCreatedSections failed for ${sectionId}:`,
        cleanupMessage,
      );
    }
  }

  return failure;
}

export async function createWebtoonAction(
  input?: { title?: string; description?: string },
): Promise<{ ok: boolean; error?: string; webtoonId?: string }> {
  const auth = await requireUser();
  if (!auth.ok) return { ok: false, error: auth.error };

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
      auth.user.id,
    );

    revalidatePath("/editor");
    revalidatePath("/read");

    return { ok: true, webtoonId: webtoon.id };
  } catch (error) {
    return { ok: false, error: publicErrorMessage(error) };
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
  const auth = await requireUser();
  if (!auth.ok) return { ok: false, error: auth.error };

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
    // Ancienne couverture lue AVANT l'update : si elle est remplacée ou
    // effacée, son fichier devient orphelin après un update réussi.
    let previousCoverPath: string | null = null;
    if (parse.data.coverPath !== undefined) {
      try {
        previousCoverPath = await getWebtoonCoverPath(webtoonId, auth.user.id);
      } catch (coverError) {
        console.warn(
          `updateWebtoonMetadataAction cover lookup failed for ${webtoonId}:`,
          errorMessage(coverError),
        );
      }
    }

    const patch: UpdateWebtoonData = { title: parse.data.title };
    if (parse.data.description !== undefined) {
      // Une description vide efface la colonne (null), pas une chaîne vide.
      patch.description =
        parse.data.description.trim().length === 0
          ? null
          : parse.data.description;
    }
    if (parse.data.coverPath !== undefined) {
      patch.coverPath = parse.data.coverPath === "" ? null : parse.data.coverPath;
    }

    const updated = await updateWebtoon(webtoonId, patch, auth.user.id);
    if (!updated) {
      return { ok: false, error: "Webtoon introuvable." };
    }

    if (previousCoverPath && previousCoverPath !== patch.coverPath) {
      // Best-effort : l'update est déjà persisté, un incident Storage ne doit
      // pas le transformer en échec côté client.
      try {
        await removeStoragePaths([previousCoverPath]);
      } catch (cleanupError) {
        console.warn(
          `updateWebtoonMetadataAction cover cleanup failed for ${webtoonId}:`,
          errorMessage(cleanupError),
        );
      }
    }

    revalidatePath("/editor");
    revalidatePath("/read");

    return { ok: true };
  } catch (error) {
    if (isDuplicateTitleError(error)) {
      return { ok: false, error: DUPLICATE_TITLE_ERROR };
    }
    return { ok: false, error: publicErrorMessage(error) };
  }
}

export async function saveWebtoon(
  webtoonId: string,
  sections: SectionWithImages[],
): Promise<{ ok: boolean; error?: string; sectionIds?: Record<string, string> }> {
  const auth = await requireUser();
  if (!auth.ok) return { ok: false, error: auth.error };

  const parse = saveWebtoonSchema.safeParse({ webtoonId, sections });
  if (!parse.success) {
    return {
      ok: false,
      error: parse.error.issues.map((i) => i.message).join("; "),
    };
  }

  const createdSectionIds: string[] = [];

  try {
    const { webtoonId: wid, sections: incomingSections } = parse.data;
    const current = await getWebtoon(wid, auth.user.id);
    if (!current) {
      // Ne jamais créer de sections orphelines pour un webtoon inexistant.
      return { ok: false, error: "Webtoon introuvable." };
    }

    const existingSectionIds = new Set(current.sections.map((s) => s.id));
    const incomingSectionIds = new Set(
      incomingSections.map((s) => s.id),
    );

    const removedSections = current.sections.filter(
      (section) => !incomingSectionIds.has(section.id),
    );
    const removedIds = removedSections.map((section) => section.id);
    const removedStorage = removedSections.map((section) =>
      collectSectionStoragePaths(section),
    );
    const retainedSections = new Map(
      current.sections
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
        createdSectionIds.push(created.id);
        persistedIds.set(section.id, created.id);
        await syncImages(wid, created.id, section.images);
      }
    }

    const orderedIds = [...incomingSections]
      .sort((a, b) => a.position - b.position)
      .map((s) => persistedIds.get(s.id))
      .filter((id): id is string => Boolean(id));
    await reorderSections(wid, orderedIds);

    // P0-1 : supprimer les sections retirées en base AVANT tout nettoyage
    // Storage. Une ligne fantôme réapparaîtrait au rechargement avec des
    // médias déjà effacés, et compterait dans la publication.
    if (removedIds.length > 0) {
      await deleteSectionsByIds(wid, removedIds);
    }

    const incomingPaths = new Set(
      incomingSections.flatMap((section) => collectSectionStoragePaths(section)),
    );
    const replacedPaths = [...retainedSections.values()].flatMap((previous) =>
      collectSectionStoragePaths(previous).filter((path) => !incomingPaths.has(path)),
    );
    await removeStoragePaths(replacedPaths);

    await Promise.all(
      removedIds.map((id, index) =>
        cleanupSectionStorage(id, removedStorage[index], incomingPaths),
      ),
    );

    revalidatePath(`/editor/${wid}`);
    revalidatePath("/read");

    return { ok: true, sectionIds: Object.fromEntries(persistedIds) };
  } catch (err) {
    const message = publicErrorMessage(err);

    if (createdSectionIds.length === 0) {
      return { ok: false, error: message };
    }

    // Best-effort rollback: the caller retries the whole save on failure, so
    // sections persisted by this attempt must not survive to be duplicated.
    const cleanupFailure = await rollbackCreatedSections(createdSectionIds);
    if (cleanupFailure) {
      return {
        ok: false,
        error: `${message} (nettoyage partiel : ${cleanupFailure})`,
      };
    }

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

/**
 * Synchronise les lignes `images` d'une section sans jamais vider la table
 * avant un insert réussi :
 * 1. lire les ids existants,
 * 2. upsert des images entrantes (conflit sur `id`),
 * 3. supprimer uniquement les ids absents du payload.
 * Un échec d'upsert laisse donc les lignes existantes intactes.
 */
async function syncImages(
  webtoonId: string,
  sectionId: string,
  images: ImageRecord[],
): Promise<void> {
  const { data: existingRows, error: selectError } = await supabase
    .from("images")
    .select("id")
    .eq("section_id", sectionId);

  if (selectError) throw new Error(`syncImages failed: ${selectError.message}`);

  if (images.length > 0) {
    const { error: upsertError } = await supabase
      .from("images")
      .upsert(
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
        { onConflict: "id" },
      );

    if (upsertError) throw new Error(`syncImages failed: ${upsertError.message}`);
  }

  const incomingIds = new Set(images.map((img) => img.id));
  const staleIds = (existingRows ?? [])
    .map((row) => row.id)
    .filter((id) => !incomingIds.has(id));

  if (staleIds.length === 0) return;

  const { error: deleteError } = await supabase
    .from("images")
    .delete()
    .in("id", staleIds);

  if (deleteError) throw new Error(`syncImages failed: ${deleteError.message}`);
}

export async function publishWebtoon(
  webtoonId: string,
): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireUser();
  if (!auth.ok) return { ok: false, error: auth.error };

  const parse = publishWebtoonSchema.safeParse({ webtoonId });
  if (!parse.success) {
    return {
      ok: false,
      error: parse.error.issues.map((i) => i.message).join("; "),
    };
  }

  try {
    const current = await getWebtoon(webtoonId, auth.user.id);
    if (!current) {
      return { ok: false, error: "Webtoon introuvable." };
    }
    if (current.sections.length === 0) {
      return {
        ok: false,
        error: "Impossible de publier un webtoon sans section.",
      };
    }

    const result = await updateWebtoon(
      webtoonId,
      { visibility: "published" },
      auth.user.id,
    );
    if (!result) {
      return { ok: false, error: "Webtoon introuvable." };
    }

    revalidatePath(`/editor/${webtoonId}`);
    revalidatePath("/read");
    revalidatePath(`/read/${webtoonId}`);

    return { ok: true };
  } catch (err) {
    return { ok: false, error: publicErrorMessage(err) };
  }
}

export async function unpublishWebtoon(
  webtoonId: string,
): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireUser();
  if (!auth.ok) return { ok: false, error: auth.error };

  const parse = publishWebtoonSchema.safeParse({ webtoonId });
  if (!parse.success) {
    return {
      ok: false,
      error: parse.error.issues.map((i) => i.message).join("; "),
    };
  }

  try {
    const result = await updateWebtoon(
      webtoonId,
      { visibility: "draft" },
      auth.user.id,
    );
    if (!result) throw new Error("Webtoon not found");

    revalidatePath(`/editor/${webtoonId}`);
    revalidatePath("/read");

    return { ok: true };
  } catch (err) {
    return { ok: false, error: publicErrorMessage(err) };
  }
}

export async function deleteWebtoonAction(
  webtoonId: string,
): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireUser();
  if (!auth.ok) return { ok: false, error: auth.error };

  const parse = publishWebtoonSchema.safeParse({ webtoonId });
  if (!parse.success) {
    return {
      ok: false,
      error: parse.error.issues.map((i) => i.message).join("; "),
    };
  }

  try {
    // Lire les chemins AVANT la suppression : après le delete en cascade,
    // plus rien ne permet de retrouver les objets Storage.
    const current = await getWebtoon(webtoonId, auth.user.id);
    const knownPaths = current ? collectWebtoonStoragePaths(current) : [];

    // DB d'abord : si le delete échoue, aucun fichier n'est supprimé.
    // Un objet Storage orphelin est récupérable, un webtoon sans médias non.
    const deleted = await deleteWebtoon(webtoonId, auth.user.id);
    if (!deleted) {
      return { ok: false, error: "Webtoon introuvable." };
    }

    // Storage cleanup is best-effort: an outage must never turn a successful
    // DB delete into a failure (orphan objects can be swept later).
    if (current) {
      try {
        await Promise.all(
          current.sections.map((section) =>
            cleanupSectionStorage(
              section.id,
              collectSectionStoragePaths(section),
            ),
          ),
        );
        if (current.coverPath) {
          await removeStoragePaths([current.coverPath]);
        }
      } catch (cleanupError) {
        console.warn(
          `deleteWebtoonAction storage cleanup failed for ${webtoonId}:`,
          errorMessage(cleanupError),
        );
        // Fallback best-effort sur les chemins connus (tous orphelins).
        try {
          await removeStoragePaths(knownPaths);
        } catch (fallbackError) {
          console.warn(
            `deleteWebtoonAction storage fallback failed for ${webtoonId}:`,
            errorMessage(fallbackError),
          );
        }
      }
    }

    revalidatePath("/editor");
    revalidatePath("/read");

    return { ok: true };
  } catch (err) {
    return { ok: false, error: publicErrorMessage(err) };
  }
}
