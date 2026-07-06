---
registre: blockers
description: Frictions rencontrées, leur cause réelle, et la solution retenue — pour ne pas re-diagnostiquer deux fois le même problème.
schema:
  id: "BLK-XXX"
  date: "AAAA-MM-JJ"
  friction: string
  cause_reelle: string
  solution: string
  statut: "resolu | ouvert"
---

# Blocages (BLK)

## Index

| ID | Date | Friction | Statut |
|---|---|---|---|
| BLK-001 | 2026-07-06 | Session cloud sans accès à la machine locale de l'utilisateur | ouvert |

## Entrées détaillées

### BLK-001 — Session cloud sans accès à la machine locale de l'utilisateur
- **Date** : 2026-07-06
- **Friction** : Des consignes d'implémentation (projet Hermes/Assistant local, vault Obsidian sur `D:\`, services sur `127.0.0.1`) ont été transmises à cette session, qui ne peut ni les exécuter ni les vérifier.
- **Cause réelle** : Cette session Claude Code s'exécute dans un conteneur cloud isolé, rattaché uniquement au dépôt Git courant — aucun accès réseau ni filesystem vers la machine Windows locale de l'utilisateur, ni vers ses services locaux (Obsidian REST API, ChromaDB, etc.).
- **Solution** : Distinguer explicitement les tâches qui nécessitent une exécution locale (nécessitent Claude Code lancé directement sur la machine de l'utilisateur) des tâches qui peuvent être traitées ici (conception, rédaction de specs, code à copier/exécuter localement).
- **Statut** : ouvert — nécessite une session Claude Code locale pour être levé définitivement sur les chantiers concernés.
