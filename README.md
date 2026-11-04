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

## Conventions du dépôt

Le [`CONTRIBUTING.md`](./CONTRIBUTING.md) s'applique tel quel. Spécificités :

- **Portées de commit** : `reader`, `editor`, `db`, `supabase`, `ui`, `deploy`,
  `test`, `docs`.
- **Fusion** : rebase fast-forward sur `main` quand la branche est propre (un
  seul sujet), sinon squash. La branche est supprimée après fusion.
- **Branche par défaut** : `main`, toujours verte (tests + lint + build).
- **Vérification locale** : `npm test`, `npm run lint`, `npm run build`, puis
  `npx playwright test` pour les parcours navigateur.
- **Modèle de PR** : `.github/pull_request_template.md`.
- **Sécurité** : voir [`SECURITY.md`](./SECURITY.md).

## Fonctionnalités

**Lecteur**

- 4 types de sections : `image`, `long-y`, `pan-x` (panoramique au scroll) et
  `animation` (sprite sheet pilotée par le scroll).
- Barre de progression de lecture, reprise à la position sauvegardée
  (`localStorage`), navigation clavier (flèches, PageUp/PageDown, Home).
- Audio par section avec une seule piste à la fois, déverrouillage au premier
  geste et bouton de coupure.
- Overlays FX (GIF/WebP animés) positionnés sur les sections image et long-y.
- Mouvement réduit respecté (`prefers-reduced-motion`).

**Bibliothèque**

- Recherche accent-insensible sur le titre et la description.
- Tri par date ou par titre, état « aucun résultat » explicite.

**Éditeur**

- Création, renommage, description et image de couverture.
- Ajout, duplication, réordonnancement (drag ou boutons) et suppression de
  sections.
- Annuler/rétablir borné à 50 instantanés, raccourcis clavier.
- Configuration par type (dimensions, `panSpeed`, `scrollHeight`, FX, audio).
- Enregistrement validé (Zod côté serveur), garde avant fermeture d'onglet si
  des modifications sont en attente, publication refusée sans section.

## Tests

```bash
npm test           # vitest run (headless)
npm run test:watch # vitest watch
npx playwright test # parcours navigateur (Supabase local)
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
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key for client-side operations (uploads, storage). `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` acceptée en remplacement. |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key for server-side operations. `SUPABASE_SECRET_KEY` acceptée en remplacement. |

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
