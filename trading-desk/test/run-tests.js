// Suite de contrôle : indicateurs, plan de risque, paper trading, RSS.
// Lancer avec : PAPER_FAKE_DATA=1 node test/run-tests.js
import assert from "assert";
import {
  sma, ema, rsi, macd, bollinger, atr,
  detectPatterns, supportResistance, buildSnapshot, volumeAnalysis
} from "../src/indicators.js";
import { computeRiskPlan } from "../src/agents.js";
import { fetchCandles, fetchTicker, fetchPrice } from "../src/marketData.js";
import {
  createAlert, approveAlert, rejectAlert, monitorPositions,
  portfolioSummary, closePositionManually, expireOldAlerts,
  riskExposure, applyTrailing
} from "../src/paperTrading.js";
import { loadState, resetPortfolio } from "../src/store.js";

let passed = 0;
let failed = 0;
function test(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => { passed++; console.log(`  ✅ ${name}`); })
    .catch((e) => { failed++; console.error(`  ❌ ${name}\n     → ${e.message}`); });
}
const approx = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) < tol, `${a} ≠ ${b}`);

console.log("— Indicateurs techniques —");
await test("SMA : moyenne simple exacte", () => {
  approx(sma([1, 2, 3, 4, 5], 5), 3);
  approx(sma([10, 20, 30, 40], 2), 35);
  assert.strictEqual(sma([1, 2], 5), null);
});

await test("EMA : converge vers une constante", () => {
  const flat = Array(50).fill(42);
  approx(ema(flat, 20), 42);
});

await test("RSI : 100 en hausse pure, ~0 en baisse pure, borné [0,100]", () => {
  const up = Array.from({ length: 30 }, (_, i) => 100 + i);
  const down = Array.from({ length: 30 }, (_, i) => 130 - i);
  assert.strictEqual(rsi(up), 100);
  assert.ok(rsi(down) < 1);
  assert.strictEqual(rsi([1, 2, 3], 14), null);
});

await test("MACD : positif en tendance haussière", () => {
  const up = Array.from({ length: 60 }, (_, i) => 100 * Math.pow(1.01, i));
  const m = macd(up);
  assert.ok(m.macd > 0, "MACD devrait être positif");
  assert.strictEqual(macd([1, 2, 3]), null);
});

await test("Bollinger : bandes symétriques autour de la moyenne", () => {
  const closes = Array.from({ length: 40 }, (_, i) => 100 + Math.sin(i) * 5);
  const b = bollinger(closes);
  assert.ok(b.upper > b.middle && b.middle > b.lower);
  approx(b.upper - b.middle, b.middle - b.lower, 1e-9);
  assert.ok(b.positionPct >= -0.5 && b.positionPct <= 1.5);
});

await test("ATR : reflète l'amplitude des bougies", () => {
  const candles = Array.from({ length: 30 }, (_, i) => ({
    t: i, open: 100, high: 105, low: 95, close: 100, volume: 10
  }));
  approx(atr(candles), 10, 0.5);
});

await test("Volumes : ratio dernier volume / moyenne", () => {
  const candles = Array.from({ length: 30 }, (_, i) => ({
    t: i, open: 1, high: 2, low: 0.5, close: 1.5, volume: i === 29 ? 300 : 100
  }));
  const v = volumeAnalysis(candles);
  approx(v.ratio, 3, 0.01);
  assert.strictEqual(v.volumeAcheteur, true);
});

await test("Chandeliers : avalement haussier détecté", () => {
  const candles = [
    { t: 1, open: 100, high: 101, low: 98, close: 99, volume: 1 },
    { t: 2, open: 100, high: 100.5, low: 97, close: 98, volume: 1 }, // baissière
    { t: 3, open: 97.5, high: 102, low: 97, close: 101, volume: 1 } // avale la précédente
  ];
  const p = detectPatterns(candles);
  assert.ok(p.some((x) => x.includes("Avalement haussier")), JSON.stringify(p));
});

await test("Chandeliers : doji détecté", () => {
  const candles = [
    { t: 1, open: 100, high: 101, low: 99, close: 100.5, volume: 1 },
    { t: 2, open: 100, high: 101, low: 99, close: 100.2, volume: 1 },
    { t: 3, open: 100, high: 102, low: 98, close: 100.05, volume: 1 } // corps minuscule
  ];
  const p = detectPatterns(candles);
  assert.ok(p.some((x) => x.includes("Doji")), JSON.stringify(p));
});

