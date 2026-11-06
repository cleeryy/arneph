-- ============================================================
-- Phase 2B — Sauvegarde transactionnelle + verrou optimiste
--
-- Remplace la boucle N écritures PostgREST de `saveWebtoon` par une seule
-- fonction PL/pgSQL atomique :
--   * les UUID générés côté client (`crypto.randomUUID()`) deviennent les clés
--     serveur, donc un retry du même payload est idempotent ;
--   * les sections/images absents du payload sont supprimés dans la même
--     transaction que les upserts ;
--   * `webtoons.revision` sert de verrou optimiste : le client envoie la
--     révision lue au chargement (`p_expected_revision`) et la sauvegarde est
--     refusée (SQLSTATE 40001) si une autre session l'a incrémentée.
--
-- La fonction est SECURITY INVOKER (défaut) : la RLS et les GRANT du rôle
-- appelant restent appliqués. Les Server Actions utilisent le service_role.
-- ============================================================

-- ---------- Verrou optimiste ----------
alter table public.webtoons
  add column if not exists revision bigint not null default 0;

-- ---------- Fonction de sauvegarde atomique ----------
create or replace function public.save_webtoon(
  p_webtoon_id uuid,
  p_owner_id uuid,
  p_expected_revision bigint,
  p_sections jsonb
)
returns jsonb
language plpgsql
as $$
declare
  v_revision bigint;
begin
  if p_sections is null or jsonb_typeof(p_sections) <> 'array' then
    raise exception 'INVALID_SECTIONS' using errcode = '22023';
  end if;

  -- 1. Verrou pessimiste de la ligne webtoon + contrôle de propriété.
  -- `owner_id is null` couvre les webtoons legacy (migration Phase 2A).
  select w.revision
    into v_revision
  from public.webtoons w
  where w.id = p_webtoon_id
    and (w.owner_id is null or w.owner_id = p_owner_id)
  for update;

  if not found then
    raise exception 'WEBTOON_NOT_FOUND' using errcode = 'P0002';
  end if;

  -- 2. Verrou optimiste : refuser d'écraser une version plus récente.
  if p_expected_revision is not null and v_revision <> p_expected_revision then
    raise exception 'REVISION_CONFLICT' using errcode = '40001';
  end if;

  -- 3. Supprimer les sections absentes du payload (images en cascade).
  delete from public.sections s
  where s.webtoon_id = p_webtoon_id
    and not exists (
      select 1
      from jsonb_array_elements(p_sections) as entry
      where (entry ->> 'id')::uuid = s.id
    );

  -- 4. Un id de section existant ne peut pas être volé à un autre webtoon.
  if exists (
    select 1
    from jsonb_array_elements(p_sections) as entry
    join public.sections s on s.id = (entry ->> 'id')::uuid
    where s.webtoon_id <> p_webtoon_id
  ) then
    raise exception 'SECTION_NOT_OWNED' using errcode = '42501';
  end if;

  -- 5. Upsert des sections : l'UUID client est conservé, la position devient
  -- l'ordinalité du tableau (1-based) et le webtoon_id est forcé.
  insert into public.sections (
    id,
    webtoon_id,
    position,
    type,
    config,
    audio_path,
    updated_at
  )
  select
    (entry ->> 'id')::uuid,
    p_webtoon_id,
    ord::int,
    entry ->> 'type',
    coalesce(entry -> 'config', '{}'::jsonb),
    nullif(entry ->> 'audioPath', ''),
    now()
  from jsonb_array_elements(p_sections) with ordinality as t(entry, ord)
  on conflict (id) do update
    set position = excluded.position,
        type = excluded.type,
        config = excluded.config,
        audio_path = excluded.audio_path,
        updated_at = now();

  -- 6. Supprimer les images absentes du payload (toutes sections confondues).
  delete from public.images i
  where i.webtoon_id = p_webtoon_id
    and not exists (
      select 1
      from jsonb_array_elements(p_sections) as sec
      cross join lateral jsonb_array_elements(
        coalesce(sec -> 'images', '[]'::jsonb)
      ) as img
      where (img ->> 'id')::uuid = i.id
    );

  -- 7. Un id d'image existant ne peut pas être déplacé vers une autre section.
  if exists (
    select 1
    from jsonb_array_elements(p_sections) as sec
    cross join lateral jsonb_array_elements(
      coalesce(sec -> 'images', '[]'::jsonb)
    ) as img
    join public.images i on i.id = (img ->> 'id')::uuid
    where i.section_id <> (sec ->> 'id')::uuid
  ) then
    raise exception 'IMAGE_NOT_OWNED' using errcode = '42501';
  end if;

  -- 8. Upsert des images : section_id et webtoon_id sont forcés par la
  -- fonction, jamais repris du payload client.
  insert into public.images (
    id,
    section_id,
    webtoon_id,
    storage_path,
    width,
    height,
    mime_type,
    position
  )
  select
    (img ->> 'id')::uuid,
    (sec ->> 'id')::uuid,
    p_webtoon_id,
    img ->> 'storagePath',
    (img ->> 'width')::int,
    (img ->> 'height')::int,
    img ->> 'mimeType',
    coalesce((img ->> 'position')::int, 0)
  from jsonb_array_elements(p_sections) as sec
  cross join lateral jsonb_array_elements(
    coalesce(sec -> 'images', '[]'::jsonb)
  ) as img
  on conflict (id) do update
    set section_id = excluded.section_id,
        webtoon_id = excluded.webtoon_id,
        storage_path = excluded.storage_path,
        width = excluded.width,
        height = excluded.height,
        mime_type = excluded.mime_type,
        position = excluded.position;

  -- 9. Incrément de révision après écriture réussie, dans la même transaction.
  update public.webtoons
    set revision = revision + 1,
        updated_at = now()
  where id = p_webtoon_id
  returning revision into v_revision;

  return jsonb_build_object('revision', v_revision);
end;
$$;

-- ---------- Droits d'exécution ----------
-- Retire l'EXECUTE implicite de PUBLIC puis ouvre aux rôles utiles :
-- `authenticated` pour un futur appel direct, `service_role` pour les Server
-- Actions (client `@/lib/db/server`).
revoke all on function public.save_webtoon(uuid, uuid, bigint, jsonb) from public;
grant execute on function public.save_webtoon(uuid, uuid, bigint, jsonb) to authenticated;
grant execute on function public.save_webtoon(uuid, uuid, bigint, jsonb) to service_role;
