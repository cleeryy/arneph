# Contributing

Ce document décrit **la méthode de travail commune à tous les dépôts**. Il est volontairement
indépendant du langage et de l'outillage : il décrit des règles, pas des commandes propres à un
projet. Chaque dépôt peut le compléter, mais ne doit pas le contredire.

Objectif : un historique Git lisible, des revues rapides, des `main` toujours déployables.

> **Si tu ne retiens qu'une chose :** une branche = un sujet, un commit = un changement cohérent,
> une Pull Request = une intention relisible dans 6 mois.

---

## Table des matières

1. [Règles d'or](#1-règles-dor)
2. [Mise en route](#2-mise-en-route)
3. [Branches](#3-branches)
4. [Commits](#4-commits)
5. [Qualité avant de pousser](#5-qualité-avant-de-pousser)
6. [Pull Requests](#6-pull-requests)
7. [Revue de code](#7-revue-de-code)
8. [Fusion](#8-fusion)
9. [Versions et releases](#9-versions-et-releases)
10. [Hygiène du dépôt](#10-hygiène-du-dépôt)
11. [Sécurité](#11-sécurité)
12. [Issues et propositions](#12-issues-et-propositions)
13. [Checklist avant d'ouvrir une PR](#13-checklist-avant-douvrir-une-pr)
14. [Adapter ce document à un dépôt](#14-adapter-ce-document-à-un-dépôt)

---

## 1. Règles d'or

1. **`main` est toujours verte.** Elle compile, passe les tests et peut être livrée à tout moment.
2. **On ne pousse jamais directement sur `main`.** Tout passe par une branche + Pull Request.
   (Les mainteneurs peuvent déroger pour un correctif de sécurité ou de production, en le
   signalant a posteriori dans la PR.)
3. **Une branche, un sujet.** Pas de « je rajoute ça au passage » : ça devient une autre branche.
4. **Commits atomiques et relisibles.** Un commit = un changement qui a du sens seul, et qui
   pourrait être revert sans casser autre chose.
5. **Petit, c'est rapide.** Une PR de moins de ~400 lignes utiles se relit en 15 minutes ; au-delà
   de 1000 lignes, elle sera mal relue. Découpe.
6. **Le comportement se documente.** Toute décision non évidente (choix technique, contournement,
   dette assumée) va dans le code, le commit ou la PR — pas dans un fil de discussion perdu.
7. **Rien de secret, rien de généré, rien de lourd** ne rentre dans le dépôt (voir §10 et §11).

---

## 2. Mise en route

```bash
git clone <url-du-depot>
cd <depot>
```

Chaque dépôt documente dans son `README.md` les commandes d'installation, de test et de lint.
Règle générale : **si tu ne peux pas lancer les tests en une commande, c'est un bug du dépôt** —
ouvre une issue.

Configuration Git recommandée (une fois par poste) :

```bash
git config --global pull.rebase true          # historique linéaire au pull
git config --global fetch.prune true          # nettoie les branches distantes supprimées
git config --global rebase.autoStash true     # évite de perdre du travail non commité
git config --global core.autocrlf input       # cohérence Windows/Linux (si le dépôt n'a pas de .gitattributes)
git config --global user.name  "Prénom Nom"
git config --global user.email "prenom.nom@organisation.fr"
```

---

## 3. Branches

### Nommage

```
<type>/<ticket>-<description-courte-en-kebab-case>
```

- `type` : identique aux types de commit (`feat`, `fix`, `docs`, `refactor`, `test`, `chore`,
  `perf`, `ci`, `build`).
- `ticket` : identifiant de l'issue/ticket, omis s'il n'y en a pas.
- `description` : 3 à 5 mots, en minuscules, séparés par des tirets.

Exemples :

```
feat/412-export-csv
fix/auth-token-expire-trop-tot
docs/maj-readme-installation
refactor/decoupage-service-facturation
chore/bump-dependances
```

Règles :

- Branche **courte durée** (quelques jours). Si elle vit plus d'une semaine, découpe ou décide.
- On part **toujours** de `main` à jour, jamais d'une autre branche de travail.
- Une branche fusionnée est **supprimée** (côté distant inclus).
- Jamais de nom générique : `dev`, `test`, `patch`, `v2`, `wip`, `ma-branche`.

### Se mettre à jour

Rebaser plutôt que merger, pour garder un historique linéaire :

```bash
git fetch --prune
git rebase origin/main
```

En cas de conflit : on résout, on `git add`, on `git rebase --continue`. **On ne merge jamais
`main` dans sa branche de feature.**

---

## 4. Commits

### Format : Conventional Commits

```
<type>(<portée optionnelle>): <description à l'impératif>

<corps optionnel : le pourquoi, pas le comment>

<pied optionnel : BREAKING CHANGE, refs, co-auteurs>
```

- **Ligne de titre ≤ 72 caractères**, sans point final, à l'impératif présent
  (« ajoute », pas « ajouté » ni « ajout d'un »).
- Le titre décrit **l'effet**, pas le fichier touché : `fix(api): refuse un token expiré`,
  pas `fix(api): modifie token.ts`.

### Types

| Type       | Usage                                                             |
| ---------- | ----------------------------------------------------------------- |
| `feat`     | Nouvelle fonctionnalité visible par l'utilisateur                 |
| `fix`      | Correction de bug                                                 |
| `docs`     | Documentation seule (README, commentaires, ce fichier)            |
| `style`    | Formatage, espaces, points-virgules — **aucun** changement de sens |
| `refactor` | Réorganisation du code sans changer le comportement               |
| `perf`     | Amélioration de performance                                       |
| `test`     | Ajout ou correction de tests                                      |
| `build`    | Dépendances, outillage de build                                   |
| `ci`       | Configuration d'intégration continue                              |
| `chore`    | Maintenance diverse (versions, scripts, ménage)                   |

### Portées

Facultatives mais recommandées dès que le dépôt a plusieurs modules :
`api`, `ui`, `auth`, `db`, `ci`, `deps`… La liste vit dans le `README.md` du dépôt.

### Exemples

```
feat(export): ajoute l'export CSV des factures

fix(auth): rejette un token expiré au lieu de le rafraîchir

refactor(parser): isole la lecture des en-têtes

docs: précise la procédure de restauration

perf(liste): pagine côté serveur au-delà de 500 éléments
```

Changement cassant :

```
feat(api)!: supprime l'endpoint /v1/users

BREAKING CHANGE: /v1/users est remplacé par /v2/users.
Les clients doivent migrer avant la 3.0.
Refs: #512
```

### Règles

- **Un commit = un changement cohérent.** Pas de `wip`, `fix`, `update`, `ça marche`, `tmp`,
  `revert de mon revert`.
- **Pas de commit de formatage massif** mélangé à du fonctionnel (il rend le diff illisible).
  Si le dépôt n'est pas formaté, faire un commit `style:` isolé, référencé dans `.git-blame-ignore-revs`.
- **Pas de commit vide**, sauf `chore: trigger ci` explicitement justifié.
- On **rebase / `commit --amend`** sa branche personnelle pour nettoyer avant la PR.
  On ne réécrit **jamais** l'historique d'une branche partagée ou de `main`.
- Un commit qui corrige un bug cite l'issue : `Closes #123` / `Refs: #123` dans le pied.
- On ne commite **jamais** de fichier ignoré de force (`git add -f` interdit sans raison écrite).

### Hook optionnel (validation locale)

À placer dans `.git/hooks/commit-msg` (ou via `pre-commit`/`lefthook` s'ils sont déjà en place) :

```bash
#!/usr/bin/env sh
msg_file="$1"
pattern='^(feat|fix|docs|style|refactor|perf|test|build|ci|chore)(\([a-z0-9._/-]+\))?!?: .{3,}$'
head -n1 "$msg_file" | grep -Eq "$pattern" || {
  echo "Commit refusé : format Conventional Commits attendu."
  echo "Exemple : feat(api): ajoute la pagination"
  exit 1
}
```

---

## 5. Qualité avant de pousser

Avant chaque `git push`, le strict minimum :

1. **Lint** — pas de nouvelle erreur.
2. **Formatage** — appliqué par l'outil du dépôt, pas à la main.
3. **Tests** — la suite passe localement ; tout bug corrigé arrive avec son test.
4. **Compilation / build** — ça compile.
5. **Relecture de son propre diff** : `git diff origin/main...` avant d'ouvrir la PR.

Règles :

- **Le code suit le style du dépôt**, pas les préférences personnelles. Si l'outil formate, on
  l'exécute, on ne discute pas.
- **Un correctif de bug vient avec un test qui échouait** avant.
- **On ne désactive pas un test, un lint ou un contrôle CI** pour faire passer sa PR. Si un test
  est réellement faux, on le corrige ou on ouvre une issue et on le `skip` explicitement, avec
  référence et date de péremption.
- Une dépendance ajoutée se justifie dans la PR (poids, licence, maintenance, alternative).

---

## 6. Pull Requests

Une PR est **une proposition**, pas un journal de bord. Elle doit pouvoir être comprise sans
ouvrir le code.

### Avant d'ouvrir

- Branche à jour avec `main` (rebase fait).
- Historique nettoyé (commits relus, `fix typo` absorbés).
- PR **draft** tant qu'elle n'est pas prête à être relue.
- Un **seul sujet** par PR. Refactor + feature + reformatage = 3 PR.

### Titre

Il devient souvent le message de squash : il suit donc **Conventional Commits**.

```
feat(export): ajoute l'export CSV des factures (#412)
```

### Description

```markdown
## Contexte
Pourquoi ce changement ? Quel problème est résolu ? (lien vers l'issue)

## Ce qui change
- …
- …

## Comment vérifier
Étapes concrètes pour reproduire / tester le comportement.

## Points d'attention
Décisions de design, dette ajoutée, effets de bord, migration de données.

## Captures / preuves
Avant/après si l'UI change ; logs ou sortie de test si pertinent.

Closes #412
```

### Règles

- **Taille cible < 400 lignes utiles.** Au-delà, on découpe (par commit logique ou par couche).
- **Pas de mélange** de fonctionnel et de formatage/reformatage dans la même PR.
- **Pas de code mort, commenté ou `TODO` sans ticket.** Un `TODO` doit citer une issue.
- **Pas de `console.log`, debug, credentials, chemins locaux** en dur.
- **Une PR sans description ni test manuel expliqué sera fermée sans relecture.**
- On répond aux commentaires en **résolvant la conversation**, pas en la laissant ouverte.
- Une PR abandonnée se **ferme** (elle ne reste pas ouverte pendant des mois).

---

## 7. Revue de code

### Pour l'auteur

- Relis ton propre diff **avant** de demander une relecture.
- Le contexte nécessaire est dans la description ; si un relecteur doit deviner, complète-la.
- Réponds à **chaque** commentaire : corrigé, ou expliqué (avec accord).
- Ne force-push **pas** pendant une revue active en cours, sauf prévenu dans la PR
  (sinon les commentaires se perdent).
- **Ne merge pas ta propre PR** sans approbation, même si la CI est verte.

### Pour le relecteur

- Relire **dans la journée** si possible (l'attente est le premier coût d'une revue).
- Commenter **le code, jamais la personne** ; proposer, ne pas imposer.
  - Bloquant : `[bloquant]`, `[sécurité]`, `[bug]` → doit être résolu.
  - Non bloquant : `[nit]`, `[suggestion]`, `[question]` → l'auteur tranche.
- Vérifier : **le comportement**, pas le style (le style est le rôle du linter).
- Chercher : cas limites, erreurs non gérées, fuites de ressources, accès aux données,
  concurrence, secrets, absence de test sur le chemin critique.
- **Approuver explicitement** ou demander des changements — pas de « LGTM » ambigu sans lecture.

### Ce qui bloque une fusion

- CI rouge, conflit, branche en retard sur `main`.
- Approbation manquante.
- Commentaire `[bloquant]` non résolu.
- Fonctionnalité sans test ni procédure de vérification.
- Secret, fichier généré ou binaire volumineux ajouté.

---

## 8. Fusion

Stratégie par défaut, sauf indication contraire dans le `README.md` du dépôt :

| Cas                            | Méthode                          |
| ------------------------------ | -------------------------------- |
| PR classique                   | **Squash and merge**             |
| Branche déjà propre, 1 commit  | **Rebase and merge** (fast-forward) |
| Correctif urgent en production | Merge commit, tracé dans la PR    |

Règles :

- La branche source est **supprimée** après fusion.
- On **ne merge pas** une PR dont on n'est pas l'auteur sans que l'auteur le demande.
- Le message de squash reprend le **titre de la PR** + le corps utile, pas la liste brute des
  commits intermédiaires.
- Après fusion, on **met à jour sa copie locale** (`git switch main && git pull --rebase`).

---

## 9. Versions et releases

- **SemVer** : `MAJEUR.MINEUR.CORRECTIF`.
  - `MAJEUR` : rupture de compatibilité (nécessite un `BREAKING CHANGE`).
  - `MINEUR` : ajout compatible (`feat`).
  - `CORRECTIF` : correction compatible (`fix`, `perf`).
- Une version = un **tag annoté** (`v1.4.0`) sur `main`, jamais sur une branche.
- Le `CHANGELOG.md` est **généré depuis les commits** (Conventional Commits) ou tenu à la main
  mais dans le même commit que le bump de version. Pas de section « divers ».
- Une release est **reproductible** : le tag doit permettre de reconstruire l'artefact livré.
- Pas de `v2-final`, `v2-final-vraiment`, `v2-ok`. Une correction = une nouvelle version.

---

## 10. Hygiène du dépôt

- `.gitignore` à jour **dès le premier commit** (dépendances, build, IDE, OS, secrets locaux).
- **Aucun fichier généré** versionné (sauf décision explicite documentée : lockfiles, artefacts
  de documentation).
- **Aucun binaire volumineux.** Au-delà de ~5 Mo, utiliser Git LFS ou un stockage externe.
- Pas de fichiers d'IDE personnels (`.idea/`, `.vscode/` sauf configuration partagée décidée).
- Pas de `Thumbs.db`, `.DS_Store`, `node_modules/`, `dist/`, `.env`.
- Pas de fichiers en doublon ou mal nommés (`copy`, `test2`, `old`, `backup`, `final`).
- Les fichiers déplacés le sont avec `git mv` (l'historique suit).
- Un dépôt contient **un projet**. Pas de « fourre-tout ».

---

## 11. Sécurité

- **Jamais de secret en clair** : mot de passe, token, clé privée, chaîne de connexion, certificat.
  Un secret poussé est **compromis** : on le révoque, on ne se contente pas de le supprimer du
  dernier commit (il reste dans l'historique).
- Utiliser des variables d'environnement, un `.env` local ignoré, et un `.env.example` documenté
  sans valeur réelle.
- Ne pas logger de données personnelles, tokens ou identifiants.
- Signaler une faille **en privé** au mainteneur (voir `SECURITY.md` s'il existe), pas dans une
  issue publique.
- Les dépendances suivent les correctifs de sécurité ; une vulnérabilité critique connue bloque
  la release.

---

## 12. Issues et propositions

Une bonne issue contient :

- **Contexte** : ce qui était attendu, ce qui se passe réellement.
- **Reproduction** : étapes minimales, version/commit, environnement.
- **Preuves** : message d'erreur complet, logs, capture.
- **Impact** : bloquant ? perte de données ? cosmétique ?

Une proposition de fonctionnalité décrit **le besoin et le cas d'usage**, pas seulement la solution
technique souhaitée. Discuter du *quoi* avant du *comment*.

Une issue n'est pas un chat : les décisions importantes y sont résumées en fin de fil.

---

## 13. Checklist avant d'ouvrir une PR

```markdown
- [ ] La branche part de `main` à jour et est rebasée
- [ ] Les commits respectent Conventional Commits et sont atomiques
- [ ] Lint, formatage, tests et build passent localement
- [ ] Le diff a été relu par moi-même (`git diff origin/main...`)
- [ ] Un seul sujet est traité
- [ ] La description explique le contexte, le changement et comment vérifier
- [ ] Un test couvre le nouveau comportement / le bug corrigé
- [ ] Aucun secret, fichier généré, binaire lourd ni code de debug
- [ ] La documentation est à jour (README, doc d'API, CHANGELOG si version)
- [ ] Les TODOs éventuels citent une issue
```

---

## 14. Adapter ce document à un dépôt

Ce fichier est fait pour être copié tel quel dans n'importe quel dépôt. Pour l'adapter, ne changer
que ces éléments, dans son `README.md` (pas ici) :

| Élément                    | Où le définir                          |
| -------------------------- | -------------------------------------- |
| Commandes install/test/lint | `README.md` du dépôt                   |
| Liste des portées de commit | `README.md`, section « Conventions »    |
| Stratégie de fusion         | Réglages GitHub du dépôt + note README |
| Branche par défaut          | `main` (sauf migration en cours)       |
| Modèle de PR                | `.github/pull_request_template.md`     |
| Modèles d'issues            | `.github/ISSUE_TEMPLATE/`              |
| Politique de sécurité       | `SECURITY.md`                          |
| Licence                     | `LICENSE`                              |

Le présent document prime sur les habitudes individuelles ; en cas de désaccord avec un réglage
du dépôt, c'est le réglage du dépôt qui s'applique — mais il doit alors être écrit.

---

## Licence et contributions

En soumettant une contribution, tu acceptes qu'elle soit distribuée sous la licence du dépôt
(voir `LICENSE`) et tu certifies en être l'auteur ou avoir le droit de la soumettre.
