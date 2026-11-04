/**
 * Upload d'un asset de section vers le bucket Storage public
 * `webtoon-images`.
 *
 * Unique chemin d'upload du panneau de configuration : le client Supabase
 * (clé anon) est créé ici, jamais dupliqué dans un composant. Le chemin
 * retourné est celui du Storage (relatif), jamais une URL complète.
 */
const STORAGE_BUCKET = "webtoon-images";

export async function uploadSectionAsset(
  path: string,
  blob: Blob,
  contentType: string,
): Promise<string> {
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

  const supabase = createClient(supabaseUrl, supabaseAnonKey);
  const { data, error } = await supabase
    .storage
    .from(STORAGE_BUCKET)
    .upload(path, blob, { contentType, upsert: false });

  if (error) throw error;

  return data.path;
}
