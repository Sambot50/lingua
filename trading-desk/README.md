# 📊 Trading Desk — Application de trading multi-agents

Application de **trading crypto** pilotée par 4 agents IA propulsés par Claude. **Aucun ordre n'est exécuté sans ta validation.** Trois modes : paper trading (défaut), testnet Binance, réel Binance.

## 🧠 Les 4 agents

| Agent | Rôle |
|---|---|
| **1. Analyste technique** | Interprète chandeliers japonais, RSI, MACD, EMA/SMA, Bollinger, ATR, volumes, supports/résistances (calculés par le serveur sur 1h et 4h) |
| **2. Analyste sentiment** | Analyse les actualités (CoinDesk, Cointelegraph) et l'indice Fear & Greed |
| **3. Risk manager** | Valide le plan de trade : risque limité à X% du capital (2% par défaut), stop-loss ATR, take-profit à ratio gain/risque 2:1. Le dimensionnement est calculé par du **code déterministe**, jamais par l'IA |
| **4. Manager** | Chef d'orchestre : synthétise les rapports, décide ACHETER / VENDRE / ATTENDRE et te rend compte. Sa décision crée une **alerte que tu valides ou refuses** |

## 🔁 Fonctionnement d'un cycle

```
Données de marché (Binance, repli Crypto.com)
        │
        ├─► Indicateurs techniques (serveur) ──► Agent 1 (technique)  ┐
        ├─► Actualités RSS + Fear & Greed ────► Agent 2 (sentiment)  ├─► Agent 4 (manager)
        └─► Plan de trade (code) ─────────────► Agent 3 (risque)     ┘        │
                                                                              ▼
                                                            🔔 Alerte → TA VALIDATION
                                                                              │
                                                              ✅ Exécution paper trading
                                                     (stop-loss / take-profit surveillés chaque minute)
```

## 🚀 Installation

Prérequis : [Node.js 18+](https://nodejs.org) et une clé API Anthropic ([console.anthropic.com](https://console.anthropic.com)).

```bash
cd trading-desk
npm install
export ANTHROPIC_API_KEY="sk-ant-..."   # Windows : set ANTHROPIC_API_KEY=sk-ant-...
npm start
```

Ouvre ensuite **http://localhost:3000**.

### Mode démo (sans internet, sans trader)

```bash
PAPER_FAKE_DATA=1 npm start
```

Génère des données de marché synthétiques — pratique pour découvrir l'interface.

## ☁️ Déploiement sur Render (gratuit)

1. Crée un compte sur [render.com](https://render.com)
2. **New → Web Service** → connecte ce dépôt GitHub
3. Root Directory : `trading-desk` · Build : `npm install` · Start : `npm start`
4. Dans **Environment**, ajoute `ANTHROPIC_API_KEY` avec ta clé
5. Déploie — ton tableau de bord est en ligne

⚠️ Le plan gratuit de Render met le serveur en veille après 15 min d'inactivité : l'état est sauvegardé dans un fichier local qui peut être perdu au redémarrage. Pour un usage sérieux, prends le plan payant avec disque persistant, ou héberge sur un petit VPS.

## ⚙️ Réglages (dans l'interface)

- **Risque par trade** : 0,5% à 5% du capital (défaut : 2%, le standard professionnel)
- **Paires suivies** : jusqu'à 6 (défaut : BTC/USDT, ETH/USDT, SOL/USDT)
- **Analyse automatique** : intervalle en minutes, 0 = manuel (défaut, pour maîtriser les coûts API)
- **Ratio gain/risque** : position du take-profit (défaut : 2)
- **Multiplicateur ATR** : distance du stop-loss (défaut : 1,5 × ATR)
- **Confiance minimale du manager** : en dessous de ce seuil, aucune alerte n'est créée (défaut : 60)
- **Mode de trading** : papier / réel (broker)

## 📊 Journal de performance

Calculé automatiquement sur les trades clôturés : taux de réussite, profit factor,
espérance par trade, R moyen (gain rapporté au risque pris), drawdown maximal,
statistiques par paire et par motif de sortie, calibration du manager (sa confiance
moyenne sur les trades gagnants vs perdants). Utilise-le pour ajuster les réglages
avant tout passage en réel.

## 📱 Notifications Telegram (validation depuis ton téléphone)

1. Sur Telegram, parle à **@BotFather** → `/newbot` → récupère le token
2. Ajoute la variable d'environnement `TELEGRAM_BOT_TOKEN=123456:ABC...`
3. Redémarre le serveur, puis **envoie n'importe quel message à ton bot** : il te répond
   et ton compte est lié automatiquement

Chaque alerte arrive alors sur ton téléphone avec les boutons **✅ Valider / ❌ Refuser**.

## 🏦 Broker Binance (mode réel)

Le connecteur pointe **par défaut sur le testnet Binance** (vraie API, argent fictif) :

1. Crée des clés sur [testnet.binance.vision](https://testnet.binance.vision) (connexion GitHub)
2. Variables d'environnement : `BINANCE_API_KEY=...` et `BINANCE_API_SECRET=...`
3. Dans les réglages de l'interface, passe le mode de trading sur **Réel**

Pour la **production (argent réel)** : clés API créées sur binance.com (permission
« trading spot » uniquement, **jamais** de permission de retrait) + `BINANCE_LIVE=1`.

⚠️ Important : les stop-loss/take-profit sont surveillés par ce serveur (vente au marché
quand le niveau est touché). **Le serveur doit donc rester allumé en permanence en mode réel.**
Ne passe en production qu'après plusieurs semaines de statistiques positives dans le journal
de performance, et commence petit.

## 💰 Coûts API

Chaque analyse = 4 appels Claude × nombre de paires (~0,15 à 0,50 $ par paire selon le modèle et le contexte). En mode manuel, tu contrôles entièrement la dépense.

## ⚠️ Avertissement

Application **éducative de paper trading**. Rien ne constitue un conseil en investissement. Les performances simulées ne préjugent pas de performances réelles. Les crypto-actifs sont extrêmement volatils — ne trade jamais avec de l'argent réel que tu ne peux pas te permettre de perdre.
