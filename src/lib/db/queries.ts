import { supabase, type Database } from "./server";
import type {
  ImageRecord,
  Section,
  SectionConfig,
  SectionType,
  SectionVisibility,
  Webtoon,
} from "@/types/webtoon";

// ---------------------------------------------------------------------------
// Mapping snake_case (SQL) → camelCase (types T7).
// Le schéma SQL est la source de vérité ; la couche TS exporte les types T7.
// ---------------------------------------------------------------------------

interface WebtoonRow {
  id: string;
  title: string;
  description: string | null;
  cover_path: string | null;
  visibility: SectionVisibility;
  settings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

interface SectionRow {
  id: string;
  webtoon_id: string;
  position: number;
  type: SectionType;
  config: SectionConfig;
  audio_path: string | null;
  created_at: string;
  updated_at: string;
}

interface ImageRow {
  id: string;
  section_id: string;
  webtoon_id: string;
  storage_path: string;
  width: number;
  height: number;
  mime_type: string;
  position: number;
  created_at: string;
}

function mapWebtoon(row: WebtoonRow): Webtoon {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? undefined,
    coverPath: row.cover_path ?? undefined,
    visibility: row.visibility,
    settings: row.settings,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapSection(row: SectionRow): Section {
  return {
    id: row.id,
    webtoonId: row.webtoon_id,
    position: row.position,
    type: row.type,
    config: row.config,
    audioPath: row.audio_path ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapImage(row: ImageRow): ImageRecord {
  return {
    id: row.id,
    sectionId: row.section_id,
    webtoonId: row.webtoon_id,
    storagePath: row.storage_path,
    width: row.width,
    height: row.height,
    mimeType: row.mime_type,
    position: row.position,
  };
}

/** Section enrichie de ses images ordonnées. */
export interface SectionWithImages extends Section {
  images: ImageRecord[];
}

/** Webtoon complet : sections ordonnées, images imbriquées. */
export interface WebtoonWithSections extends Webtoon {
  sections: SectionWithImages[];
}

function throwDbError(
  operation: string,
  error: { message?: string; code?: string },
): never {
  const wrapped = new Error(
    `db.${operation} failed: ${error.message ?? "unknown error"}`,
  ) as Error & { code?: string };
  // Conserve le code Postgres (ex. 23505) pour que les Server Actions
  // distinguent une collision de titre d'une vraie panne base.
  if (error.code) wrapped.code = error.code;
  throw wrapped;
}

// ---------------------------------------------------------------------------
// Webtoons
// ---------------------------------------------------------------------------

export interface CreateWebtoonData {
  title: string;
  description?: string;
  coverPath?: string;
  visibility?: SectionVisibility;
  settings?: Record<string, unknown>;
}

export type UpdateWebtoonData = Partial<CreateWebtoonData>;

export async function createWebtoon(data: CreateWebtoonData): Promise<Webtoon> {
  const { data: row, error } = await supabase
    .from("webtoons")
    .insert({
      title: data.title,
      description: data.description ?? null,
      cover_path: data.coverPath ?? null,
      visibility: data.visibility ?? "draft",
      settings: data.settings ?? {},
    })
    .select()
    .single();
  if (error) throwDbError("createWebtoon", error);
  return mapWebtoon(row as WebtoonRow);
}

export async function updateWebtoon(
  id: string,
  data: UpdateWebtoonData,
): Promise<Webtoon | null> {
  const patch: Database["public"]["Tables"]["webtoons"]["Update"] = {};
  if (data.title !== undefined) patch.title = data.title;
  if (data.description !== undefined) patch.description = data.description;
  if (data.coverPath !== undefined) patch.cover_path = data.coverPath;
  if (data.visibility !== undefined) patch.visibility = data.visibility;
  if (data.settings !== undefined) patch.settings = data.settings;

  const { data: row, error } = await supabase
    .from("webtoons")
    .update(patch)
    .eq("id", id)
    .select()
    .maybeSingle();
  if (error) throwDbError("updateWebtoon", error);
  return row ? mapWebtoon(row as WebtoonRow) : null;
}

export async function deleteWebtoon(id: string): Promise<boolean> {
  const { error } = await supabase.from("webtoons").delete().eq("id", id);
  if (error) throwDbError("deleteWebtoon", error);
  return true;
}

export async function listPublishedWebtoons(): Promise<Webtoon[]> {
  const { data, error } = await supabase
    .from("webtoons")
    .select("*")
    .eq("visibility", "published")
    .order("updated_at", { ascending: false });
  if (error) throwDbError("listPublishedWebtoons", error);
  return (data ?? []).map((row: WebtoonRow) => mapWebtoon(row));
}

/** Tous les webtoons (drafts inclus) — utilisé par l'éditeur. */
export async function listWebtoons(): Promise<Webtoon[]> {
  const { data, error } = await supabase
    .from("webtoons")
    .select("*")
    .order("updated_at", { ascending: false });
  if (error) throwDbError("listWebtoons", error);
  return (data ?? []).map((row: WebtoonRow) => mapWebtoon(row));
}

export async function getWebtoon(id: string): Promise<WebtoonWithSections | null> {
  const { data: webtoonRow, error: webtoonError } = await supabase
    .from("webtoons")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (webtoonError) throwDbError("getWebtoon.webtoon", webtoonError);
  if (!webtoonRow) return null;

  const { data: sectionRows, error: sectionsError } = await supabase
    .from("sections")
    .select("*")
    .eq("webtoon_id", id)
    .order("position", { ascending: true });
  if (sectionsError) throwDbError("getWebtoon.sections", sectionsError);

  const { data: imageRows, error: imagesError } = await supabase
    .from("images")
    .select("*")
    .eq("webtoon_id", id)
    .order("section_id", { ascending: true })
    .order("position", { ascending: true });
  if (imagesError) throwDbError("getWebtoon.images", imagesError);

  const imagesBySection = new Map<string, ImageRecord[]>();
  for (const imageRow of (imageRows ?? []) as ImageRow[]) {
    const key = imageRow.section_id;
    const list = imagesBySection.get(key) ?? [];
    list.push(mapImage(imageRow));
    imagesBySection.set(key, list);
  }

  const sections: SectionWithImages[] = (sectionRows ?? []).map((sectionRow: SectionRow) => {
    const section = mapSection(sectionRow);
    return { ...section, images: imagesBySection.get(section.id) ?? [] };
  });

  return { ...mapWebtoon(webtoonRow as WebtoonRow), sections };
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

export interface CreateSectionData {
  webtoonId: string;
  type: SectionType;
  config: SectionConfig;
  position?: number;
  audioPath?: string;
}

export type UpdateSectionData = Partial<{
  type: SectionType;
  config: SectionConfig;
  position: number;
  audioPath: string;
}>;

export async function createSection(data: CreateSectionData): Promise<Section> {
  const { data: row, error } = await supabase
    .from("sections")
    .insert({
      webtoon_id: data.webtoonId,
      type: data.type,
      config: data.config,
      position: data.position ?? 0,
      audio_path: data.audioPath ?? null,
    })
    .select()
    .single();
  if (error) throwDbError("createSection", error);
  return mapSection(row as SectionRow);
}

export async function updateSection(
  id: string,
  data: UpdateSectionData,
): Promise<Section | null> {
  const patch: Database["public"]["Tables"]["sections"]["Update"] = {};
  if (data.type !== undefined) patch.type = data.type;
  if (data.config !== undefined) patch.config = data.config;
  if (data.position !== undefined) patch.position = data.position;
  if (data.audioPath !== undefined) patch.audio_path = data.audioPath;

  const { data: row, error } = await supabase
    .from("sections")
    .update(patch)
    .eq("id", id)
    .select()
    .maybeSingle();
  if (error) throwDbError("updateSection", error);
  return row ? mapSection(row as SectionRow) : null;
}

export async function deleteSection(id: string): Promise<boolean> {
  const { error } = await supabase.from("sections").delete().eq("id", id);
  if (error) throwDbError("deleteSection", error);
  return true;
}

/** Réordonne les sections par update ciblé de position (pas de réécriture complète). */
export async function reorderSections(
  webtoonId: string,
  orderedIds: string[],
): Promise<void> {
  for (const [index, sectionId] of orderedIds.entries()) {
    const { error } = await supabase
      .from("sections")
      .update({ position: index + 1 })
      .eq("id", sectionId)
      .eq("webtoon_id", webtoonId);
    if (error) throwDbError(`reorderSections[${index}]`, error);
  }
}

// ---------------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------------

export interface CreateImageData {
  sectionId: string;
  webtoonId: string;
  storagePath: string;
  width: number;
  height: number;
  mimeType: string;
  position?: number;
}

export async function createImage(data: CreateImageData): Promise<ImageRecord> {
  const { data: row, error } = await supabase
    .from("images")
    .insert({
      section_id: data.sectionId,
      webtoon_id: data.webtoonId,
      storage_path: data.storagePath,
      width: data.width,
      height: data.height,
      mime_type: data.mimeType,
      position: data.position ?? 0,
    })
    .select()
    .single();
  if (error) throwDbError("createImage", error);
  return mapImage(row as ImageRow);
}

export async function deleteImagesForSection(sectionId: string): Promise<boolean> {
  const { error } = await supabase.from("images").delete().eq("section_id", sectionId);
  if (error) throwDbError("deleteImagesForSection", error);
  return true;
}
