---
registre: learnings
description: Patterns observés et capitalisés pour éviter de refaire les mêmes erreurs ou re-découvrir les mêmes principes.
schema:
  id: "LRN-XXX"
  date: "AAAA-MM-JJ"
  pattern_observe: string
  contexte: string
  application_future: string
---

# Apprentissages (LRN)

## Index

| ID | Date | Pattern observé |
|---|---|---|
| LRN-001 | 2026-07-06 | Séparer capture et classification augmente l'usage réel d'un système |
| LRN-002 | 2026-07-06 | Un agent IA ne doit jamais s'auto-valider |

## Entrées détaillées

### LRN-001 — Séparer capture et classification augmente l'usage réel d'un système
- **Date** : 2026-07-06
- **Contexte** : Conception de l'architecture d'un vault Obsidian (Inbox unique, zéro décision de classement à la capture, tri différé au moment de la revue hebdomadaire).
- **Application future** : Pour tout système de capture construit pour l'Assistant Personnel (notes, tâches, idées), toujours découpler le moment de la capture du moment du classement — un système qui impose une décision à l'entrée est abandonné plus vite qu'un système qui capture d'abord et trie ensuite.

### LRN-002 — Un agent IA ne doit jamais s'auto-valider
- **Date** : 2026-07-06
- **Contexte** : Conception du cycle de vie des notes produites par un agent (Hermes) dans le système de mémoire — un brouillon rédigé par un agent avait initialement été marqué "Validé" automatiquement par erreur de conception.
- **Application future** : Toute sortie produite par un agent automatisé (code, texte, décision) doit transiter par un état intermédiaire (brouillon/proposé) et attendre une validation humaine explicite avant d'être considérée comme fiable ou définitive — à appliquer systématiquement dans les futurs registres et workflows de l'Assistant Personnel.
