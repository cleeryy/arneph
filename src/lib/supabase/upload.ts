/**
 * Upload d'un asset de section vers le bucket Storage public
 * `webtoon-images`.
 *
 * Unique chemin d'upload du panneau de configuration : le client Supabase
 * (clé anon) est créé ici, jamais dupliqué dans un composant. Le chemin
 * retourné est celui du Storage (relatif), jamais une URL complète.
 */
import { STORAGE_ROOT_PREFIX, isSafeStoragePath } from "@/lib/storage/paths";

const STORAGE_BUCKET = "webtoon-images";

async function getStorageClient() {
  const { createClient } = await import("@supabase/supabase-js");
  // Accès statique obligatoire : Next n'inline au build que les expressions
  // `process.env.NEXT_PUBLIC_*` écrites littéralement.
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !supabaseAnonKey)
    throw new Error(
      "Supabase URL ou clé publique non configurée (NEXT_PUBLIC_SUPABASE_ANON_KEY ou NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)",
    );

  return createClient(supabaseUrl, supabaseAnonKey);
}

export async function uploadSectionAsset(
  path: string,
  blob: Blob,
  contentType: string,
): Promise<string> {
  if (!isSafeStoragePath(path) || !path.startsWith(STORAGE_ROOT_PREFIX)) {
    throw new Error("Chemin Storage invalide.");
  }

  const supabase = await getStorageClient();
  const { data, error } = await supabase
    .storage
    .from(STORAGE_BUCKET)
    .upload(path, blob, { contentType, upsert: false });

  if (error) throw error;

  return data.path;
}

/**
 * Suppression best-effort d'assets déjà uploadés, utilisée quand une opération
 * multi-fichiers échoue en cours de route (sprite sans frames, frames
 * partielles). Les erreurs sont à la charge de l'appelant : un orphelin
 * Storage reste préférable à un échec masqué.
 */
export async function removeSectionAssets(
  paths: readonly string[],
): Promise<void> {
  if (paths.length === 0) return;

  const supabase = await getStorageClient();
  const { error } = await supabase
    .storage
    .from(STORAGE_BUCKET)
    .remove([...paths]);

  if (error) throw error;
}