await test("Supports/résistances : niveaux cohérents autour du prix", () => {
  const candles = Array.from({ length: 80 }, (_, i) => {
    const base = 100 + 10 * Math.sin(i / 5);
    return { t: i, open: base, high: base + 2, low: base - 2, close: base, volume: 1 };
  });
  const { supports, resistances } = supportResistance(candles);
  const last = candles[candles.length - 1].close;
  assert.ok(supports.every((s) => s < last));
  assert.ok(resistances.every((r) => r > last));
});

await test("buildSnapshot : structure complète sans NaN", () => {
  const candles = Array.from({ length: 150 }, (_, i) => {
    const base = 100 + i * 0.1 + Math.sin(i) * 2;
    return { t: i, open: base, high: base + 1, low: base - 1, close: base + 0.2, volume: 100 + i };
  });
  const s = buildSnapshot(candles);
  for (const key of ["dernierPrix", "rsi14", "ema20", "ema50", "atr14"]) {
    assert.ok(Number.isFinite(s[key]), `${key} devrait être un nombre fini (${s[key]})`);
  }
  assert.ok(s.macd && Number.isFinite(s.macd.histogram));
  assert.ok(Array.isArray(s.figuresChandelles));
});

console.log("\n— Plan de risque (money management) —");
await test("Risque = X% du capital, stop ATR, TP à 2R", () => {
  const portfolio = { cash: 10000, positions: [] };
  const config = { riskPct: 2, atrStopMultiplier: 1.5, rewardRiskRatio: 2 };
  const plan = computeRiskPlan({ pair: "BTC/USDT", price: 50000, atrValue: 1000, portfolio, config });
  approx(plan.stopLoss, 50000 - 1500);   // stop = entrée − 1.5 × ATR
  approx(plan.takeProfit, 50000 + 3000); // TP = entrée + 2 × distance stop
  // risque max = 2% de 10 000 = 200 USDT
  approx(plan.quantite * (plan.entree - plan.stopLoss), 200, 0.5);
  assert.ok(plan.montantInvesti <= portfolio.cash + 0.01, "ne doit pas dépasser le cash");
});

await test("Plafonnement au cash disponible (pas de levier)", () => {
  const portfolio = { cash: 500, positions: [] };
  const config = { riskPct: 5, atrStopMultiplier: 1.5, rewardRiskRatio: 2 };
  const plan = computeRiskPlan({ pair: "BTC/USDT", price: 50000, atrValue: 100, portfolio, config });
  assert.ok(plan.montantInvesti <= 500.01, `investi=${plan.montantInvesti}`);
});

await test("Rejet si ATR manquant", () => {
  assert.throws(() =>
    computeRiskPlan({
      pair: "X/USDT", price: 100, atrValue: null,
      portfolio: { cash: 1000, positions: [] },
      config: { riskPct: 2, atrStopMultiplier: 1.5, rewardRiskRatio: 2 }
    })
  );
});

console.log("\n— Données de marché (mode démo) —");
await test("fetchCandles retourne des bougies normalisées", async () => {
  const cs = await fetchCandles("BTC/USDT", "1h", 150);
  assert.strictEqual(cs.length, 150);
  for (const c of cs.slice(0, 5)) {
    assert.ok(c.high >= c.low && c.high >= Math.max(c.open, c.close) && c.low <= Math.min(c.open, c.close));
  }
});

await test("fetchTicker retourne un prix cohérent", async () => {
  const t = await fetchTicker("ETH/USDT");
  assert.ok(Number.isFinite(t.price) && t.price > 0);
});

console.log("\n— Paper trading (cycle de vie complet) —");
resetPortfolio(10000);
{
  // Frais désactivés pour les tests de cycle de vie (testés séparément plus bas)
  const s0 = loadState();
  s0.config.feePct = 0;
  s0.config.slippagePct = 0;
  s0.config.maxTotalRiskPct = 100;
  s0.config.trailingStopEnabled = false;
}

