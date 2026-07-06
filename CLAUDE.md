# CLAUDE.md

## Mémoire du projet

Le dossier `.claude/memory/` contient 5 registres de mémoire agent :

- `decisions.md` — décisions structurantes (ID `BDR-XXX`)
- `learnings.md` — patterns et apprentissages capitalisés (ID `LRN-XXX`)
- `blockers.md` — frictions rencontrées et leur résolution (ID `BLK-XXX`)
- `journal.md` — journal de session, 3 à 5 lignes par date
- `evals.md` — évaluations d'outputs produits (ID `EVAL-XXX`)

**Au début de chaque session, lire les 5 registres avant de commencer tout travail.**

### Règle de capitalisation par type

- **Decision** (`decisions.md`) : dès qu'un choix structurant est fait et qu'une alternative a été écartée consciemment — ajouter une entrée `BDR-XXX`, jamais réécrire une décision existante (une nouvelle décision qui en remplace une ancienne passe le statut de l'ancienne à `remplace`).
- **Learning** (`learnings.md`) : dès qu'un pattern se répète ou qu'une erreur révèle un principe généralisable — ajouter une entrée `LRN-XXX` avec son application future explicite.
- **Blocker** (`blockers.md`) : dès qu'une friction bloque l'avancement — ajouter une entrée `BLK-XXX` avec la cause réelle (pas juste le symptôme), mettre à jour le statut à `resolu` dès que la cause est levée.
