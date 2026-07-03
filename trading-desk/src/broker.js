// Connecteur Binance Spot — exécution réelle des ordres validés.
// ⚠️ Par défaut, ce connecteur pointe sur le TESTNET Binance (argent fictif,
// vraie API) : https://testnet.binance.vision
// Pour passer en production : BINANCE_LIVE=1 (à tes risques et périls).
//
// Clés API : variables d'environnement BINANCE_API_KEY et BINANCE_API_SECRET.
// Les stop-loss / take-profit restent surveillés par ce serveur (vente au
// marché quand le niveau est touché) : le serveur doit donc rester allumé.
import crypto from "crypto";

const LIVE = process.env.BINANCE_LIVE === "1";
const BASE = LIVE ? "https://api.binance.com" : "https://testnet.binance.vision";

export function isBrokerConfigured() {
  return Boolean(process.env.BINANCE_API_KEY && process.env.BINANCE_API_SECRET);
}

export function brokerInfo() {
  return {
    configured: isBrokerConfigured(),
    live: LIVE,
    endpoint: BASE
  };
}

function sign(queryString) {
  return crypto
    .createHmac("sha256", process.env.BINANCE_API_SECRET)
    .update(queryString)
    .digest("hex");
}

// Exportée pour les tests : arrondi d'une quantité au pas (stepSize) de la paire
export function roundStep(qty, stepSize) {
  const step = parseFloat(stepSize);
  if (!step || step <= 0) return qty;
  const precision = Math.max(0, Math.round(-Math.log10(step)));
  return parseFloat((Math.floor(qty / step) * step).toFixed(precision));
}

// Exportée pour les tests : construction de la requête signée
export function buildSignedQuery(params, timestamp = Date.now()) {
  const qs = new URLSearchParams({ ...params, timestamp: String(timestamp) }).toString();
  return `${qs}&signature=${sign(qs)}`;
}

async function signedRequest(method, path, params = {}) {
  if (!isBrokerConfigured()) {
    throw new Error("Broker non configuré : définis BINANCE_API_KEY et BINANCE_API_SECRET.");
  }
  const query = buildSignedQuery(params);
  const url = `${BASE}${path}?${query}`;
  const res = await fetch(url, {
    method,
    headers: { "X-MBX-APIKEY": process.env.BINANCE_API_KEY }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Binance ${res.status} : ${data.msg || JSON.stringify(data)}`);
  }
  return data;
}

async function publicRequest(path, params = {}) {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${BASE}${path}${qs ? `?${qs}` : ""}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Binance ${res.status} : ${data.msg || "erreur"}`);
  return data;
}

const filtersCache = new Map();
async function getSymbolFilters(symbol) {
  if (filtersCache.has(symbol)) return filtersCache.get(symbol);
  const info = await publicRequest("/api/v3/exchangeInfo", { symbol });
  const sym = info.symbols?.[0];
  if (!sym) throw new Error(`Paire ${symbol} inconnue sur Binance.`);
  const lot = sym.filters.find((f) => f.filterType === "LOT_SIZE") || {};
  const notional = sym.filters.find((f) => f.filterType === "NOTIONAL") || {};
  const out = {
    stepSize: lot.stepSize || "0.000001",
    minQty: parseFloat(lot.minQty || "0"),
    minNotional: parseFloat(notional.minNotional || "0")
  };
  filtersCache.set(symbol, out);
  return out;
}

function toSymbol(pair) {
  return pair.replace("/", "");
}

// Solde disponible d'un actif (ex. "USDT")
export async function getBalance(asset = "USDT") {
  const account = await signedRequest("GET", "/api/v3/account");
  const bal = account.balances?.find((b) => b.asset === asset);
  return bal ? parseFloat(bal.free) : 0;
}

// Achat au marché pour un montant en USDT — retourne la quantité et le prix moyen exécutés
export async function marketBuy(pair, quoteAmount) {
  const symbol = toSymbol(pair);
  const order = await signedRequest("POST", "/api/v3/order", {
    symbol,
    side: "BUY",
    type: "MARKET",
    quoteOrderQty: quoteAmount.toFixed(2),
    newOrderRespType: "FULL"
  });
  return parseFills(order);
}

// Vente au marché d'une quantité — retourne la quantité et le prix moyen exécutés
export async function marketSell(pair, qty) {
  const symbol = toSymbol(pair);
  const { stepSize, minQty, minNotional } = await getSymbolFilters(symbol);
  const rounded = roundStep(qty, stepSize);
  if (rounded < minQty) {
    throw new Error(`Quantité ${qty} inférieure au minimum Binance (${minQty}).`);
  }
  const order = await signedRequest("POST", "/api/v3/order", {
    symbol,
    side: "SELL",
    type: "MARKET",
    quantity: String(rounded),
    newOrderRespType: "FULL"
  });
  const res = parseFills(order);
  if (res.notional < minNotional) {
    // ordre passé malgré tout : information seulement
  }
  return res;
}

function parseFills(order) {
  const fills = order.fills || [];
  const qty = fills.reduce((s, f) => s + parseFloat(f.qty), 0) || parseFloat(order.executedQty || 0);
  const notional =
    fills.reduce((s, f) => s + parseFloat(f.qty) * parseFloat(f.price), 0) ||
    parseFloat(order.cummulativeQuoteQty || 0);
  return {
    orderId: order.orderId,
    qty,
    notional,
    avgPrice: qty > 0 ? notional / qty : null
  };
}
