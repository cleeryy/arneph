# Security policy

## Signaler une vulnérabilité

Ne pas ouvrir d'issue publique. Contacter le mainteneur en privé
(`clery.arqueferradou@gmail.com`) avec :

- la description de la faille et son impact ;
- les étapes de reproduction ;
- la version ou le commit concerné.

Un accusé de réception est attendu sous 72 h. Une fois le correctif déployé, la
divulgation peut être discutée.

## Portée

Ce dépôt contient l'application Arneph (lecteur/éditeur de webtoons) et ses
migrations Supabase. Les secrets de déploiement (`SUPABASE_SERVICE_ROLE_KEY`,
clés JWT, tokens Caddy/Cloudflare) ne doivent jamais être commités ni partagés.

## Bonnes pratiques attendues

- Secrets uniquement via les variables d'environnement ou le gestionnaire de
  secrets, jamais dans le code ou un fichier suivi.
- Les Server Actions valident leurs entrées avec Zod.
- Les images et objets Storage sont servis via `getSupabasePublicObjectUrl()`.
- Toute dépendance ajoutée est justifiée dans la PR.
