-- ============================================================
-- Durcissement Storage (audit P0-3 / DATA-INF-10)
--
-- 1. Provisionne le bucket `webtoon-images` par migration (jusqu'ici créé
--    à la main) avec une limite de taille et une liste MIME fermée.
-- 2. Retire les policies UPDATE/DELETE anon : un visiteur ne doit jamais
--    pouvoir écraser ou supprimer les médias du bucket.
-- 3. Recrée uniquement INSERT/SELECT pour `anon`, explicitement scopées
--    au bucket (l'upload navigateur non authentifié reste assumé).
--
-- Le rôle service_role contourne la RLS et n'a besoin d'aucune policy.
-- Les policies existantes sont supprimées par nom avant recréation pour
-- rendre la migration idempotente.
-- ============================================================

-- ---------- Bucket ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'webtoon-images',
  'webtoon-images',
  true,
  52428800, -- 50 MiB
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/avif',
    'audio/mpeg',
    'audio/mp3',
    'audio/wav',
    'audio/x-wav',
    'audio/ogg',
    'audio/webm'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ---------- Policies : retirer toute écriture anon ----------
drop policy if exists "Allow anon update" on storage.objects;
drop policy if exists "Allow anon delete" on storage.objects;

-- Recréation explicite `TO anon` : l'ancienne migration créait ces policies
-- sans clause `TO`, donc pour PUBLIC.
drop policy if exists "Allow anon upload" on storage.objects;
drop policy if exists "Allow anon select" on storage.objects;

create policy "Allow anon upload"
  on storage.objects for insert
  to anon
  with check (bucket_id = 'webtoon-images');

create policy "Allow anon select"
  on storage.objects for select
  to anon
  using (bucket_id = 'webtoon-images');
