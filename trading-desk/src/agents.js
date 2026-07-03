// Les 4 agents propulsés par Claude.
// Agent 1 : Analyse technique — Agent 2 : Sentiment & actualités
// Agent 3 : Exécution & gestion du risque — Agent 4 : Manager (chef d'orchestre)
import Anthropic from "@anthropic-ai/sdk";
import { loadState } from "./store.js";

let client = null;

// Point d'injection pour les tests (client Claude simulé)
export function _setTestClient(c) {
  client = c;
}

function getClient() {
  if (client) return client;
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "Clé API manquante : définis la variable d'environnement ANTHROPIC_API_KEY (console.anthropic.com)."
    );
  }
  client = new Anthropic();
  return client;
}

async function callAgent({ system, user, schema, maxTokens = 8000 }) {
  const model = loadState().config.model || "claude-opus-4-8";
  const response = await getClient().messages.create({
    model,
    max_tokens: maxTokens,
    thinking: { type: "adaptive" },
    system,
    messages: [{ role: "user", content: user }],
    output_config: { format: { type: "json_schema", schema } }
  });
  if (response.stop_reason === "refusal") {
    throw new Error("L'agent a refusé de répondre à cette requête.");
  }
  if (response.stop_reason === "max_tokens") {
    throw new Error("Réponse de l'agent tronquée (limite de tokens atteinte) — réessaie.");
  }
  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock) throw new Error("Réponse vide de l'agent.");
  return JSON.parse(textBlock.text);
}

const BIAS_ENUM = ["haussier", "baissier", "neutre"];

// ---------------------------------------------------------------- Agent 1
const TECH_SCHEMA = {
  type: "object",
  properties: {
    biais: { type: "string", enum: BIAS_ENUM },
    confiance: { type: "integer", description: "Confiance de 0 à 100" },
    signaux: {
      type: "array",
      items: { type: "string" },
      description: "Signaux techniques observés, du plus au moins important"
    },
    niveauxCles: {
      type: "object",
      properties: {
        supportMajeur: { anyOf: [{ type: "number" }, { type: "null" }] },
        resistanceMajeure: { anyOf: [{ type: "number" }, { type: "null" }] }
      },
      required: ["supportMajeur", "resistanceMajeure"],
      additionalProperties: false
    },
    commentaire: { type: "string", description: "Synthèse en 2-3 phrases, en français" }
  },
  required: ["biais", "confiance", "signaux", "niveauxCles", "commentaire"],
  additionalProperties: false
};

export async function runTechnicalAgent(pair, snapshot1h, snapshot4h) {
  return callAgent({
    system:
      "Tu es un analyste technique senior dans un fonds d'investissement crypto. " +
      "Tu maîtrises les chandeliers japonais, les volumes, les moyennes mobiles (EMA/SMA), " +
      "le RSI, le MACD, les bandes de Bollinger, l'ATR et les niveaux de support/résistance. " +
      "Les indicateurs t'ont été calculés par un moteur déterministe : ton rôle est de les " +
      "INTERPRÉTER de manière professionnelle et prudente, pas de les recalculer. " +
      "Sois honnête sur l'incertitude : un biais neutre avec faible confiance est une réponse valable. " +
      "Réponds en français.",
    user:
      `Paire analysée : ${pair}\n\n` +
      `Indicateurs sur unité de temps 1 heure :\n${JSON.stringify(snapshot1h, null, 2)}\n\n` +
      `Indicateurs sur unité de temps 4 heures :\n${JSON.stringify(snapshot4h, null, 2)}\n\n` +
      "Donne ton analyse technique : biais directionnel, confiance (0-100), signaux clés, " +
      "support et résistance majeurs, et une courte synthèse.",
    schema: TECH_SCHEMA
  });
}

