// Bibliothèque d'analyse technique — calculs déterministes côté serveur.
// L'agent technique (Claude) interprète ces valeurs, il ne les calcule pas.

export function sma(values, period) {
  if (values.length < period) return null;
  const slice = values.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

export function emaSeries(values, period) {
  if (values.length < period) return [];
  const k = 2 / (period + 1);
  const out = [];
  let prev = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  out.push(prev);
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}

export function ema(values, period) {
  const s = emaSeries(values, period);
  return s.length ? s[s.length - 1] : null;
}

export function rsi(closes, period = 14) {
  if (closes.length < period + 1) return null;
  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(diff, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-diff, 0)) / period;
  }
  if (avgLoss === 0) return 100;
  return 100 - 100 / (1 + avgGain / avgLoss);
}

export function macd(closes, fast = 12, slow = 26, signalPeriod = 9) {
  if (closes.length < slow + signalPeriod) return null;
  const emaFast = emaSeries(closes, fast);
  const emaSlow = emaSeries(closes, slow);
  const offset = emaFast.length - emaSlow.length;
  const macdLine = emaSlow.map((v, i) => emaFast[i + offset] - v);
  const signalLine = emaSeries(macdLine, signalPeriod);
  const macdVal = macdLine[macdLine.length - 1];
  const signalVal = signalLine[signalLine.length - 1];
  const prevHist =
    macdLine[macdLine.length - 2] - signalLine[signalLine.length - 2];
  const hist = macdVal - signalVal;
  return {
    macd: macdVal,
    signal: signalVal,
    histogram: hist,
    croisement:
      prevHist <= 0 && hist > 0
        ? "croisement haussier récent"
        : prevHist >= 0 && hist < 0
          ? "croisement baissier récent"
          : hist > 0
            ? "au-dessus du signal"
            : "en dessous du signal"
  };
}

export function bollinger(closes, period = 20, mult = 2) {
  if (closes.length < period) return null;
  const mid = sma(closes, period);
  const slice = closes.slice(-period);
  const variance =
    slice.reduce((acc, v) => acc + (v - mid) ** 2, 0) / period;
  const sd = Math.sqrt(variance);
  const last = closes[closes.length - 1];
  return {
    upper: mid + mult * sd,
    middle: mid,
    lower: mid - mult * sd,
    // position du prix dans le canal, 0 = bande basse, 1 = bande haute
    positionPct: sd > 0 ? (last - (mid - mult * sd)) / (4 * sd) : 0.5
  };
}

export function atr(candles, period = 14) {
  if (candles.length < period + 1) return null;
  const trs = [];
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i];
    const prevClose = candles[i - 1].close;
    trs.push(
      Math.max(
        c.high - c.low,
        Math.abs(c.high - prevClose),
        Math.abs(c.low - prevClose)
      )
    );
  }
  let val = trs.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < trs.length; i++) {
    val = (val * (period - 1) + trs[i]) / period;
  }
  return val;
}

export function volumeAnalysis(candles, period = 20) {
  if (candles.length < period + 1) return null;
  const vols = candles.map((c) => c.volume);
  const avg = sma(vols.slice(0, -1), period);
  const last = vols[vols.length - 1];
  const lastCandle = candles[candles.length - 1];
  return {
    dernierVolume: last,
    volumeMoyen20: avg,
    ratio: avg > 0 ? last / avg : null,
    volumeAcheteur: lastCandle.close >= lastCandle.open
  };
}

// Détection de figures de chandeliers japonais sur les dernières bougies
export function detectPatterns(candles) {
  const patterns = [];
  const n = candles.length;
  if (n < 3) return patterns;
  const c0 = candles[n - 1]; // dernière bougie
  const c1 = candles[n - 2];

  const body = (c) => Math.abs(c.close - c.open);
  const range = (c) => c.high - c.low;
  const upperWick = (c) => c.high - Math.max(c.open, c.close);
  const lowerWick = (c) => Math.min(c.open, c.close) - c.low;
  const bullish = (c) => c.close > c.open;
  const bearish = (c) => c.close < c.open;

  for (const [label, c] of [["dernière bougie", c0], ["avant-dernière bougie", c1]]) {
    const r = range(c);
    if (r <= 0) continue;
    if (body(c) / r < 0.1) {
      patterns.push(`Doji (${label}) — indécision du marché`);
    } else if (lowerWick(c) > 2 * body(c) && upperWick(c) < body(c)) {
      patterns.push(
        bullish(c)
          ? `Marteau haussier (${label}) — rejet des prix bas`
          : `Marteau / pendu (${label}) — rejet des prix bas, à confirmer`
      );
    } else if (upperWick(c) > 2 * body(c) && lowerWick(c) < body(c)) {
      patterns.push(`Étoile filante (${label}) — rejet des prix hauts`);
    }
  }

  // Avalement (engulfing)
  if (bearish(c1) && bullish(c0) && c0.close > c1.open && c0.open < c1.close) {
    patterns.push("Avalement haussier — signal de retournement à la hausse");
  }
  if (bullish(c1) && bearish(c0) && c0.close < c1.open && c0.open > c1.close) {
    patterns.push("Avalement baissier — signal de retournement à la baisse");
  }

  // Trois soldats blancs / trois corbeaux noirs
  if (n >= 3) {
    const c2 = candles[n - 3];
    if ([c2, c1, c0].every(bullish) && c0.close > c1.close && c1.close > c2.close) {
      patterns.push("Trois soldats blancs — forte pression acheteuse");
    }
    if ([c2, c1, c0].every(bearish) && c0.close < c1.close && c1.close < c2.close) {
      patterns.push("Trois corbeaux noirs — forte pression vendeuse");
    }
  }
  return patterns;
}

// Supports et résistances par détection de points pivots (swing highs/lows)
export function supportResistance(candles, lookback = 60, wing = 3) {
  const cs = candles.slice(-lookback);
  const highs = [];
  const lows = [];
  for (let i = wing; i < cs.length - wing; i++) {
    const window = cs.slice(i - wing, i + wing + 1);
    if (cs[i].high === Math.max(...window.map((c) => c.high))) highs.push(cs[i].high);
    if (cs[i].low === Math.min(...window.map((c) => c.low))) lows.push(cs[i].low);
  }
  const last = cs[cs.length - 1].close;
  const resistances = [...new Set(highs)].filter((h) => h > last).sort((a, b) => a - b).slice(0, 3);
  const supports = [...new Set(lows)].filter((l) => l < last).sort((a, b) => b - a).slice(0, 3);
  return { supports, resistances };
}

// Instantané technique complet pour un jeu de chandeliers
export function buildSnapshot(candles) {
  const closes = candles.map((c) => c.close);
  const last = closes[closes.length - 1];
  const ema20 = ema(closes, 20);
  const ema50 = ema(closes, 50);
  const sma200 = sma(closes, Math.min(200, closes.length - 1));
  return {
    dernierPrix: last,
    rsi14: rsi(closes, 14),
    macd: macd(closes),
    ema20,
    ema50,
    sma200,
    tendanceMoyennes:
      ema20 && ema50
        ? ema20 > ema50
          ? "EMA20 au-dessus de EMA50 (tendance haussière court terme)"
          : "EMA20 en dessous de EMA50 (tendance baissière court terme)"
        : null,
    bollinger: bollinger(closes),
    atr14: atr(candles),
    volume: volumeAnalysis(candles),
    figuresChandelles: detectPatterns(candles),
    niveaux: supportResistance(candles)
  };
}
