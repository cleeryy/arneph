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

## Tooling

- `npm run lint` — ESLint (flat config)
- `npm run build` — production build

## Repository layout

- `src/app/` — App Router pages (French-first, next-intl)
- `src/components/ui/` — shadcn/ui components
- `src/components/motion/` — BeUI motion components
- `src/lib/` — shared utilities (easing, etc.)
- `supabase/` — Supabase project config + migrations
