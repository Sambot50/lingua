// Journal de performance : statistiques calculées sur les trades clôturés
// et sur l'historique des alertes. Sert à évaluer la qualité des signaux
// des agents avant d'envisager (ou d'ajuster) le trading réel.
import { loadState } from "./store.js";

const r2 = (v) => Math.round(v * 100) / 100;

export function computePerformance() {
  const s = loadState();
  const trades = s.portfolio.closedTrades;
  const alerts = s.alerts;

  const alertStats = {
    proposees: alerts.length,
    validees: alerts.filter((a) => a.status === "validee").length,
    refusees: alerts.filter((a) => a.status === "refusee").length,
    expirees: alerts.filter((a) => a.status === "expiree").length,
    enAttente: alerts.filter((a) => a.status === "en_attente").length
  };

  if (trades.length === 0) {
    return { nbTrades: 0, alertStats };
  }

  const winners = trades.filter((t) => t.pnl > 0);
  const losers = trades.filter((t) => t.pnl <= 0);
  const grossGain = winners.reduce((a, t) => a + t.pnl, 0);
  const grossLoss = Math.abs(losers.reduce((a, t) => a + t.pnl, 0));
  const pnlTotal = grossGain - grossLoss;

  // Multiple de R : gain/perte rapporté au risque initial pris sur le trade
  const rMultiples = trades
    .map((t) => {
      const risk = t.riskAtOpen ?? (t.stopLoss ? t.qty * (t.entry - t.stopLoss) : null);
      return risk && risk > 0 ? t.pnl / risk : null;
    })
    .filter((v) => v !== null);

  // Drawdown maximal sur la courbe de P&L réalisé
  let peak = 0;
  let equity = 0;
  let maxDrawdown = 0;
  for (const t of [...trades].reverse()) { // du plus ancien au plus récent
    equity += t.pnl;
    peak = Math.max(peak, equity);
    maxDrawdown = Math.max(maxDrawdown, peak - equity);
  }

  // Calibration du manager : confiance moyenne sur les trades gagnants vs perdants
  const conf = (list) => {
    const vals = list.map((t) => t.confiance).filter((c) => Number.isFinite(c));
    return vals.length ? r2(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
  };

  const parPaire = {};
  for (const t of trades) {
    parPaire[t.pair] ??= { nb: 0, gagnants: 0, pnl: 0 };
    parPaire[t.pair].nb++;
    if (t.pnl > 0) parPaire[t.pair].gagnants++;
    parPaire[t.pair].pnl = r2(parPaire[t.pair].pnl + t.pnl);
  }

  const parMotif = {};
  for (const t of trades) {
    parMotif[t.reason] ??= { nb: 0, pnl: 0 };
    parMotif[t.reason].nb++;
    parMotif[t.reason].pnl = r2(parMotif[t.reason].pnl + t.pnl);
  }

  return {
    nbTrades: trades.length,
    gagnants: winners.length,
    perdants: losers.length,
    winRatePct: r2((winners.length / trades.length) * 100),
    pnlTotal: r2(pnlTotal),
    profitFactor: grossLoss > 0 ? r2(grossGain / grossLoss) : null,
    gainMoyen: winners.length ? r2(grossGain / winners.length) : 0,
    perteMoyenne: losers.length ? r2(-grossLoss / losers.length) : 0,
    esperanceParTrade: r2(pnlTotal / trades.length),
    rMoyen: rMultiples.length
      ? r2(rMultiples.reduce((a, b) => a + b, 0) / rMultiples.length)
      : null,
    maxDrawdown: r2(maxDrawdown),
    maxDrawdownPct: r2((maxDrawdown / s.config.initialCapital) * 100),
    meilleurTrade: r2(Math.max(...trades.map((t) => t.pnl))),
    pireTrade: r2(Math.min(...trades.map((t) => t.pnl))),
    confianceMoyenneGagnants: conf(winners),
    confianceMoyennePerdants: conf(losers),
    parPaire,
    parMotif,
    alertStats
  };
}