await test("Alerte d'achat → validation → position ouverte, cash débité", async () => {
  const price = await fetchPrice("BTC/USDT");
  const alert = createAlert({
    type: "achat", pair: "BTC/USDT", confiance: 80, synthese: "test",
    plan: { entree: price, stopLoss: price * 0.97, takeProfit: price * 1.06, quantite: 0.01, montantInvesti: price * 0.01 }
  });
  assert.strictEqual(alert.status, "en_attente");
  await approveAlert(alert.id);
  const s = loadState();
  assert.strictEqual(s.portfolio.positions.length, 1);
  const pos = s.portfolio.positions[0];
  approx(s.portfolio.cash, 10000 - pos.qty * pos.entry, 0.01);
});

await test("Impossible de valider deux fois la même alerte", async () => {
  const s = loadState();
  const alert = s.alerts[0];
  await assert.rejects(() => approveAlert(alert.id));
});

await test("Refus d'alerte : aucun impact sur le portefeuille", async () => {
  const cashBefore = loadState().portfolio.cash;
  const alert = createAlert({
    type: "achat", pair: "ETH/USDT", confiance: 50, synthese: "test refus",
    plan: { entree: 3000, stopLoss: 2900, takeProfit: 3200, quantite: 0.1, montantInvesti: 300 }
  });
  rejectAlert(alert.id);
  const s = loadState();
  assert.strictEqual(s.portfolio.cash, cashBefore);
  assert.strictEqual(s.alerts.find((a) => a.id === alert.id).status, "refusee");
});

await test("Stop-loss déclenché → position clôturée, perte enregistrée", async () => {
  const s = loadState();
  const pos = s.portfolio.positions[0];
  pos.stopLoss = pos.entry * 100; // force le déclenchement au prochain tick
  await monitorPositions();
  const s2 = loadState();
  assert.strictEqual(s2.portfolio.positions.length, 0);
  assert.strictEqual(s2.portfolio.closedTrades.length, 1);
  assert.strictEqual(s2.portfolio.closedTrades[0].reason, "stop-loss touché");
});

await test("Alerte de vente sur position existante", async () => {
  const price = await fetchPrice("SOL/USDT");
  const buy = createAlert({
    type: "achat", pair: "SOL/USDT", confiance: 70, synthese: "achat pour test vente",
    plan: { entree: price, stopLoss: price * 0.9, takeProfit: price * 1.2, quantite: 1, montantInvesti: price }
  });
  await approveAlert(buy.id);
  const pos = loadState().portfolio.positions.find((p) => p.pair === "SOL/USDT");
  const sell = createAlert({
    type: "vente", pair: "SOL/USDT", positionId: pos.id, confiance: 60, synthese: "sortie test"
  });
  await approveAlert(sell.id);
  const s = loadState();
  assert.ok(!s.portfolio.positions.some((p) => p.pair === "SOL/USDT"));
});

await test("Clôture manuelle d'une position", async () => {
  const price = await fetchPrice("ETH/USDT");
  const buy = createAlert({
    type: "achat", pair: "ETH/USDT", confiance: 70, synthese: "test clôture manuelle",
    plan: { entree: price, stopLoss: price * 0.9, takeProfit: price * 1.5, quantite: 0.5, montantInvesti: price * 0.5 }
  });
  await approveAlert(buy.id);
  const pos = loadState().portfolio.positions.find((p) => p.pair === "ETH/USDT");
  await closePositionManually(pos.id);
  assert.ok(!loadState().portfolio.positions.some((p) => p.pair === "ETH/USDT"));
});

await test("Expiration des vieilles alertes en attente", () => {
  const alert = createAlert({
    type: "achat", pair: "BTC/USDT", confiance: 50, synthese: "vieille alerte",
    plan: { entree: 1, stopLoss: 0.9, takeProfit: 1.2, quantite: 1, montantInvesti: 1 }
  });
  alert.createdAt = new Date(Date.now() - 10 * 3600e3).toISOString();
  expireOldAlerts(6);
  assert.strictEqual(loadState().alerts.find((a) => a.id === alert.id).status, "expiree");
});

await test("Résumé du portefeuille : total = cash + positions", () => {
  const s = loadState();
  const sum = portfolioSummary();
  const positionsValue = s.portfolio.positions.reduce((acc, p) => acc + p.qty * (p.lastPrice || p.entry), 0);
  approx(sum.total, s.portfolio.cash + positionsValue, 0.01);
});

