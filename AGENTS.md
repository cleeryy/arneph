# Arneph Agent Guide

Ce fichier est la source de vérité pour les agents IA qui modifient Arneph.
Le projet est une application Next.js 16 de lecture et d'édition de webtoons.

## Règles obligatoires Next.js

<!-- BEGIN:nextjs-agent-rules -->
Cette version de Next.js n'est pas la version habituelle. Avant toute écriture
de code, lire les guides pertinents dans `node_modules/next/dist/docs/`.
Vérifier les changements d'API et les avertissements de dépréciation pour la
version installée dans `package.json`.
<!-- END:nextjs-agent-rules -->

En particulier, vérifier les conventions concernant `params` Promise, les
Server Actions, le self-hosting et le déploiement avant de modifier une route.

## Architecture

- `src/app/` : routes App Router, pages serveur et Server Actions.
- `src/components/reader/` : rendu public des sections `image`, `long-y`,
  `pan-x` et `animation`.
- `src/components/editor/` : éditeur client, upload et prévisualisation.
- `src/lib/db/` : accès Supabase côté serveur et mapping snake_case/camelCase.
- `src/lib/supabase/` : utilitaires partagés pour les URLs Storage publiques.
- `src/lib/image/` : traitement navigateur, redimensionnement WebP et sprites.
- `src/types/webtoon.ts` et `src/lib/schemas.ts` : contrat métier des sections.
- `supabase/migrations/` : migrations SQL versionnées.
- `tests/e2e/` : tests Playwright contre une application lancée.

## Règles de données et images

- Le bucket Storage public est `webtoon-images`.
- Un chemin Storage est un chemin relatif, jamais une URL complète en base.
- Utiliser `getSupabasePublicObjectUrl()` pour construire une URL Storage.
  Ne pas recréer de concaténation locale dans un composant.
- Les assets Supabase sont rendus avec `unoptimized` sur les composants
  `next/image` concernés. Ne pas retirer cette option sans avoir vérifié
  l'optimiseur Next 16 sur le domaine Supabase de production.
- Après traitement, une image doit avoir des dimensions strictement positives.
  Ne jamais utiliser `Blob.size` comme largeur ou hauteur.
- Une nouvelle section peut avoir un UUID client temporaire avant sauvegarde.
  Le serveur doit utiliser l'UUID retourné par `createSection()` pour les
  relations `images.section_id` et pour le réordonnancement.
- Les chemins uploadés doivent rester récupérables lors de la suppression,
  même si le dossier utilise un UUID client temporaire.
- Les configs de sections doivent rester cohérentes avec leur type et passer
  `sectionConfigSchema` avant sauvegarde.

## Environnement

Variables nécessaires :

- `NEXT_PUBLIC_SUPABASE_URL` : URL Supabase publique.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` : clé client pour les uploads Storage.
- `SUPABASE_SERVICE_ROLE_KEY` : clé serveur uniquement, jamais exposée au
  navigateur ni ajoutée dans un fichier suivi par Git.

Développement local : copier `.env.example` vers `.env.local` et utiliser les
valeurs de `supabase status`. Production : le fichier `.env` local est lu par
Docker Compose et ne doit pas être commité.

Les variables `NEXT_PUBLIC_*` sont nécessaires à deux moments :

1. au build Docker, car Next les injecte dans le bundle client et la config
   d'images ;
2. au runtime, pour les Server Components et les actions serveur.

Ne pas lancer un build de production sans vérifier `docker compose config`.

## Workflow de modification

1. Lire les fichiers concernés et les guides Next.js pertinents.
2. Vérifier `git status --short` et préserver les changements existants.
3. Modifier avec `apply_patch`, sans réécrire ou supprimer des changements
   qui ne concernent pas la tâche.
4. Ajouter ou mettre à jour les tests du comportement modifié.
5. Exécuter `npm test`, `npm run lint` et `npm run build`.
6. Pour un changement de production, exécuter `docker compose up -d --build`,
   puis vérifier `docker compose ps` et `docker compose logs --tail=100 app`.
7. Tester au minimum `/`, `/read`, `/editor` et une route avec identifiant.
8. Pour les images, vérifier une requête source Supabase et le rendu navigateur,
   pas uniquement le code HTML serveur.

## Commandes utiles

```bash
npm install
npm run dev
npm test
npm run lint
npm run build
docker compose config
docker compose up -d --build
docker compose ps
docker compose logs --tail=100 app
curl -I http://127.0.0.1:3000/
```

## Production et Cloudflared

Docker Compose lance uniquement Next.js sur `0.0.0.0:3000`. Le tunnel
Cloudflared est géré en dehors de ce dépôt. S'il tourne sur une autre machine
du réseau, il doit pointer vers l'adresse LAN de l'hôte Docker, par exemple
`http://192.168.1.20:3000`, et non vers `127.0.0.1`.

Domaine applicatif : `https://arneph.cleeryy.cloud`.

Domaine Supabase/Storage : `https://supabase-arneph.cleeryy.cloud`.

Après chaque déploiement, vérifier les deux domaines, puis ouvrir un webtoon
réel dans l'éditeur et le lecteur. Les logs d'absence d'image ne sont pas
toujours remontés par Next : utiliser Playwright ou les outils réseau du
navigateur pour repérer les réponses `4xx` des assets.

## Sécurité

- Ne jamais afficher ou commiter `SUPABASE_SERVICE_ROLE_KEY`.
- Ne pas ajouter de `network_mode: host` sans justification explicite.
- Ne pas désactiver les protections SSRF de Next en production.
- Les Server Actions doivent valider leurs entrées avec Zod.
- Toute migration SQL doit être ajoutée dans `supabase/migrations/` et rester
  compatible avec les données existantes.
