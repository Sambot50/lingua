// Orchestration d'un cycle d'analyse complet :
// données de marché → agents 1 & 2 (en parallèle) → plan de risque →
// agent 3 (validation) → agent 4 (décision) → alerte à valider par l'humain.
import { loadState, saveState } from "./store.js";
import { fetchCandles, fetchTicker } from "./marketData.js";
import { buildSnapshot } from "./indicators.js";
import { fetchNews, fetchFearGreed } from "./news.js";
import {
  runTechnicalAgent,
  runSentimentAgent,
  runRiskAgent,
  runManagerAgent,
  computeRiskPlan
} from "./agents.js";
import { createAlert, riskExposure } from "./paperTrading.js";

async function analyzePair(pair, news, fearGreed) {
  const s = loadState();
  const [candles1h, candles4h, candles1d, ticker] = await Promise.all([
    fetchCandles(pair, "1h", 150),
    fetchCandles(pair, "4h", 120),
    fetchCandles(pair, "1d", 200),
    fetchTicker(pair)
  ]);
  const snapshot1h = buildSnapshot(candles1h);
  const snapshot4h = buildSnapshot(candles4h);
  const snapshot1d = buildSnapshot(candles1d);

  // Agents 1 et 2 travaillent en parallèle
  const [tech, sentiment] = await Promise.all([
    runTechnicalAgent(pair, { h1: snapshot1h, h4: snapshot4h, d1: snapshot1d }),
    runSentimentAgent(pair, news, fearGreed)
  ]);

  // Plan de trade hypothétique (achat) calculé par le code, validé par l'agent 3
  const atrValue = snapshot1h.atr14;
  const riskPlan = computeRiskPlan({
    pair,
    price: ticker.price,
    atrValue,
    portfolio: s.portfolio,
    config: s.config
  });
  const riskReview = await runRiskAgent(riskPlan, s.portfolio, s.config);

  const existingPosition = s.portfolio.positions.find((p) => p.pair === pair);

  // Agent 4 : décision finale
  const manager = await runManagerAgent({
    pair,
    ticker,
    tech,
    sentiment,
    riskPlan,
    riskReview,
    existingPosition
  });

  // Compte-rendu conservé pour l'interface
  s.reports[pair] = {
    at: new Date().toISOString(),
    prix: ticker.price,
    variation24h: ticker.changePct24h,
    technique: tech,
    sentiment,
    planRisque: riskPlan,
    avisRisque: riskReview,
    manager
  };

  // Création de l'alerte selon la décision du manager
  // (seuil de confiance minimal configurable dans les réglages)
  const confOk = manager.confiance >= (s.config.minConfidence ?? 0);

  // Plafond d'exposition corrélée : les cryptos évoluent ensemble, on limite
  // le risque cumulé toutes positions confondues à un % du capital.
  const expo = riskExposure();
  const plafondRisque = ((s.config.maxTotalRiskPct ?? 100) / 100) * expo.capital;
  const expositionOk = expo.openRisk + riskPlan.risqueMax <= plafondRisque + 1e-9;

  if (manager.action === "ACHETER" && riskReview.valide && !existingPosition && confOk) {
    if (!expositionOk) {
      s.reports[pair].expositionBloquee =
        `Alerte d'achat non créée : risque déjà ouvert ${Math.round(expo.openRisk)} USDT ` +
        `+ nouveau ${Math.round(riskPlan.risqueMax)} USDT > plafond ${Math.round(plafondRisque)} USDT ` +
        `(${s.config.maxTotalRiskPct}% du capital).`;
    } else {
      createAlert({
        type: "achat",
        pair,
        plan: riskPlan,
        confiance: manager.confiance,
        synthese: manager.synthese,
        argumentsPour: manager.argumentsPour,
        argumentsContre: manager.argumentsContre
      });
    }
  } else if (manager.action === "VENDRE" && existingPosition && confOk) {
    createAlert({
      type: "vente",
      pair,
      positionId: existingPosition.id,
      confiance: manager.confiance,
      synthese: manager.synthese,
      argumentsPour: manager.argumentsPour,
      argumentsContre: manager.argumentsContre
    });
  }
  saveState();
}

let running = false;

export async function runFullAnalysis() {
  const s = loadState();
  if (running) return { started: false, reason: "Une analyse est déjà en cours." };
  running = true;
  s.analysisInProgress = true;
  s.lastError = null;
  saveState();

  // Exécution en arrière-plan : l'interface suit l'avancement via /api/state
  (async () => {
    try {
      const [news, fearGreed] = await Promise.all([fetchNews(), fetchFearGreed()]);
      for (const pair of s.config.pairs) {
        try {
          await analyzePair(pair, news, fearGreed);
        } catch (err) {
          console.error(`Analyse ${pair} :`, err.message);
          s.lastError = `Analyse ${pair} : ${err.message}`;
        }
      }
      s.lastAnalysisAt = new Date().toISOString();
    } catch (err) {
      s.lastError = err.message;
    } finally {
      running = false;
      s.analysisInProgress = false;
      saveState();
    }
  })();

  return { started: true };
}
