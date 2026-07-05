# 🚀 Déploiement gratuit 24h/24 — Render + UptimeRobot

Objectif : ton Trading Desk en ligne, actif en permanence, pour 0 €.
Durée : ~15 minutes. Aucune compétence serveur requise.

## Étape 1 — Mettre le serveur en ligne (Render)

1. Va sur [render.com](https://render.com) → **Get Started** → connecte-toi avec ton compte **GitHub**
2. Clique **New +** → **Web Service** → sélectionne ton dépôt `lingua`
3. Remplis exactement :
   - **Name** : `trading-desk` (ou ce que tu veux)
   - **Branch** : ta branche (ou `main` après fusion)
   - **Root Directory** : `trading-desk`
   - **Build Command** : `npm install`
   - **Start Command** : `npm start`
   - **Instance Type** : `Free`
4. Section **Environment Variables** — ajoute :

   | Clé | Valeur | Obligatoire ? |
   |---|---|---|
   | `ANTHROPIC_API_KEY` | ta clé `sk-ant-...` ([console.anthropic.com](https://console.anthropic.com)) | ✅ Oui |
   | `ACCESS_PASSWORD` | un mot de passe solide de ton choix | ✅ Oui (l'app sera sur internet !) |
   | `TZ` | `Europe/Paris` | ✅ Oui (sinon le rapport quotidien part à l'heure UTC) |
   | `TELEGRAM_BOT_TOKEN` | token de ton bot (@BotFather) | Recommandé |
   | `BINANCE_API_KEY` / `BINANCE_API_SECRET` | clés testnet ([testnet.binance.vision](https://testnet.binance.vision)) | Plus tard |

5. Clique **Deploy Web Service** → à la fin, ton app est sur `https://trading-desk-xxxx.onrender.com`
6. Ouvre l'URL : le navigateur demande le mot de passe (`ACCESS_PASSWORD`,
   nom d'utilisateur : n'importe quoi ou vide)

## Étape 2 — L'empêcher de dormir (UptimeRobot)

Le plan gratuit de Render endort le serveur après 15 min sans visite.
UptimeRobot le visite toutes les 5 minutes → il ne dort jamais.

1. Va sur [uptimerobot.com](https://uptimerobot.com) → crée un compte gratuit
2. **+ New Monitor** :
   - **Monitor Type** : `HTTP(s)`
   - **Friendly Name** : `Trading Desk`
   - **URL** : `https://trading-desk-xxxx.onrender.com/api/health`
     *(cet endpoint est exprès accessible sans mot de passe)*
   - **Monitoring Interval** : `5 minutes`
3. **Create Monitor**

🎁 Bonus gratuit : UptimeRobot t'envoie un **e-mail si le serveur tombe** —
c'est ton chien de garde inclus.

## Étape 3 — Lier Telegram (si token configuré)

1. Sur Telegram, ouvre ton bot et envoie-lui n'importe quel message
2. Il répond « ✅ Trading Desk connecté ! » → tu recevras les alertes avec
   les boutons Valider/Refuser, et le rapport quotidien à l'heure configurée

## ⚠️ Limites honnêtes du plan gratuit

- **Disque non persistant** : à chaque redéploiement (ou redémarrage de la
  machine par Render), le fichier d'état peut être réinitialisé — portefeuille,
  historique et réglages perdus. **Acceptable en paper trading** (argent fictif),
  inacceptable en mode réel.
- Le réveil après un rare redémarrage peut prendre ~1 minute.

👉 Avant tout passage en mode réel : bascule sur Render payant (disque
persistant, ~7 $/mois) ou Railway — même procédure, zéro changement de code.

## Vérifier que tout marche

- `https://ton-url.onrender.com/api/health` → `{"ok":true}`
- L'interface s'ouvre avec le mot de passe, bannière « clé API » absente
- Réglages → « 🔐 Sécurité : ✅ interface protégée par mot de passe »
- Lance une analyse → les 4 agents travaillent
