# Changelog

## Unreleased

- Centralisation et encodage des URLs publiques Supabase Storage.
- Correction du build Docker : les variables publiques Supabase sont fournies
  au build et au runtime.
- Correction du crash de l'éditeur lorsque le bundle client ne contenait pas
  `NEXT_PUBLIC_SUPABASE_URL`.
- Correction du rendu des assets Supabase en contournant l'optimiseur Next
  pour les images Storage dynamiques.
- Correction des dimensions d'image sauvegardées après traitement WebP.
- Correction de la sauvegarde des nouvelles sections et de leurs relations
  avec les images après génération d'un UUID côté serveur.
- Nettoyage des fichiers Storage associés lors de suppressions de sections et
  de webtoons.
- Dockerfile multi-stage avec dépendances de production uniquement dans le
  conteneur final.
- Ajout de règles de travail pour les agents IA dans `AGENTS.md` et du workflow
  de contribution dans `CONTRIBUTING.md`.
