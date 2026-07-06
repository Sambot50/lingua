---
registre: journal
description: Journal de session, une entrée par date, 3 à 5 lignes maximum — pas un compte-rendu exhaustif, juste de quoi se repérer.
schema:
  date: "AAAA-MM-JJ"
  resume: string (3-5 lignes max)
---

# Journal

## 2026-07-06
- Cadrage du projet : Assistant Personnel, mission hybride (code + tâches diverses selon besoin).
- Conception approfondie d'une architecture de vault Obsidian (PARA + Areas, frontmatter unifié, agents IA, cycle brouillon/validation, plugins).
- Clarification d'un point de gouvernance clé : les agents ne s'auto-valident jamais, l'humain reste seul décideur du statut "Validé".
- Mise en place de l'infrastructure mémoire `.claude/memory/` (5 registres) pour capitaliser ce type de contexte d'une session à l'autre.
