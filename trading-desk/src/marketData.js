// Données de marché temps réel — sources publiques gratuites.
// Source primaire : Binance. Repli automatique : Crypto.com Exchange.
// Mode démo : PAPER_FAKE_DATA=1 génère des données synthétiques (tests hors ligne).

const FAKE = process.env.PAPER_FAKE_DATA === "1";
const BINANCE = "https://api.binance.com/api/v3";
const CRYPTOCOM = "https://api.crypto.com/exchange/v1/public";

function binanceSymbol(pair) {
  return pair.replace("/", "");
}
function cryptocomSymbol(pair) {
  return pair.replace("/", "_");
}

async function fetchJson(url, timeoutMs = 12000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status} sur ${url}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// --- Générateur synthétique (mode démo / tests hors ligne) ---
const fakeBase = { "BTC/USDT": 65000, "ETH/USDT": 3200, "SOL/USDT": 150 };
function seededRandom(seed) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}
function fakeCandles(pair, interval, limit) {
  const base = fakeBase[pair] || 100;
  const stepMs = interval === "4h" ? 4 * 3600e3 : interval === "1d" ? 24 * 3600e3 : 3600e3;
  const rand = seededRandom(pair.length * 1000 + stepMs / 1e5);
  const out = [];
  let price = base;
  const now = Date.now();
  for (let i = limit; i > 0; i--) {
    const drift = (rand() - 0.48) * 0.01 * price;
    const open = price;
    const close = price + drift;
    const high = Math.max(open, close) * (1 + rand() * 0.004);
    const low = Math.min(open, close) * (1 - rand() * 0.004);
    out.push({
      t: now - i * stepMs,
      open, high, low, close,
      volume: 500 + rand() * 1500
    });
    price = close;
  }
  return out;
}

// Retourne des chandeliers normalisés : [{ t, open, high, low, close, volume }]
export async function fetchCandles(pair, interval = "1h", limit = 150) {
  if (FAKE) return fakeCandles(pair, interval, limit);
  try {
    const data = await fetchJson(
      `${BINANCE}/klines?symbol=${binanceSymbol(pair)}&interval=${interval}&limit=${limit}`
    );
    return data.map((k) => ({
      t: k[0],
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5])
    }));
  } catch (errBinance) {
    // Repli sur Crypto.com (timeframes: 1m,5m,15m,30m,1h,4h,1D...)
    const tf = interval === "1d" ? "1D" : interval;
    const data = await fetchJson(
      `${CRYPTOCOM}/get-candlestick?instrument_name=${cryptocomSymbol(pair)}&timeframe=${tf}&count=${limit}`
    );
    const list = data?.result?.data;
    if (!Array.isArray(list) || list.length === 0) {
      throw new Error(
        `Aucune donnée de marché pour ${pair} (Binance: ${errBinance.message})`
      );
    }
    return list.map((k) => ({
      t: Number(k.t),
      open: parseFloat(k.o),
      high: parseFloat(k.h),
      low: parseFloat(k.l),
      close: parseFloat(k.c),
      volume: parseFloat(k.v)
    }));
  }
}

// Prix spot actuel + variation 24h
export async function fetchTicker(pair) {
  if (FAKE) {
    const cs = fakeCandles(pair, "1h", 25);
    const last = cs[cs.length - 1].close;
    const dayAgo = cs[0].close;
    return {
      price: last,
      changePct24h: ((last - dayAgo) / dayAgo) * 100,
      volume24h: cs.reduce((s, c) => s + c.volume * c.close, 0)
    };
  }
  try {
    const d = await fetchJson(
      `${BINANCE}/ticker/24hr?symbol=${binanceSymbol(pair)}`
    );
    return {
      price: parseFloat(d.lastPrice),
      changePct24h: parseFloat(d.priceChangePercent),
      volume24h: parseFloat(d.quoteVolume)
    };
  } catch {
    const d = await fetchJson(
      `${CRYPTOCOM}/get-tickers?instrument_name=${cryptocomSymbol(pair)}`
    );
    const t = d?.result?.data?.[0];
    if (!t) throw new Error(`Ticker indisponible pour ${pair}`);
    const price = parseFloat(t.a);
    const open24h = t.o != null ? parseFloat(t.o) : null;
    return {
      price,
      changePct24h:
        open24h && open24h > 0 ? ((price - open24h) / open24h) * 100 : null,
      volume24h: t.vv != null ? parseFloat(t.vv) : null
    };
  }
}

export async function fetchPrice(pair) {
  const t = await fetchTicker(pair);
  return t.price;
}
