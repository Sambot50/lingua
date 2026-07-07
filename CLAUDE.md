# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Lingua is a personal English-learning PWA (single user: Alexandre Bothereau). Vocabulary is stored in a Notion database, accessed through a Cloudflare Worker proxy. The UI is in French.

**There is no build system, no package.json, no linter, and no tests.** The app is plain HTML/CSS/JS with zero dependencies.

## Development

Serve the directory with any static server (a plain `file://` open won't register the service worker):

```bash
python3 -m http.server 8000
```

Deployment is GitHub Pages serving the `main` branch root — pushing to `main` is deploying. There is no build step.

## Architecture

Four files make up the entire app:

- **`index.html`** — the whole application: CSS in a `<style>` block, JS in a `<script>` block. All UI and logic live here.
- **`sw.js`** — service worker for offline support (cache-first strategy).
- **`manifest.json`** — PWA manifest (installable on iPhone/Mac).
- **`icons/`** — SVG icons referenced by the manifest.

### Backend (not in this repo)

`index.html` defines `WORKER_URL`, a Cloudflare Worker that holds the Notion credentials and proxies all data access. The worker's code is not in this repository. The API surface the frontend expects:

- `GET  /words` → `{words: [...]}`
- `POST /words` with `{word, category, example}` → `{success, word}`
- `PATCH /words/:id/mastered` with `{mastered: bool}` → `{success}`

A word object is `{id, word, category, example, mastered}`. Categories are free-form strings from Notion (e.g. `Naval`, `Général`, `Business`, `Série/Film`).

The "Analyser un texte" feature calls `api.anthropic.com` directly from the browser (separately from the worker).

### UI pattern in index.html

Tab-based SPA driven by global state variables (`words`, `currentTab`, `flashList`, filter vars). Each tab has a `render*()` function (`renderGlossary`, `renderFlash`, `renderAdd`, `renderStats`) that rebuilds `#screen` via `innerHTML` template literals; event handlers are inline `onclick` attributes calling global functions. Mutations are optimistic: local state is updated first, the API call follows, with rollback on failure (see `toggleMastered`). Follow this pattern rather than introducing frameworks or modules.

## Conventions

- **Service worker cache**: `sw.js` uses a versioned cache name (`lingua-v1`). When changing `index.html` or other cached assets, bump this version or installed clients will keep serving the stale cached copy.
- UI text is French; code identifiers are English.
- Mobile-first layout (max-width 480px, iOS safe-area insets). Preserve `-webkit-` touch/scroll tweaks and the bottom-sheet modal style.
- CSS uses the custom properties defined in `:root` (`--bg`, `--acc`, `--grn`, etc.) — reuse them instead of hardcoding colors.

## Known discrepancy

The README describes a "Réglages" (settings) tab where a Notion token is pasted into the app. The current app has no such tab — Notion access goes exclusively through the Cloudflare Worker. Trust the code over the README on this point.
