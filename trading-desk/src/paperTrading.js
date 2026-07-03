// Moteur de paper trading : portefeuille fictif, prix réels.
// Chaque ordre d'achat/vente passe par une alerte à valider par l'humain.
import crypto from "crypto";
import { loadState, saveState } from "./store.js";
import { fetchPrice } from "./marketData.js";
import { marketBuy, marketSell, isBrokerConfigured } from "./broker.js";

function id() {
  return crypto.randomUUID().slice(0, 8);
}

function isLiveMode(s) {
  return s.config.tradingMode === "reel" && isBrokerConfigured();
}

// Hook déclenché à chaque nouvelle alerte (notifications Telegram, etc.)
const hooks = { onAlertCreated: null };
export function setAlertHook(fn) {
  hooks.onAlertCreated = fn;
}

export function createAlert(alert) {
  const s = loadState();
  const full = {
    id: id(),
    createdAt: new Date().toISOString(),
    status: "en_attente", // en_attente | validee | refusee | expiree
    ...alert
  };
  s.alerts.unshift(full);
  s.alerts = s.alerts.slice(0, 100);
  saveState();
  if (hooks.onAlertCreated) {
    Promise.resolve(hooks.onAlertCreated(full)).catch((e) =>
      console.error("Hook alerte :", e.message)
    );
  }
  return full;
}

export function getAlert(alertId) {
  return loadState().alerts.find((a) => a.id === alertId);
}

// Validation humaine d'une alerte → exécution au prix du marché actuel
export async function approveAlert(alertId) {
  const s = loadState();
  const alert = s.alerts.find((a) => a.id === alertId);
  if (!alert) throw new Error("Alerte introuvable.");
  if (alert.status !== "en_attente") throw new Error("Cette alerte a déjà été traitée.");

  const live = isLiveMode(s);
  const price = await fetchPrice(alert.pair);

  if (alert.type === "achat") {
    const plan = alert.plan;
    let qty = plan.quantite;
    let notional = qty * price;
    if (notional > s.portfolio.cash) {
      qty = s.portfolio.cash / price;
      notional = s.portfolio.cash;
    }
    if (notional < 5) throw new Error("Cash insuffisant pour exécuter cet ordre.");

    let entry = price;
    if (live) {
      // Exécution réelle : achat au marché pour le montant prévu
      const fill = await marketBuy(alert.pair, notional);
      qty = fill.qty;
      entry = fill.avgPrice ?? price;
      notional = fill.notional;
    }
    s.portfolio.cash -= notional;
    s.portfolio.positions.push({
      id: id(),
      pair: alert.pair,
      qty,
      entry,
      stopLoss: plan.stopLoss,
      takeProfit: plan.takeProfit,
      lastPrice: entry,
      openedAt: new Date().toISOString(),
      alertId: alert.id,
      confiance: alert.confiance,
      riskAtOpen: Math.round(qty * (entry - plan.stopLoss) * 100) / 100,
      live
    });
    alert.executedPrice = entry;
  } else if (alert.type === "vente") {
    const pos = s.portfolio.positions.find((p) => p.id === alert.positionId);
    if (!pos) throw new Error("La position à clôturer n'existe plus.");
    const exitPrice = await sellIfLive(pos, price);
    doClosePosition(s, pos, exitPrice, "vente validée");
    alert.executedPrice = exitPrice;
  }

  alert.status = "validee";
  alert.decidedAt = new Date().toISOString();
  saveState();
  return alert;
}

export function rejectAlert(alertId) {
  const s = loadState();
  const alert = s.alerts.find((a) => a.id === alertId);
  if (!alert) throw new Error("Alerte introuvable.");
  if (alert.status !== "en_attente") throw new Error("Cette alerte a déjà été traitée.");
  alert.status = "refusee";
  alert.decidedAt = new Date().toISOString();
  saveState();
  return alert;
}

// Vente réelle sur le broker si la position a été ouverte en mode réel
async function sellIfLive(pos, fallbackPrice) {
  if (!pos.live) return fallbackPrice;
  const fill = await marketSell(pos.pair, pos.qty);
  return fill.avgPrice ?? fallbackPrice;
}

function doClosePosition(s, pos, price, reason) {
  const proceeds = pos.qty * price;
  const pnl = proceeds - pos.qty * pos.entry;
  s.portfolio.cash += proceeds;
  s.portfolio.positions = s.portfolio.positions.filter((p) => p.id !== pos.id);
  s.portfolio.closedTrades.unshift({
    ...pos,
    exitPrice: price,
    pnl: Math.round(pnl * 100) / 100,
    pnlPct: Math.round(((price - pos.entry) / pos.entry) * 10000) / 100,
    closedAt: new Date().toISOString(),
    reason
  });
  s.portfolio.closedTrades = s.portfolio.closedTrades.slice(0, 200);
}

// Clôture manuelle depuis l'interface
export async function closePositionManually(positionId) {
  const s = loadState();
  const pos = s.portfolio.positions.find((p) => p.id === positionId);
  if (!pos) throw new Error("Position introuvable.");
  const price = await fetchPrice(pos.pair);
  const exitPrice = await sellIfLive(pos, price);
  doClosePosition(s, pos, exitPrice, "clôture manuelle");
  saveState();
}

// Surveillance des positions : stop-loss et take-profit.
// Ces niveaux font partie de l'ordre validé par l'humain → exécution automatique.
export async function monitorPositions() {
  const s = loadState();
  for (const pos of [...s.portfolio.positions]) {
    try {
      const price = await fetchPrice(pos.pair);
      pos.lastPrice = price;
      if (price <= pos.stopLoss) {
        const exitPrice = await sellIfLive(pos, price);
        doClosePosition(s, pos, exitPrice, "stop-loss touché");
      } else if (price >= pos.takeProfit) {
        const exitPrice = await sellIfLive(pos, price);
        doClosePosition(s, pos, exitPrice, "take-profit atteint");
      }
    } catch (err) {
      // prix ou broker momentanément indisponible : nouvel essai au tick suivant
      console.error(`Surveillance ${pos.pair} :`, err.message);
    }
  }
  saveState();
}

// Les alertes non traitées deviennent obsolètes : le prix a bougé depuis l'analyse
export function expireOldAlerts(maxAgeHours = 6) {
  const s = loadState();
  const cutoff = Date.now() - maxAgeHours * 3600e3;
  let changed = false;
  for (const a of s.alerts) {
    if (a.status === "en_attente" && new Date(a.createdAt).getTime() < cutoff) {
      a.status = "expiree";
      changed = true;
    }
  }
  if (changed) saveState();
}

export function portfolioSummary() {
  const s = loadState();
  const positionsValue = s.portfolio.positions.reduce(
    (sum, p) => sum + p.qty * (p.lastPrice || p.entry),
    0
  );
  const total = s.portfolio.cash + positionsValue;
  const realized = s.portfolio.closedTrades.reduce((sum, t) => sum + t.pnl, 0);
  return {
    cash: Math.round(s.portfolio.cash * 100) / 100,
    positionsValue: Math.round(positionsValue * 100) / 100,
    total: Math.round(total * 100) / 100,
    initialCapital: s.config.initialCapital,
    pnlTotal: Math.round((total - s.config.initialCapital) * 100) / 100,
    pnlPct:
      Math.round(((total - s.config.initialCapital) / s.config.initialCapital) * 10000) / 100,
    pnlRealise: Math.round(realized * 100) / 100
  };
}
