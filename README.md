# arneph

Webtoon reader & editor — panelled vertical-scroll comics built for the web.

## Stack

- **Next.js 16** (App Router, Turbopack) + React 19
- **shadcn/ui** (Base UI preset `base-nova`) + **BeUI** motion components
- **motion** (scroll-driven animations)
- **Supabase** (Postgres + storage)
- **Vitest** (unit tests, no Docker/Supabase dependency)

## Getting started

```bash
npm install
npm run dev        # http://localhost:3000
```

## Tests

```bash
npm test           # vitest run (headless)
npm run test:watch # vitest watch
```

## Supabase (local)

```bash
supabase start     # local stack (Postgres, Studio, Auth, Storage)
```

Supabase CLI config lives in `supabase/`. Local generated files in `supabase/.temp/` are git-ignored.

## Testing the demo

After `npm install && supabase start && npm run dev`, open http://localhost:3000:

- **`/`** — home page with links to the editor and reader
- **`/read`** — list of published webtoons
- **`/read/[id]`** — scroll-driven reader (4 section types + per-section audio)
- **`/editor`** — create or open a webtoon
- **`/editor/[id]`** — WYSIWYG editor (reorder, configure, upload, save, publish)

A seeded demo webtoon **« Démo »** (id `98ed65b1-833f-4dac-ae8f-77d5789d986f`) ships with the 4 section types: image, long-y (vertical strip), pan-x (horizontal pan), and animation (frame-by-frame sprite).

## Environment variables

`.env.local` (git-ignored) must define:

| Variable | Description |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase URL (`http://127.0.0.1:54321` for local, `https://<project-ref>.supabase.co` for production) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key for client-side operations (uploads, storage) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key for server-side operations (required for local dev, production) |

The `next/image` `remotePatterns` are derived from `NEXT_PUBLIC_SUPABASE_URL` at startup — never hardcoded.

## Tooling

- `npm run lint` — ESLint (flat config)
- `npm run build` — production build

## Repository layout

- `src/app/` — App Router pages (French-first, next-intl)
- `src/components/ui/` — shadcn/ui components
- `src/components/motion/` — BeUI motion components
- `src/lib/` — shared utilities (easing, etc.)
- `supabase/` — Supabase project config + migrations
