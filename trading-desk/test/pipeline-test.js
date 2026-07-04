// Test de bout en bout du pipeline multi-agents avec un client Claude simulé.
// Valide : orchestration, prompts, parsing des réponses structurées,
// création d'alertes, rapports, et le flux validation → position.
// Lancer avec : PAPER_FAKE_DATA=1 node test/pipeline-test.js
import assert from "assert";
import { _setTestClient } from "../src/agents.js";
import { runFullAnalysis } from "../src/analysis.js";
import { loadState, resetPortfolio } from "../src/store.js";
import { approveAlert } from "../src/paperTrading.js";

let calls = [];

// Client simulé : renvoie des réponses conformes aux schémas selon l'agent appelé
const fakeClient = {
  messages: {
    create: async (params) => {
      calls.push(params);
      // Vérifications structurelles de chaque requête envoyée à l'API
      assert.ok(params.model.startsWith("claude-"), "modèle Claude attendu");
      assert.deepStrictEqual(params.thinking, { type: "adaptive" }, "thinking adaptatif attendu");
      assert.ok(params.output_config?.format?.schema, "sortie structurée attendue");
      assert.ok(params.system.length > 50, "prompt système substantiel attendu");

      const sys = params.system;
      let payload;
      if (sys.includes("chef d'orchestre")) {
        payload = {
          action: "ACHETER", confiance: 68,
          synthese: "Convergence technique et sentiment, plan de risque validé : proposition d'achat soumise à ta validation.",
          argumentsPour: ["Signaux convergents"], argumentsContre: ["Confiance sentiment moyenne"]
        };
      } else if (sys.includes("analyste technique")) {
        // L'agent technique doit recevoir les 3 unités de temps (1h, 4h, journalier)
        const userMsg = params.messages[0].content;
        assert.ok(userMsg.includes("journalière"), "le prompt technique doit inclure le timeframe journalier");
        assert.ok(userMsg.includes("4 heures") && userMsg.includes("1 heure"), "timeframes 1h et 4h attendus");
        payload = {
          biais: "haussier", confiance: 72,
          signaux: ["RSI en zone neutre ascendante", "EMA20 > EMA50"],
          niveauxCles: { supportMajeur: 61000, resistanceMajeure: 68000 },
          commentaire: "Momentum haussier modéré."
        };
      } else if (sys.includes("sentiment de marché")) {
        payload = {
          biais: "haussier", confiance: 60,
          facteurs: ["Flux d'actualités constructif"],
          risqueEvenement: "aucun identifié",
          commentaire: "Sentiment légèrement positif."
        };
      } else if (sys.includes("gestionnaire des risques")) {
        payload = { valide: true, alertes: ["Volatilité élevée sur la paire"], commentaire: "Plan conforme aux règles." };
      } else if (sys.includes("analyste quantitatif")) {
        payload = {
          diagnostics: ["Les trades en désaccord technique/sentiment perdent plus souvent"],
          forces: ["Discipline de validation"],
          faiblesses: ["Stops touchés fréquemment"],
          recommandationsReglages: [{
            parametre: "atrStopMultiplier", valeurActuelle: "1.5", valeurProposee: "2",
            justification: "Trop de stops touchés par le bruit du marché."
          }],
          fiabiliteAnalyse: "Échantillon réduit : conclusions à confirmer.",
          synthese: "Base saine, stops à élargir."
        };
      } else {
        throw new Error("Prompt système non reconnu : " + sys.slice(0, 60));
      }
      return {
        stop_reason: "end_turn",
        content: [{ type: "text", text: JSON.stringify(payload) }]
      };
    }
  }
};

_setTestClient(fakeClient);
resetPortfolio(10000);
const s = loadState();
s.config.pairs = ["BTC/USDT"];
s.config.minConfidence = 60;
s.config.maxTotalRiskPct = 4;
s.config.feePct = 0;
s.config.slippagePct = 0;

console.log("— Pipeline multi-agents (client simulé) —");

const res = await runFullAnalysis();
assert.strictEqual(res.started, true);
// attend la fin de l'analyse en arrière-plan
for (let i = 0; i < 100 && loadState().analysisInProgress; i++) {
  await new Promise((r) => setTimeout(r, 100));
}

const state = loadState();
assert.strictEqual(state.analysisInProgress, false, "l'analyse doit se terminer");
assert.strictEqual(state.lastError, null, `aucune erreur attendue (${state.lastError})`);
console.log("  ✅ Cycle d'analyse terminé sans erreur");

assert.strictEqual(calls.length, 4, `4 appels d'agents attendus (${calls.length} reçus)`);
console.log("  ✅ Les 4 agents ont bien été appelés (technique, sentiment, risque, manager)");

const report = state.reports["BTC/USDT"];
assert.ok(report, "rapport enregistré");
assert.strictEqual(report.manager.action, "ACHETER");
assert.ok(report.planRisque.stopLoss < report.planRisque.entree);
assert.ok(report.planRisque.takeProfit > report.planRisque.entree);
console.log("  ✅ Rapport complet enregistré (technique + sentiment + risque + manager)");

const pending = state.alerts.filter((a) => a.status === "en_attente");
assert.strictEqual(pending.length, 1, "une alerte d'achat doit être créée");
const alert = pending[0];
assert.strictEqual(alert.type, "achat");
assert.ok(alert.plan.quantite > 0);
assert.strictEqual(alert.contexte?.techBiais, "haussier", "le contexte des signaux doit être attaché à l'alerte");
assert.strictEqual(alert.contexte?.reglages?.riskPct, 2, "les réglages du moment doivent être attachés");
console.log("  ✅ Alerte d'achat créée avec le contexte complet (signaux + réglages)");

