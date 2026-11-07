-- ============================================================
-- Phase 2B — Profils utilisateurs (inscription email / mot de passe)
--
-- Objectif : stocker un profil applicatif (email + nom affiché) pour chaque
-- utilisateur Supabase Auth, et le maintenir automatiquement à chaque
-- création de compte.
--
-- Le trigger `handle_new_user` s'exécute en `security definer` : il tourne
-- dans le contexte de `supabase_auth_admin`, qui n'a pas de policy sur
-- `public.profiles`. Sans `security definer`, l'insert échouerait sous RLS.
-- `search_path = ''` impose des noms pleinement qualifiés et empêche le
-- détournement de résolution de schéma.
--
-- Idempotent : rejouable sans erreur sur une base déjà migrée.
-- ============================================================

-- ---------- Table profils ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- Backfill des comptes existants ----------
-- `on conflict do nothing` : ne réécrit jamais un profil déjà personnalisé.
insert into public.profiles (id, email, display_name)
select
  u.id,
  coalesce(u.email, ''),
  nullif(u.raw_user_meta_data ->> 'display_name', '')
from auth.users u
on conflict (id) do nothing;

-- ---------- Création automatique du profil ----------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    coalesce(new.email, ''),
    nullif(new.raw_user_meta_data ->> 'display_name', '')
  )
  on conflict (id) do update
    set email = excluded.email,
        -- Un nom déjà choisi côté profil n'est jamais écrasé par un
        -- `display_name` absent des métadonnées Auth.
        display_name = coalesce(public.profiles.display_name, excluded.display_name),
        updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Trigger updated_at ----------
drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------- RLS ----------
alter table public.profiles enable row level security;

-- Chaque utilisateur ne lit que son propre profil.
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own
  on public.profiles
  for select
  to authenticated
  using ((select auth.uid()) = id);

-- `with check` identique à `using` : impossible de réattribuer la ligne.
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own
  on public.profiles
  for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- ---------- GRANTs PostgREST ----------
-- Sans GRANT, PostgREST renvoie 401/403 avant même d'évaluer la RLS.
revoke all on table public.profiles from anon;
grant select, update on table public.profiles to authenticated;
grant all on table public.profiles to service_role;
