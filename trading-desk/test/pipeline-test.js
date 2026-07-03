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
console.log("  ✅ Alerte d'achat créée, en attente de validation humaine");

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

resetPortfolio(10000);
await new Promise((r) => setTimeout(r, 500));
console.log("\nPipeline complet : tous les contrôles réussis ✅");
process.exit(0);