// Validation humaine → position ouverte
await approveAlert(alert.id);
const s2 = loadState();
assert.strictEqual(s2.portfolio.positions.length, 1);
const pos = s2.portfolio.positions[0];
const riskAtStop = pos.qty * (pos.entry - pos.stopLoss);
assert.ok(riskAtStop <= 0.021 * 10000, `risque au stop (${riskAtStop.toFixed(2)}) ≤ ~2% du capital`);
console.log("  ✅ Validation humaine → position ouverte, risque au stop ≤ 2% du capital");

// Second cycle : une position existe déjà → pas de nouvelle alerte d'achat sur la même paire
calls = [];
await runFullAnalysis();
for (let i = 0; i < 100 && loadState().analysisInProgress; i++) {
  await new Promise((r) => setTimeout(r, 100));
}
const pendingAfter = loadState().alerts.filter((a) => a.status === "en_attente");
assert.strictEqual(pendingAfter.length, 0, "pas de double achat sur une paire déjà en position");
console.log("  ✅ Pas de doublon : aucune nouvelle alerte d'achat quand une position existe déjà");

// Seuil de confiance : manager à 68 → aucune alerte si le seuil exige 80
resetPortfolio(10000);
const s3 = loadState();
s3.config.pairs = ["BTC/USDT"];
s3.config.minConfidence = 80;
calls = [];
await runFullAnalysis();
for (let i = 0; i < 100 && loadState().analysisInProgress; i++) {
  await new Promise((r) => setTimeout(r, 100));
}
assert.strictEqual(
  loadState().alerts.filter((a) => a.status === "en_attente").length,
  0,
  "aucune alerte si la confiance du manager (68) est sous le seuil (80)"
);
console.log("  ✅ Seuil de confiance respecté : pas d'alerte sous le seuil configuré");

// Plafond d'exposition : une position existante consomme déjà du budget de
// risque → le nouveau plan doit être bloqué (risque cumulé > plafond)
resetPortfolio(10000);
const s4 = loadState();
s4.config.pairs = ["BTC/USDT"];
s4.config.minConfidence = 0;
s4.config.maxTotalRiskPct = 1; // plafond : 100 USDT de risque cumulé
s4.portfolio.cash -= 1000;
s4.portfolio.positions.push({
  id: "expo-pipe", pair: "ETH/USDT", qty: 1, entry: 1000, stopLoss: 950,
  lastPrice: 1000, riskAtOpen: 50, openedAt: new Date().toISOString()
}); // 50 USDT déjà en risque + nouveau plan ~80 USDT > 100 → blocage attendu
await runFullAnalysis();
for (let i = 0; i < 100 && loadState().analysisInProgress; i++) {
  await new Promise((r) => setTimeout(r, 100));
}
const stateExpo = loadState();
assert.strictEqual(
  stateExpo.alerts.filter((a) => a.status === "en_attente").length,
  0,
  "aucune alerte quand le plafond d'exposition est atteint"
);
assert.ok(
  stateExpo.reports["BTC/USDT"].expositionBloquee,
  "le rapport doit expliquer pourquoi l'alerte a été bloquée"
);
console.log("  ✅ Plafond d'exposition corrélée : alerte bloquée et motif tracé dans le rapport");

// Calibration : avec un historique de trades, le manager reçoit son bilan
resetPortfolio(10000);
const s5 = loadState();
s5.config.pairs = ["BTC/USDT"];
s5.config.minConfidence = 0;
s5.config.maxTotalRiskPct = 100;
s5.portfolio.closedTrades = [
  { pnl: 100, confiance: 85 }, { pnl: -50, confiance: 85 }, { pnl: 60, confiance: 70 },
  { pnl: -30, confiance: 70 }, { pnl: 40, confiance: 55 }, { pnl: -20, confiance: 55 }
];
calls = [];
await runFullAnalysis();
for (let i = 0; i < 100 && loadState().analysisInProgress; i++) {
  await new Promise((r) => setTimeout(r, 100));
}
const managerCall = calls.find((c) => c.system.includes("chef d'orchestre"));
assert.ok(
  managerCall.messages[0].content.includes("Ton bilan de décisions passées"),
  "le manager doit recevoir son bilan de calibration"
);
console.log("  ✅ Calibration : le manager reçoit le bilan de ses décisions passées");

// Agent 5 — Coach : analyse structurée de l'historique
const { runDataAnalystAgent } = await import("../src/agents.js");
const s6 = loadState();
const coach = await runDataAnalystAgent({
  trades: s6.portfolio.closedTrades,
  performance: { nbTrades: 6, winRatePct: 50 },
  config: s6.config
});
assert.ok(Array.isArray(coach.diagnostics) && coach.diagnostics.length > 0);
assert.strictEqual(coach.recommandationsReglages[0].parametre, "atrStopMultiplier");
assert.ok(coach.fiabiliteAnalyse.length > 0, "l'honnêteté statistique doit être présente");
console.log("  ✅ Agent 5 (Coach) : rapport structuré avec recommandations de réglages");

resetPortfolio(10000);
await new Promise((r) => setTimeout(r, 500));
console.log("\nPipeline complet : tous les contrôles réussis ✅");
process.exit(0);
