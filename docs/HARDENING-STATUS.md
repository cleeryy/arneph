# Arneph — statut de remédiation

- **Branche** : `audit-hardening`
- **Base audit** : commit `b11f916` + rapport `docs/AUDIT-2026-11-06.md`
- **Dernier commit de code** : `e60bd2a` (+ polish en cours)
- **Validation** : `npm test` 624 tests / 42 fichiers, `npm run lint` 0 erreur,
  `npm run typecheck` OK, `npm run build` OK, image Docker standalone testée
  (non-root, healthcheck, headers).

## Commits

| Commit | Contenu |
|---|---|
| `300cfdd` | P0/P1 : sections supprimées, Storage, save éditeur, lecteur, images, CI |
| `e0ed3af` | Supabase Auth magic link, `proxy.ts`, `owner_id`, RLS/GRANTs |
| `d307d4f` | RPC `save_webtoon` atomique + verrou `revision` |
| `3c51a3b` | Tuilage long-y + validation des chemins Storage |
| `e60bd2a` | Couvertures responsive, purge deps mortes, Docker standalone, headers, 404/error |

## Corrigé

### P0
- **Sections supprimées** : suppression batch dans la transaction `save_webtoon`
  (plus de résurrection avec médias cassés).
- **Autorisation** : Supabase Auth magic link (`/login`, `/auth/confirm`),
  `proxy.ts` Next 16, `requireUser()` dans les 7 actions, pages éditeur gardées.
- **Chemins Storage** : validation centralisée (`webtoons/`, préfixes de section
  et de cover, rejet `..`), appliquée à l'upload, aux URLs et aux suppressions.
- **Policies Storage** : migration `20260806_harden_storage_policies.sql`
  (plus de DELETE/UPDATE anon, bucket provisionné, MIME/taille bornés).
- **RLS** : migration `20261106_auth_owner.sql` (`owner_id`, GRANTs, policies
  anon publié / authenticated owner, legacy null).

### P1
- Sauvegarde atomique + verrou optimiste (`revision`), UUID client conservés,
  conflit détecté et bouton « Recharger ».
- `syncImages` non destructif (upsert puis suppression des absents).
- `deleteWebtoonAction` : DB d'abord, Storage ensuite.
- GC Storage : frames, tuiles, covers, chemins remplacés, lots de 1000.
- Erreurs DB génériques côté client, gardes UUID.
- Éditeur : save qui n'écrase plus les éditions concurrentes, double-clic
  verrouillé, garde de navigation, panneau dérivé de l'état vivant.
- Lecteur : `deltaMode`, cooldown d'inertie, tactile un geste = une étape,
  zoom navigateur, long-y 404 non bloquant, audio après unlock + mute,
  modale réglages étanche, header `inert`, sprite responsive.
- Images : budget canvas (40 Mpx / 16384 px), downscale 1600/800, sprite sheets
  bornées (120 frames, décodage 4 en vol, bitmaps fermés), GIF en URL objet,
  previews éditeur lazy.
- Infra : `.dockerignore` `.env*`, CI GitHub, `typecheck`, chargeur d'env E2E,
  image Docker standalone non-root + healthcheck, headers de sécurité.

### P2
- Couvertures servies par imgproxy + `srcset` (plus d'`unoptimized`).
- `motion` supprimé (hook `prefers-reduced-motion` local), deps/composants morts
  purgés, `shadcn` en devDependencies.
- i18n : libellés bibliothèque, description metadata, 404/erreur éditeur.
- Seed : `tsx`/`ws` déclarés, `.env.local` chargé.
- Long-y : `tiles`/`tileHeight`, upload/segmentation, rendu tuilé, préchargement
  des 2 premières tuiles.
- Preview long-y non interactive + `metadataDirty` (polish).

## Reste à faire (non bloquant)

- Découpage des gros fichiers : `SectionConfigPanel` (~1000 l.), `actions.ts`,
  `EditorDetailShell`, `WebtoonMetadataForm` (plan détaillé dans l'audit §6).
- Contexte éditeur séparé sélection/historique pour réduire les re-renders.
- Double header éditeur liste/détail (route groups).
- i18n EN réellement atteignable (sélecteur/cookie) ; messages d'erreur image
  mappés sur des clés i18n.
- `getWebtoon` caché/dédoublonné (layout + page) et colonnes explicites.
- Mock Supabase `.single()` fidèle (`[]` vs objet + PGRST116).
- `/api/health`, logs structurés, alerte 4xx assets.
- Backfill des assets existants (covers, long-y), claim des lignes legacy
  `owner_id is null`, uploads Storage owner-scoped.
- E2E Playwright complets avec Supabase local + SMTP.

## Étapes manuelles de déploiement

1. **Backup** DB + Storage, restore testé, avant toute migration.
2. Appliquer les migrations dans l'ordre :
   `20260806_harden_storage_policies.sql`, `20261106_auth_owner.sql`,
   `20261107_save_webtoon_rpc.sql`.
3. Vérifier les policies : anon ne peut pas DELETE/UPDATE Storage ; un brouillon
   legacy n'est pas lisible par anon ; un utilisateur ne voit que ses webtoons.
4. Supabase Auth : Site URL + Redirect URLs (`https://arneph.cleeryy.cloud`,
   `http://localhost:3000`), SMTP réel, template Magic Link
   `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email`.
5. Définir `NEXT_PUBLIC_SITE_URL=https://arneph.cleeryy.cloud` au build et au
   runtime.
6. Faire tourner les clés anon/service role si une image Docker a été construite
   avec `.env.dokploy`/`.env.dockertest` (build context).
7. Déployer l'image standalone, vérifier `/`, `/login`, `/auth/confirm`,
   `/editor`, `/read`, une image Supabase (200) et les headers.
8. Tester le magic link de bout en bout avec un compte réel.
