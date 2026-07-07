# CLAUDE.md

Ce fichier guide Claude Code (claude.ai/code) lorsqu'il travaille sur le code de ce dépôt.

## De quoi il s'agit

Lingua est une PWA personnelle d'apprentissage de l'anglais (utilisateur unique : Alexandre Bothereau). Le vocabulaire est stocké dans une base Notion, accessible via un proxy Cloudflare Worker. L'interface est en français.

**Il n'y a ni système de build, ni package.json, ni linter, ni tests.** L'app est en HTML/CSS/JS pur, sans aucune dépendance.

## Développement

Servir le répertoire avec n'importe quel serveur statique (une ouverture en `file://` n'enregistrera pas le service worker) :

```bash
python3 -m http.server 8000
```

Le déploiement est assuré par GitHub Pages qui sert la racine de la branche `main` — pousser sur `main`, c'est déployer. Il n'y a pas d'étape de build.

## Architecture

Quatre fichiers composent toute l'app :

- **`index.html`** — l'application entière : le CSS dans un bloc `<style>`, le JS dans un bloc `<script>`. Toute l'UI et la logique sont ici.
- **`sw.js`** — service worker pour le mode hors-ligne (stratégie cache-first).
- **`manifest.json`** — manifeste PWA (installable sur iPhone/Mac).
- **`icons/`** — icônes SVG référencées par le manifeste.

### Backend (absent de ce dépôt)

`index.html` définit `WORKER_URL`, un Cloudflare Worker qui détient les identifiants Notion et proxifie tous les accès aux données. Le code du worker n'est pas dans ce dépôt. L'API attendue par le frontend :

- `GET  /words` → `{words: [...]}`
- `POST /words` avec `{word, category, example}` → `{success, word}`
- `PATCH /words/:id/mastered` avec `{mastered: bool}` → `{success}`

Un objet mot est `{id, word, category, example, mastered}`. Les catégories sont des chaînes libres venant de Notion (ex. `Naval`, `Général`, `Business`, `Série/Film`).

La fonctionnalité « Analyser un texte » appelle `api.anthropic.com` directement depuis le navigateur (indépendamment du worker).

### Pattern d'UI dans index.html

SPA à onglets pilotée par des variables d'état globales (`words`, `currentTab`, `flashList`, variables de filtre). Chaque onglet a une fonction `render*()` (`renderGlossary`, `renderFlash`, `renderAdd`, `renderStats`) qui reconstruit `#screen` via des template literals `innerHTML` ; les gestionnaires d'événements sont des attributs `onclick` inline appelant des fonctions globales. Les mutations sont optimistes : l'état local est mis à jour d'abord, l'appel API suit, avec rollback en cas d'échec (voir `toggleMastered`). Suivre ce pattern plutôt que d'introduire des frameworks ou des modules.

## Conventions

- **Cache du service worker** : `sw.js` utilise un nom de cache versionné (`lingua-v1`). Lors d'une modification d'`index.html` ou d'autres assets mis en cache, incrémenter cette version, sinon les clients installés continueront de servir l'ancienne copie en cache.
- Les textes de l'UI sont en français ; les identifiants du code sont en anglais.
- Mise en page mobile-first (max-width 480px, safe-area insets iOS). Préserver les ajustements tactiles/scroll `-webkit-` et le style de modale bottom-sheet.
- Le CSS utilise les custom properties définies dans `:root` (`--bg`, `--acc`, `--grn`, etc.) — les réutiliser plutôt que de coder les couleurs en dur.

## Divergence connue

Le README décrit un onglet « Réglages » où un token Notion serait collé dans l'app. L'app actuelle n'a pas cet onglet — l'accès à Notion passe exclusivement par le Cloudflare Worker. Sur ce point, faire confiance au code plutôt qu'au README.
