# 📊 Trading Desk — Application de trading multi-agents

Application de **paper trading crypto** (argent fictif, prix réels) pilotée par 4 agents IA propulsés par Claude. **Aucun ordre n'est exécuté sans ta validation.**

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

## 💰 Coûts API

Chaque analyse = 4 appels Claude × nombre de paires (~0,15 à 0,50 $ par paire selon le modèle et le contexte). En mode manuel, tu contrôles entièrement la dépense.

## ⚠️ Avertissement

Application **éducative de paper trading**. Rien ne constitue un conseil en investissement. Les performances simulées ne préjugent pas de performances réelles. Les crypto-actifs sont extrêmement volatils — ne trade jamais avec de l'argent réel que tu ne peux pas te permettre de perdre.
