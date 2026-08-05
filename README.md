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

Les règles détaillées pour les agents et contributeurs sont dans
[`AGENTS.md`](./AGENTS.md) et [`CONTRIBUTING.md`](./CONTRIBUTING.md).

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

Les URLs Storage sont construites par `src/lib/supabase/public-url.ts`. Les
images Supabase dynamiques sont servies directement (`unoptimized`) après
vérification de l'URL source, car l'optimiseur Next 16 peut refuser le domaine
Cloudflare Storage avec une réponse `400`.

## Production Docker

Le service applicatif est lancé par Docker Compose sur `0.0.0.0:3000` :

```bash
docker compose config
docker compose up -d --build
docker compose ps
docker compose logs --tail=100 app
```

Compose lit `.env` pour le runtime et transmet les variables `NEXT_PUBLIC_*`
au build Next. Cloudflared est externe à ce dépôt et doit publier
`http://<adresse-LAN-de-l-hote-Docker>:3000` vers le domaine applicatif.

## Tooling

- `npm run lint` — ESLint (flat config)
- `npm run build` — production build

## Repository layout

- `src/app/` — App Router pages (French-first, next-intl)
- `src/components/ui/` — shadcn/ui components
- `src/components/motion/` — BeUI motion components
- `src/lib/` — shared utilities (easing, etc.)
- `supabase/` — Supabase project config + migrations
