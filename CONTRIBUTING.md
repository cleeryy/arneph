# Contribuer à Arneph

## Avant de modifier

Lire [AGENTS.md](./AGENTS.md), vérifier l'état du dépôt avec `git status
--short`, puis identifier les tests existants pour la zone modifiée.

Les changements doivent rester ciblés. Ne pas reformater tout le dépôt pour une
correction locale et ne pas supprimer des modifications déjà présentes.

## Développement

```bash
npm install
cp .env.example .env.local
npm run dev
```

Pour le backend local, démarrer Supabase avec `supabase start` et utiliser les
valeurs retournées par `supabase status`.

## Qualité obligatoire

Avant de livrer une modification :

```bash
npm test
npm run lint
npm run build
```

Les warnings ESLint existants sont acceptables s'il n'y a aucune nouvelle
erreur. Toute nouvelle fonctionnalité doit ajouter un test adapté. Les flux
qui touchent le navigateur, les uploads ou le routing doivent aussi être
testés avec Playwright lorsque c'est pertinent.

## Uploads et sections

Les images sont redimensionnées côté navigateur puis encodées en WebP avant
upload. Les dimensions sauvegardées doivent être celles de l'image produite,
pas la taille du Blob. Les chemins sont stockés dans Supabase Storage et les
URLs doivent passer par `src/lib/supabase/public-url.ts`.

Lors de la sauvegarde, ne pas supposer que l'UUID client d'une nouvelle section
est l'UUID de la ligne créée en base. Réutiliser la valeur retournée par
`createSection()` avant d'insérer les images ou de réordonner les sections.

## Migrations

Ajouter une migration SQL datée dans `supabase/migrations/`. Documenter les
contraintes importantes et vérifier les effets sur les politiques RLS et les
relations Storage. Ne pas modifier silencieusement une migration déjà
appliquée.

## Revue avant déploiement

Vérifier les variables sans afficher les secrets :

```bash
docker compose config >/tmp/arneph-compose-config.yml
docker compose up -d --build
docker compose ps
docker compose logs --tail=100 app
```

Tester ensuite :

- `https://arneph.cleeryy.cloud/`
- `https://arneph.cleeryy.cloud/read`
- `https://arneph.cleeryy.cloud/editor`
- l'ouverture d'un webtoon existant dans l'éditeur ;
- le chargement d'au moins une image réelle dans le lecteur ;
- l'upload, la sauvegarde et la relecture d'une image de test.

Le tunnel Cloudflared n'est pas lancé par Compose. Next écoute explicitement
sur `0.0.0.0:3000` pour permettre à Cloudflared installé sur une autre machine
du réseau de joindre le service via l'adresse LAN de l'hôte Docker, par exemple
`http://192.168.1.20:3000`.
