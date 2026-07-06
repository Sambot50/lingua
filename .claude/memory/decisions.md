---
registre: decisions
description: Journal des décisions structurantes prises sur le projet Assistant Personnel.
schema:
  id: "BDR-XXX"
  date: "AAAA-MM-JJ"
  titre: string
  decision: string
  pourquoi: string
  alternatives_considerees: string
  statut: "actif | remplace | abandonne"
---

# Décisions (BDR)

## Index

| ID | Date | Titre | Statut |
|---|---|---|---|
| BDR-001 | 2026-07-06 | Portée hybride du projet Assistant Personnel | actif |
| BDR-002 | 2026-07-06 | Mise en place de l'infrastructure mémoire `.claude/memory/` | actif |

## Entrées détaillées

### BDR-001 — Portée hybride du projet Assistant Personnel
- **Date** : 2026-07-06
- **Décision** : Le projet Assistant Personnel couvre à la fois du code (automatisations, intégrations) et des tâches de travail non-code (organisation, recherche, rédaction), sans se limiter à une seule catégorie.
- **Pourquoi** : La mission déclarée est de créer, optimiser et réaliser un assistant pour la vie quotidienne — les besoins varient selon les tâches à effectuer, impossible de figer une seule nature de projet dès le départ.
- **Alternatives considérées** : Restreindre le projet à un seul type (uniquement code, ou uniquement gestion de tâches) — écarté car trop rigide face à un usage encore évolutif.
- **Statut** : actif

### BDR-002 — Mise en place de l'infrastructure mémoire `.claude/memory/`
- **Date** : 2026-07-06
- **Décision** : Créer 5 registres standards (décisions, apprentissages, blocages, journal, évaluations) dès le lancement du projet, avant toute autre construction.
- **Pourquoi** : Garantir qu'une session future puisse reprendre le contexte sans redemander les mêmes informations, et capitaliser les choix/apprentissages au fil de l'eau plutôt qu'a posteriori.
- **Alternatives considérées** : Ne documenter qu'a posteriori, une fois le projet plus avancé — écarté, car le risque de perte de contexte entre sessions est immédiat dès la première itération.
- **Statut** : actif