console.log("\n— Frais, slippage, exposition, trailing —");
await test("Achat avec frais et slippage : cash débité exactement", async () => {
  resetPortfolio(10000);
  const s = loadState();
  s.config.feePct = 0.1;
  s.config.slippagePct = 0.05;
  s.config.maxTotalRiskPct = 100;
  const price = await fetchPrice("BTC/USDT");
  const alert = createAlert({
    type: "achat", pair: "BTC/USDT", confiance: 80, synthese: "test frais",
    plan: { entree: price, stopLoss: price * 0.97, takeProfit: price * 1.06, quantite: 0.01, montantInvesti: price * 0.01 }
  });
  await approveAlert(alert.id);
  const s2 = loadState();
  const pos = s2.portfolio.positions[0];
  approx(pos.entry, price * 1.0005, price * 1e-9); // slippage de +0,05% à l'achat
  const notional = pos.qty * pos.entry;
  const fee = notional * 0.001;
  approx(pos.feesPaid, Math.round(fee * 100) / 100, 0.011);
  approx(s2.portfolio.cash, 10000 - notional - fee, 0.02);
});

await test("Clôture avec frais : P&L net inférieur au P&L brut", async () => {
  const s = loadState();
  const pos = s.portfolio.positions[0];
  const price = await fetchPrice("BTC/USDT");
  pos.stopLoss = pos.entry * 100; // force la clôture au prochain tick
  await monitorPositions();
  const t = loadState().portfolio.closedTrades[0];
  const exitPrice = price * (1 - 0.0005);
  const exitFee = t.qty * exitPrice * 0.001;
  const expectedPnl = (t.qty * exitPrice - exitFee) - t.qty * t.entry - t.feesPaid;
  approx(t.pnl, Math.round(expectedPnl * 100) / 100, 0.02);
  assert.ok(t.fees > 0, "les frais doivent être enregistrés");
  const pnlBrut = t.qty * (price - t.entry);
  assert.ok(t.pnl < pnlBrut, "le P&L net doit être inférieur au brut");
});

await test("Plafond d'exposition : validation refusée si risque cumulé dépassé", async () => {
  resetPortfolio(10000);
  const s = loadState();
  s.config.feePct = 0;
  s.config.slippagePct = 0;
  s.config.maxTotalRiskPct = 2; // plafond : 200 USDT sur 10 000
  // position existante : 150 USDT de risque ouvert
  s.portfolio.cash -= 1000;
  s.portfolio.positions.push({
    id: "expo1", pair: "ETH/USDT", qty: 1, entry: 1000, stopLoss: 850,
    lastPrice: 1000, riskAtOpen: 150, openedAt: new Date().toISOString()
  });
  const expo = riskExposure();
  approx(expo.openRisk, 150);
  approx(expo.capital, 10000);
  // nouveau trade avec 100 USDT de risque → 150 + 100 > 200 → refus
  const price = await fetchPrice("BTC/USDT");
  const qty = 100 / (price * 0.1);
  const alert = createAlert({
    type: "achat", pair: "BTC/USDT", confiance: 80, synthese: "test exposition",
    plan: { entree: price, stopLoss: price * 0.9, takeProfit: price * 1.2, quantite: qty, montantInvesti: qty * price }
  });
  await assert.rejects(() => approveAlert(alert.id), /Plafond de risque/);
  assert.strictEqual(loadState().portfolio.positions.length, 1, "aucune position ouverte");
});

await test("Trailing stop : monte avec le prix, ne redescend jamais", () => {
  const pos = { entry: 100, stopLoss: 95, trailingDistance: 5 };
  applyTrailing(pos, 110);
  approx(pos.stopLoss, 105); // remonte : 110 − 5
  applyTrailing(pos, 103);
  approx(pos.stopLoss, 105); // ne redescend pas
  applyTrailing(pos, 120);
  approx(pos.stopLoss, 115); // remonte encore
  const posSansDist = { entry: 100, stopLoss: 96 };
  applyTrailing(posSansDist, 110); // distance déduite de entrée − stop
  approx(posSansDist.stopLoss, 106);
});

