-- ============================================================
-- T10 — Schéma initial : webtoons / sections / images
-- RLS : PAS de policies anon (service role bypass). Prêt pour auth.
-- Le rôle service_role possède des GRANT explicites (REST via PostgREST) ;
-- anon/authenticated n'ont aucun accès tant que les policies arrivent.
-- ============================================================

-- ---------- Table webtoons ----------
create table public.webtoons (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  cover_path text,
  visibility text not null default 'draft'
    check (visibility in ('draft', 'published')),
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- Table sections ----------
create table public.sections (
  id uuid primary key default gen_random_uuid(),
  webtoon_id uuid not null references public.webtoons (id) on delete cascade,
  position int not null default 0,
  type text not null
    check (type in ('image', 'long-y', 'pan-x', 'animation')),
  config jsonb not null default '{}'::jsonb,
  audio_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- Table images ----------
create table public.images (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references public.sections (id) on delete cascade,
  -- Dénormalisé (indépendant de la cascade section) pour faciliter RLS + stats par webtoon
  webtoon_id uuid not null references public.webtoons (id) on delete cascade,
  storage_path text not null,
  width int not null check (width > 0),
  height int not null check (height > 0),
  mime_type text not null,
  position int not null default 0,
  created_at timestamptz not null default now()
);

-- ---------- Index de performance ----------
create index sections_webtoon_position_idx
  on public.sections (webtoon_id, position);
create index images_section_position_idx
  on public.images (section_id, position);
create index images_webtoon_idx
  on public.images (webtoon_id);

-- ---------- Trigger updated_at ----------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger webtoons_set_updated_at
  before update on public.webtoons
  for each row execute function public.set_updated_at();

create trigger sections_set_updated_at
  before update on public.sections
  for each row execute function public.set_updated_at();

-- ---------- RLS : enable sur les 3 tables ----------
-- Aucune policy anon/authenticated : seuls service_role (BYPASSRLS)
-- et le propriétaire postgres accèdent aux données. Auth viendra plus tard.
alter table public.webtoons enable row level security;
alter table public.sections enable row level security;
alter table public.images enable row level security;

-- ---------- GRANTs explicites (REST / PostgREST) ----------
-- service_role seul : les ops serveur passent par la clé service role.
-- anon/authenticated n'obtiennent rien ici — policies à venir.
grant all on table public.webtoons to service_role;
grant all on table public.sections to service_role;
grant all on table public.images to service_role;
