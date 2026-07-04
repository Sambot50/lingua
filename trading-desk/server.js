// Trading Desk — serveur principal
import express from "express";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { loadState, saveState, resetPortfolio } from "./src/store.js";
import {
  approveAlert,
  rejectAlert,
  closePositionManually,
  monitorPositions,
  expireOldAlerts,
  portfolioSummary,
  setAlertHook
} from "./src/paperTrading.js";
import { runFullAnalysis } from "./src/analysis.js";
import { computePerformance } from "./src/performance.js";
import { brokerInfo } from "./src/broker.js";
import {
  isTelegramConfigured,
  startTelegramPolling,
  notifyAlert
} from "./src/telegram.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());

// ---------------------------------------------------- Authentification
// Si ACCESS_PASSWORD est défini, toute l'application (interface + API)
// est protégée par mot de passe (HTTP Basic — le navigateur gère la saisie).
// Indispensable avant tout déploiement accessible depuis internet.
const ACCESS_PASSWORD = process.env.ACCESS_PASSWORD || "";
function timingSafeEqualStr(a, b) {
  const A = Buffer.from(String(a));
  const B = Buffer.from(String(b));
  return A.length === B.length && crypto.timingSafeEqual(A, B);
}
if (ACCESS_PASSWORD) {
  app.use((req, res, next) => {
    if (req.path === "/api/health") return next();
    const h = req.headers.authorization || "";
    if (h.startsWith("Basic ")) {
      const decoded = Buffer.from(h.slice(6), "base64").toString();
      const sep = decoded.indexOf(":");
      const pass = sep >= 0 ? decoded.slice(sep + 1) : "";
      if (timingSafeEqualStr(pass, ACCESS_PASSWORD)) return next();
    }
    res.set("WWW-Authenticate", 'Basic realm="Trading Desk", charset="UTF-8"');
    res.status(401).send("Authentification requise");
  });
}

app.use(express.static(path.join(__dirname, "public")));

const state = loadState();

// ------------------------------------------------------------- API
app.get("/api/state", (req, res) => {
  res.json({
    config: state.config,
    portfolio: {
      ...state.portfolio,
      summary: portfolioSummary()
    },
    alerts: state.alerts,
    reports: state.reports,
    performance: computePerformance(),
    lastAnalysisAt: state.lastAnalysisAt,
    analysisInProgress: state.analysisInProgress,
    lastError: state.lastError,
    apiKeyConfigured: Boolean(process.env.ANTHROPIC_API_KEY),
    authEnabled: Boolean(ACCESS_PASSWORD),
    telegramConfigured: isTelegramConfigured(),
    telegramLinked: Boolean(state.config.telegramChatId),
    broker: brokerInfo()
  });
});

app.post("/api/analyze", async (req, res) => {
  const result = await runFullAnalysis();
  res.json(result);
});

app.post("/api/alerts/:id/approve", async (req, res) => {
  try {
    res.json(await approveAlert(req.params.id));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post("/api/alerts/:id/reject", (req, res) => {
  try {
    res.json(rejectAlert(req.params.id));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post("/api/positions/:id/close", async (req, res) => {
  try {
    await closePositionManually(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post("/api/config", (req, res) => {
  const {
    riskPct, pairs, autoIntervalMin, model, rewardRiskRatio,
    atrStopMultiplier, minConfidence, tradingMode,
    feePct, slippagePct, maxTotalRiskPct, trailingStopEnabled
  } = req.body || {};
  if (riskPct !== undefined) {
    const v = Number(riskPct);
    if (!(v >= 0.5 && v <= 5)) {
      return res.status(400).json({ error: "Le risque par trade doit être entre 0,5% et 5%." });
    }
    state.config.riskPct = v;
  }
  if (Array.isArray(pairs) && pairs.length > 0 && pairs.length <= 6) {
    state.config.pairs = pairs
      .map((p) => String(p).trim().toUpperCase())
      .filter((p) => /^[A-Z0-9]{2,10}\/[A-Z]{3,5}$/.test(p));
  }
  if (autoIntervalMin !== undefined) {
    const v = Number(autoIntervalMin);
    if (v === 0 || (v >= 15 && v <= 1440)) {
      state.config.autoIntervalMin = v;
      scheduleAuto();
    }
  }
  if (typeof model === "string" && model.startsWith("claude-")) {
    state.config.model = model;
  }
  if (rewardRiskRatio !== undefined) {
    const v = Number(rewardRiskRatio);
    if (v >= 1.5 && v <= 5) state.config.rewardRiskRatio = v;
  }
  if (atrStopMultiplier !== undefined) {
    const v = Number(atrStopMultiplier);
    if (v >= 0.5 && v <= 4) state.config.atrStopMultiplier = v;
  }
  if (minConfidence !== undefined) {
    const v = Number(minConfidence);
    if (v >= 0 && v <= 95) state.config.minConfidence = v;
  }
  if (feePct !== undefined) {
    const v = Number(feePct);
    if (v >= 0 && v <= 1) state.config.feePct = v;
  }
  if (slippagePct !== undefined) {
    const v = Number(slippagePct);
    if (v >= 0 && v <= 1) state.config.slippagePct = v;
  }
  if (maxTotalRiskPct !== undefined) {
    const v = Number(maxTotalRiskPct);
    if (v >= 1 && v <= 20) state.config.maxTotalRiskPct = v;
  }
  if (trailingStopEnabled !== undefined) {
    state.config.trailingStopEnabled = Boolean(trailingStopEnabled);
  }
  if (tradingMode !== undefined) {
    if (tradingMode === "reel" && !brokerInfo().configured) {
      return res.status(400).json({
        error:
          "Mode réel impossible : définis BINANCE_API_KEY et BINANCE_API_SECRET (testnet.binance.vision pour t'entraîner)."
      });
    }
    if (["papier", "reel"].includes(tradingMode)) state.config.tradingMode = tradingMode;
  }
  saveState();
  res.json(state.config);
});

app.post("/api/portfolio/reset", (req, res) => {
  const capital = Number(req.body?.initialCapital) || 10000;
  if (capital < 100 || capital > 10_000_000) {
    return res.status(400).json({ error: "Capital initial invalide." });
  }
  resetPortfolio(capital);
  res.json({ ok: true });
});

app.get("/api/health", (req, res) => res.json({ ok: true }));

// ---------------------------------------------- Tâches périodiques
// Surveillance des positions (stop-loss / take-profit) toutes les 60 s
setInterval(() => {
  expireOldAlerts();
  if (state.portfolio.positions.length > 0) {
    monitorPositions().catch((e) => console.error("Surveillance :", e.message));
  }
}, 60_000);

// Analyses automatiques (optionnelles, configurables dans l'interface)
let autoTimer = null;
function scheduleAuto() {
  if (autoTimer) clearInterval(autoTimer);
  autoTimer = null;
  const min = state.config.autoIntervalMin;
  if (min > 0) {
    autoTimer = setInterval(() => {
      runFullAnalysis().catch((e) => console.error("Analyse auto :", e.message));
    }, min * 60_000);
    console.log(`Analyses automatiques activées : toutes les ${min} min.`);
  }
}
scheduleAuto();

// Notifications Telegram : alertes envoyées avec boutons Valider/Refuser
setAlertHook(notifyAlert);
startTelegramPolling({
  onApprove: (id) => approveAlert(id),
  onReject: (id) => rejectAlert(id)
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Trading Desk démarré : http://localhost:${PORT}`);
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn(
      "⚠️  ANTHROPIC_API_KEY non définie — les agents ne pourront pas fonctionner."
    );
  }
});
