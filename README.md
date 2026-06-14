# 📚 Lingua — App d'apprentissage anglais

Application PWA personnelle pour Alexandre Bothereau.
Synchronisée avec Notion · Fonctionne hors-ligne · Installable sur iPhone et Mac.

## 🚀 Déploiement en 5 minutes (GitHub Pages — GRATUIT)

### Étape 1 — Compte GitHub
1. Va sur [github.com](https://github.com) et crée un compte gratuit (si pas déjà fait)
2. Clique **New repository** → nom : `lingua` → Public → **Create repository**

### Étape 2 — Upload les fichiers
Dans ton nouveau repo, clique **uploading an existing file** et glisse-dépose :
```
index.html
manifest.json
sw.js
icons/
  icon-192.svg
  icon-512.svg
```
Clique **Commit changes**.

### Étape 3 — Activer GitHub Pages
1. Onglet **Settings** → **Pages** (menu gauche)
2. Source : **Deploy from a branch** → Branch : **main** → **/root**
3. Clique **Save**

Ton app sera disponible sur : `https://TON-PSEUDO.github.io/lingua`

---

## 📱 Installer sur iPhone (Safari uniquement)
1. Ouvre `https://TON-PSEUDO.github.io/lingua` dans **Safari**
2. Bouton partage (carré avec flèche) → **Sur l'écran d'accueil**
3. Lingua apparaît comme une vraie app !

## 💻 Installer sur Mac/PC (Chrome ou Edge)
1. Ouvre l'URL dans Chrome
2. Icône **⊕** dans la barre d'adresse → **Installer Lingua**

---

## ⚙️ Configuration Notion (première fois)
1. Va sur [notion.so/my-integrations](https://www.notion.so/my-integrations)
2. Crée une intégration **"Lingua"** → copie le token `secret_xxx`
3. Dans ta base Notion Lingua : ··· → Connections → Ajoute "Lingua"
4. Dans l'app : onglet Réglages → colle le token → Enregistrer

---

## 🔧 Structure des fichiers
```
lingua/
├── index.html       ← App complète (tout en un fichier)
├── manifest.json    ← Config PWA
├── sw.js            ← Service worker (offline)
└── icons/
    ├── icon-192.svg
    └── icon-512.svg
```

## ✨ Fonctionnalités
- **Capture rapide** : tape un mot → traduction automatique via Claude → sauvegarde en 1 tap
- **Flashcards** : révision spaced repetition, mots non maîtrisés en priorité
- **Glossaire** : filtres par catégorie (Naval, Business, Formel...), recherche
- **Sync Notion** : bidirectionnelle, fonctionne hors-ligne avec cache local
- **PWA** : installable sur iPhone, iPad, Mac, PC
