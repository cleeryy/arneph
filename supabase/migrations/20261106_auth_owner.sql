-- ============================================================
-- Phase 2A — Supabase Auth (magic link) + propriété des webtoons
--
-- Objectif : permettre au rôle `authenticated` (JWT Supabase) de lire et
-- d'écrire ses propres webtoons via PostgREST, sans ouvrir les données aux
-- visiteurs anonymes.
--
-- Le rôle `service_role` continue de contourner la RLS : les Server Actions
-- vérifient l'identité avec `requireUser()` et filtrent explicitement par
-- `owner_id` dans `src/lib/db/queries.ts`.
--
-- Lignes legacy : `owner_id is null` reste lisible et éditable par tout
-- utilisateur authentifié (backfill impossible sans propriétaire connu). Ce
-- compromis est documenté dans le README ; une action de « claim » pourra
-- attribuer ces lignes plus tard.
-- ============================================================

-- ---------- Colonne propriétaire ----------
alter table public.webtoons
  add column if not exists owner_id uuid references auth.users (id) on delete cascade;

create index if not exists webtoons_owner_idx
  on public.webtoons (owner_id);

-- ---------- GRANTs PostgREST ----------
-- Sans GRANT, les policies ne sont jamais évaluées : PostgREST renvoie 401/403
-- avant d'atteindre la RLS.
grant select on table public.webtoons to anon;
grant select on table public.sections to anon;
grant select on table public.images to anon;

grant select, insert, update, delete on table public.webtoons to authenticated;
grant select, insert, update, delete on table public.sections to authenticated;
grant select, insert, update, delete on table public.images to authenticated;

-- ---------- Policies webtoons ----------
-- anon ne voit QUE le publié : un brouillon legacy (`owner_id is null`) ne doit
-- jamais devenir public via PostgREST.
drop policy if exists webtoons_select_visible on public.webtoons;
drop policy if exists webtoons_select_published on public.webtoons;
drop policy if exists webtoons_select_owner on public.webtoons;

create policy webtoons_select_published
  on public.webtoons
  for select
  to anon
  using (visibility = 'published');

create policy webtoons_select_owner
  on public.webtoons
  for select
  to authenticated
  using (
    visibility = 'published'
    or owner_id = (select auth.uid())
    or owner_id is null
  );

drop policy if exists webtoons_insert_owner on public.webtoons;
create policy webtoons_insert_owner
  on public.webtoons
  for insert
  to authenticated
  with check (owner_id = (select auth.uid()));

-- `with check` empêche de réattribuer une ligne à un autre utilisateur.
drop policy if exists webtoons_update_owner on public.webtoons;
create policy webtoons_update_owner
  on public.webtoons
  for update
  to authenticated
  using (
    owner_id = (select auth.uid())
    or owner_id is null
  )
  with check (
    owner_id = (select auth.uid())
    or owner_id is null
  );

drop policy if exists webtoons_delete_owner on public.webtoons;
create policy webtoons_delete_owner
  on public.webtoons
  for delete
  to authenticated
  using (
    owner_id = (select auth.uid())
    or owner_id is null
  );

-- ---------- Policies sections ----------
drop policy if exists sections_select_visible on public.sections;
drop policy if exists sections_select_published on public.sections;
drop policy if exists sections_select_owner on public.sections;

create policy sections_select_published
  on public.sections
  for select
  to anon
  using (
    exists (
      select 1
      from public.webtoons w
      where w.id = sections.webtoon_id
        and w.visibility = 'published'
    )
  );

create policy sections_select_owner
  on public.sections
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.webtoons w
      where w.id = sections.webtoon_id
        and (
          w.visibility = 'published'
          or w.owner_id = (select auth.uid())
          or w.owner_id is null
        )
    )
  );

drop policy if exists sections_insert_owner on public.sections;
create policy sections_insert_owner
  on public.sections
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.webtoons w
      where w.id = sections.webtoon_id
        and (w.owner_id = (select auth.uid()) or w.owner_id is null)
    )
  );

drop policy if exists sections_update_owner on public.sections;
create policy sections_update_owner
  on public.sections
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.webtoons w
      where w.id = sections.webtoon_id
        and (w.owner_id = (select auth.uid()) or w.owner_id is null)
    )
  )
  with check (
    exists (
      select 1
      from public.webtoons w
      where w.id = sections.webtoon_id
        and (w.owner_id = (select auth.uid()) or w.owner_id is null)
    )
  );

drop policy if exists sections_delete_owner on public.sections;
create policy sections_delete_owner
  on public.sections
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.webtoons w
      where w.id = sections.webtoon_id
        and (w.owner_id = (select auth.uid()) or w.owner_id is null)
    )
  );

-- ---------- Policies images ----------
drop policy if exists images_select_visible on public.images;
drop policy if exists images_select_published on public.images;
drop policy if exists images_select_owner on public.images;

create policy images_select_published
  on public.images
  for select
  to anon
  using (
    exists (
      select 1
      from public.webtoons w
      where w.id = images.webtoon_id
        and w.visibility = 'published'
    )
  );

create policy images_select_owner
  on public.images
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.webtoons w
      where w.id = images.webtoon_id
        and (
          w.visibility = 'published'
          or w.owner_id = (select auth.uid())
          or w.owner_id is null
        )
    )
  );

drop policy if exists images_insert_owner on public.images;
create policy images_insert_owner
  on public.images
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.webtoons w
      where w.id = images.webtoon_id
        and (w.owner_id = (select auth.uid()) or w.owner_id is null)
    )
  );

drop policy if exists images_update_owner on public.images;
create policy images_update_owner
  on public.images
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.webtoons w
      where w.id = images.webtoon_id
        and (w.owner_id = (select auth.uid()) or w.owner_id is null)
    )
  )
  with check (
    exists (
      select 1
      from public.webtoons w
      where w.id = images.webtoon_id
        and (w.owner_id = (select auth.uid()) or w.owner_id is null)
    )
  );

drop policy if exists images_delete_owner on public.images;
create policy images_delete_owner
  on public.images
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.webtoons w
      where w.id = images.webtoon_id
        and (w.owner_id = (select auth.uid()) or w.owner_id is null)
    )
  );