// ---------------------------------------------------------------- Agent 2
const SENTIMENT_SCHEMA = {
  type: "object",
  properties: {
    biais: { type: "string", enum: BIAS_ENUM },
    confiance: { type: "integer", description: "Confiance de 0 à 100" },
    facteurs: {
      type: "array",
      items: { type: "string" },
      description: "Actualités ou facteurs de sentiment pesant sur le cours"
    },
    risqueEvenement: {
      type: "string",
      description: "Événement imminent pouvant provoquer de la volatilité, ou 'aucun identifié'"
    },
    commentaire: { type: "string" }
  },
  required: ["biais", "confiance", "facteurs", "risqueEvenement", "commentaire"],
  additionalProperties: false
};

export async function runSentimentAgent(pair, news, fearGreed) {
  return callAgent({
    system:
      "Tu es un analyste spécialisé dans le sentiment de marché crypto : actualités, " +
      "breaking news, annonces réglementaires, macroéconomie et psychologie des foules. " +
      "Tu évalues l'impact probable des informations récentes sur le cours d'un actif. " +
      "Attention aux limites : tu ne vois que les titres récents fournis, pas l'intégralité du marché. " +
      "Si les nouvelles ne concernent pas directement l'actif, dis-le et reste neutre. " +
      "Réponds en français.",
    user:
      `Actif analysé : ${pair}\n\n` +
      `Indice Fear & Greed du marché crypto : ${
        fearGreed ? `${fearGreed.valeur}/100 (${fearGreed.classification})` : "indisponible"
      }\n\n` +
      `Dernières actualités (flux RSS CoinDesk / Cointelegraph) :\n${JSON.stringify(news, null, 2)}\n\n` +
      "Évalue le sentiment pour cet actif : biais, confiance, facteurs déterminants, " +
      "risque d'événement imminent, et une courte synthèse.",
    schema: SENTIMENT_SCHEMA
  });
}

// ---------------------------------------------------------------- Agent 3
// Le dimensionnement de position est calculé par du code déterministe
// (jamais par un LLM quand il s'agit d'argent). L'agent risque VALIDE le plan.
export function computeRiskPlan({ pair, price, atrValue, portfolio, config }) {
  if (!atrValue || atrValue <= 0 || !price || price <= 0) {
    throw new Error(`Données insuffisantes pour calculer le plan de risque de ${pair}.`);
  }
  const capital = portfolio.cash +
    portfolio.positions.reduce((s, p) => s + p.qty * (p.lastPrice || p.entry), 0);
  const stopDistance = config.atrStopMultiplier * atrValue;
  const stopLoss = price - stopDistance;
  const takeProfit = price + config.rewardRiskRatio * stopDistance;
  const riskAmount = (config.riskPct / 100) * capital;
  let qty = riskAmount / stopDistance;
  let notional = qty * price;
  // On ne peut pas investir plus que le cash disponible (spot, sans levier)
  if (notional > portfolio.cash) {
    qty = portfolio.cash / price;
    notional = portfolio.cash;
  }
  return {
    pair,
    direction: "achat (long, spot)",
    entree: round(price),
    stopLoss: round(stopLoss),
    takeProfit: round(takeProfit),
    quantite: Number(qty.toPrecision(6)),
    montantInvesti: round(notional),
    risqueMax: round(Math.min(riskAmount, qty * stopDistance)),
    risquePctCapital: config.riskPct,
    capitalTotal: round(capital),
    ratioGainRisque: config.rewardRiskRatio
  };
}

function round(v) {
  return Math.round(v * 100) / 100;
}

const RISK_SCHEMA = {
  type: "object",
  properties: {
    valide: { type: "boolean", description: "Le plan respecte-t-il les règles de money management ?" },
    alertes: {
      type: "array",
      items: { type: "string" },
      description: "Problèmes ou points de vigilance identifiés"
    },
    commentaire: { type: "string" }
  },
  required: ["valide", "alertes", "commentaire"],
  additionalProperties: false
};