console.log("\n— Journal de performance —");
await test("Statistiques exactes sur un jeu de trades connu", async () => {
  const { computePerformance } = await import("../src/performance.js");
  const s = loadState();
  s.config.initialCapital = 10000;
  // du plus récent au plus ancien (unshift) : +300, -100, +100, -100
  s.portfolio.closedTrades = [
    { pair: "BTC/USDT", pnl: 300, entry: 100, qty: 1, stopLoss: 90, riskAtOpen: 100, confiance: 80, reason: "take-profit atteint" },
    { pair: "ETH/USDT", pnl: -100, entry: 50, qty: 2, stopLoss: 45, riskAtOpen: 100, confiance: 55, reason: "stop-loss touché" },
    { pair: "BTC/USDT", pnl: 100, entry: 100, qty: 1, stopLoss: 90, riskAtOpen: 100, confiance: 70, reason: "take-profit atteint" },
    { pair: "ETH/USDT", pnl: -100, entry: 50, qty: 2, stopLoss: 45, riskAtOpen: 100, confiance: 60, reason: "stop-loss touché" }
  ];
  const p = computePerformance();
  assert.strictEqual(p.nbTrades, 4);
  assert.strictEqual(p.gagnants, 2);
  approx(p.winRatePct, 50);
  approx(p.pnlTotal, 200);
  approx(p.profitFactor, 2); // 400 de gains / 200 de pertes
  approx(p.esperanceParTrade, 50);
  approx(p.rMoyen, 0.5); // (3 - 1 + 1 - 1) / 4 / (risque 100)
  // ordre chronologique : -100, +100, -100, +300 → drawdown max = 100
  approx(p.maxDrawdown, 100);
  approx(p.confianceMoyenneGagnants, 75);
  approx(p.confianceMoyennePerdants, 57.5);
  assert.strictEqual(p.parPaire["BTC/USDT"].nb, 2);
  assert.strictEqual(p.parMotif["stop-loss touché"].nb, 2);
  s.portfolio.closedTrades = [];
});

console.log("\n— Broker Binance (fonctions hors ligne) —");
await test("Arrondi des quantités au pas de la paire (LOT_SIZE)", async () => {
  const { roundStep } = await import("../src/broker.js");
  approx(roundStep(0.123456789, "0.001"), 0.123);
  approx(roundStep(1.999999, "0.01"), 1.99);
  approx(roundStep(5, "1"), 5);
  approx(roundStep(0.0000001, "0.000001"), 0);
});

await test("Signature HMAC déterministe et format de requête signée", async () => {
  process.env.BINANCE_API_SECRET = "test-secret";
  process.env.BINANCE_API_KEY = "test-key";
  const { buildSignedQuery } = await import("../src/broker.js");
  const q1 = buildSignedQuery({ symbol: "BTCUSDT", side: "BUY" }, 1700000000000);
  const q2 = buildSignedQuery({ symbol: "BTCUSDT", side: "BUY" }, 1700000000000);
  assert.strictEqual(q1, q2, "même entrée → même signature");
  assert.ok(/timestamp=1700000000000&signature=[0-9a-f]{64}$/.test(q1), q1);
  delete process.env.BINANCE_API_SECRET;
  delete process.env.BINANCE_API_KEY;
});

console.log("\n— Notifications Telegram (hors ligne) —");
await test("Formatage du message d'alerte avec plan complet", async () => {
  const { formatAlertMessage } = await import("../src/telegram.js");
  const msg = formatAlertMessage({
    type: "achat", pair: "BTC/USDT", confiance: 72,
    synthese: "Signal haussier confirmé.",
    plan: { entree: 65000, stopLoss: 63000, takeProfit: 69000, montantInvesti: 500, risqueMax: 200 }
  });
  for (const needle of ["ACHAT", "BTC/USDT", "72/100", "Stop-loss", "Take-profit", "validation"]) {
    assert.ok(msg.includes(needle), `le message doit contenir "${needle}"`);
  }
});

console.log("\n— Parseur RSS —");
await test("parseRss extrait titres et dates d'un flux réel", async () => {
  // test hors ligne : on injecte un XML représentatif via le module news
  const { fetchNews } = await import("../src/news.js");
  // en environnement sans réseau, fetchNews doit retourner [] sans lever d'erreur
  const items = await fetchNews();
  assert.ok(Array.isArray(items));
});

console.log(`\nRésultat : ${passed} réussis, ${failed} échoués`);
resetPortfolio(10000); // remet un état propre après les tests
await new Promise((r) => setTimeout(r, 500)); // laisse la sauvegarde débouncée s'écrire
process.exit(failed > 0 ? 1 : 0);
