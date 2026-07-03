// Persistance simple sur fichier JSON (data/state.json).
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "data");
const STATE_FILE = path.join(DATA_DIR, "state.json");

const DEFAULT_STATE = {
  config: {
    riskPct: 2, // % du capital risqué par trade (0.5 à 5)
    pairs: ["BTC/USDT", "ETH/USDT", "SOL/USDT"],
    autoIntervalMin: 0, // 0 = analyses manuelles uniquement
    initialCapital: 10000, // capital fictif en USDT
    model: "claude-opus-4-8",
    atrStopMultiplier: 1.5, // stop-loss = entrée - 1.5 × ATR
    rewardRiskRatio: 2, // take-profit = 2 × la distance du stop
    minConfidence: 60, // confiance minimale du manager pour créer une alerte
    telegramChatId: "", // détecté automatiquement au premier message au bot
    tradingMode: "papier" // "papier" | "reel" (broker Binance, testnet par défaut)
  },
  portfolio: {
    cash: 10000,
    positions: [],
    closedTrades: []
  },
  alerts: [],
  reports: {},
  lastAnalysisAt: null,
  analysisInProgress: false,
  lastError: null
};

let state = null;
let writeTimer = null;

export function loadState() {
  if (state) return state;
  try {
    const raw = fs.readFileSync(STATE_FILE, "utf8");
    state = JSON.parse(raw);
    // Complète les champs manquants après une mise à jour de l'app
    state.config = { ...DEFAULT_STATE.config, ...state.config };
    for (const key of Object.keys(DEFAULT_STATE)) {
      if (state[key] === undefined) state[key] = DEFAULT_STATE[key];
    }
  } catch {
    state = structuredClone(DEFAULT_STATE);
  }
  state.analysisInProgress = false; // jamais persistant entre deux démarrages
  return state;
}

export function saveState() {
  if (writeTimer) return;
  writeTimer = setTimeout(() => {
    writeTimer = null;
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
    } catch (err) {
      console.error("Erreur de sauvegarde de l'état :", err.message);
    }
  }, 300);
}

export function resetPortfolio(initialCapital) {
  const s = loadState();
  s.config.initialCapital = initialCapital;
  s.portfolio = { cash: initialCapital, positions: [], closedTrades: [] };
  s.alerts = [];
  saveState();
}