export async function runRiskAgent(plan, portfolio, config) {
  const positionsOuvertes = portfolio.positions.map((p) => ({
    pair: p.pair,
    montant: round(p.qty * (p.lastPrice || p.entry))
  }));
  return callAgent({
    system:
      "Tu es un gestionnaire des risques (risk manager) dans une société de trading. " +
      "Tu appliques strictement les règles de money management : risque limité par trade " +
      "(un pourcentage fixe du capital), stop-loss obligatoire, ratio gain/risque d'au moins 1.5, " +
      "diversification (éviter la concentration excessive sur un seul actif), " +
      "pas de levier en spot. Le plan chiffré a été calculé par un moteur déterministe ; " +
      "ton rôle est de le valider ou de le rejeter, avec tes points de vigilance. Réponds en français.",
    user:
      `Règle de risque configurée : ${config.riskPct}% du capital par trade.\n` +
      `Cash disponible : ${round(portfolio.cash)} USDT.\n` +
      `Positions déjà ouvertes : ${JSON.stringify(positionsOuvertes)}\n\n` +
      `Plan de trade proposé :\n${JSON.stringify(plan, null, 2)}\n\n` +
      "Valide ou rejette ce plan au regard des règles de money management.",
    schema: RISK_SCHEMA,
    maxTokens: 4000
  });
}

// ---------------------------------------------------------------- Agent 4
const MANAGER_SCHEMA = {
  type: "object",
  properties: {
    action: {
      type: "string",
      enum: ["ACHETER", "VENDRE", "ATTENDRE"],
      description:
        "ACHETER = proposer l'ordre d'achat à validation humaine. " +
        "VENDRE = proposer la clôture de la position existante. ATTENDRE = ne rien faire."
    },
    confiance: { type: "integer", description: "Confiance de 0 à 100" },
    synthese: {
      type: "string",
      description: "Compte-rendu clair en 3-5 phrases pour l'investisseur, en français"
    },
    argumentsPour: { type: "array", items: { type: "string" } },
    argumentsContre: { type: "array", items: { type: "string" } }
  },
  required: ["action", "confiance", "synthese", "argumentsPour", "argumentsContre"],
  additionalProperties: false
};

export async function runManagerAgent({
  pair,
  ticker,
  tech,
  sentiment,
  riskPlan,
  riskReview,
  existingPosition
}) {
  return callAgent({
    system:
      "Tu es le manager d'une équipe de trading : le chef d'orchestre. " +
      "Tu reçois les rapports de l'analyste technique, de l'analyste sentiment et du risk manager, " +
      "et tu prends la décision finale : ACHETER, VENDRE (clôturer la position existante) ou ATTENDRE. " +
      "Règles impératives : " +
      "1) AUCUN ordre n'est exécuté sans validation humaine — ta décision ACHETER/VENDRE crée seulement " +
      "une alerte que l'investisseur validera ou refusera. " +
      "2) Tu ne proposes ACHETER que si les signaux convergent ET que le risk manager a validé le plan. " +
      "3) En cas de doute ou de signaux contradictoires, tu choisis ATTENDRE — ne pas trader est une position. " +
      "4) Compte spot uniquement : VENDRE n'est possible que s'il existe une position ouverte. " +
      "5) Ton compte-rendu doit être honnête sur les incertitudes et compréhensible par un non-professionnel. " +
      "Réponds en français.",
    user:
      `Paire : ${pair}\n` +
      `Prix actuel : ${ticker.price} USDT (variation 24h : ${ticker.changePct24h ?? "?"}%)\n` +
      `Position déjà ouverte sur cette paire : ${
        existingPosition
          ? JSON.stringify({
              entree: existingPosition.entry,
              quantite: existingPosition.qty,
              stopLoss: existingPosition.stopLoss,
              takeProfit: existingPosition.takeProfit
            })
          : "aucune"
      }\n\n` +
      `--- Rapport de l'analyste technique ---\n${JSON.stringify(tech, null, 2)}\n\n` +
      `--- Rapport de l'analyste sentiment ---\n${JSON.stringify(sentiment, null, 2)}\n\n` +
      `--- Plan de trade calculé (si achat) ---\n${JSON.stringify(riskPlan, null, 2)}\n\n` +
      `--- Avis du risk manager sur ce plan ---\n${JSON.stringify(riskReview, null, 2)}\n\n` +
      "Prends ta décision finale et rédige ton compte-rendu pour l'investisseur.",
    schema: MANAGER_SCHEMA
  });
}
