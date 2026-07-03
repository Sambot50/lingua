// Notifications Telegram : chaque alerte t'est envoyée avec des boutons
// ✅ Valider / ❌ Refuser — tu peux valider les ordres depuis ton téléphone.
//
// Mise en place :
// 1. Sur Telegram, parle à @BotFather → /newbot → récupère le token
// 2. Variable d'environnement TELEGRAM_BOT_TOKEN=123456:ABC...
// 3. Envoie un message à ton bot, puis renseigne ton chat ID dans les réglages
//    (l'application le détecte et l'affiche automatiquement au premier message)
import { loadState, saveState } from "./store.js";

const TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const API = () => `https://api.telegram.org/bot${TOKEN}`;

export function isTelegramConfigured() {
  return Boolean(TOKEN);
}

async function tg(method, payload) {
  const res = await fetch(`${API()}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await res.json().catch(() => ({}));
  if (!data.ok) throw new Error(`Telegram ${method} : ${data.description || "erreur"}`);
  return data.result;
}

const fmt = (v) => (v == null ? "—" : Number(v).toLocaleString("fr-FR", { maximumFractionDigits: 2 }));

// Exportée pour les tests : construction du message d'alerte
export function formatAlertMessage(alert) {
  const head =
    alert.type === "achat"
      ? `🟢 <b>Ordre d'ACHAT proposé — ${alert.pair}</b>`
      : `🔴 <b>Clôture de position proposée — ${alert.pair}</b>`;
  let body = `${head}\nConfiance du manager : <b>${alert.confiance}/100</b>\n\n${alert.synthese}\n`;
  if (alert.plan) {
    body +=
      `\n💰 Entrée : ${fmt(alert.plan.entree)} USDT` +
      `\n🛑 Stop-loss : ${fmt(alert.plan.stopLoss)} USDT` +
      `\n🎯 Take-profit : ${fmt(alert.plan.takeProfit)} USDT` +
      `\n📦 Montant : ${fmt(alert.plan.montantInvesti)} USDT (risque max ${fmt(alert.plan.risqueMax)} USDT)`;
  }
  body += `\n\n⏳ En attente de ta validation.`;
  return body;
}

// Envoi d'une alerte avec boutons de validation
export async function notifyAlert(alert) {
  const s = loadState();
  if (!TOKEN || !s.config.telegramChatId) return;
  try {
    await tg("sendMessage", {
      chat_id: s.config.telegramChatId,
      text: formatAlertMessage(alert),
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [
            { text: "✅ Valider l'ordre", callback_data: `approve:${alert.id}` },
            { text: "❌ Refuser", callback_data: `reject:${alert.id}` }
          ]
        ]
      }
    });
  } catch (err) {
    console.error("Notification Telegram :", err.message);
  }
}

export async function notifyText(text) {
  const s = loadState();
  if (!TOKEN || !s.config.telegramChatId) return;
  try {
    await tg("sendMessage", { chat_id: s.config.telegramChatId, text, parse_mode: "HTML" });
  } catch (err) {
    console.error("Notification Telegram :", err.message);
  }
}

// Boucle de réception (long polling) : réponses aux boutons + détection du chat ID
let offset = 0;
let polling = false;

export function startTelegramPolling({ onApprove, onReject }) {
  if (!TOKEN || polling) return;
  polling = true;
  console.log("Telegram : notifications activées (long polling).");

  (async function loop() {
    while (polling) {
      try {
        const updates = await tg("getUpdates", { offset, timeout: 25 });
        for (const u of updates) {
          offset = u.update_id + 1;
          const s = loadState();

          // Détection automatique du chat ID au premier message reçu
          if (u.message?.chat?.id && !s.config.telegramChatId) {
            s.config.telegramChatId = String(u.message.chat.id);
            saveState();
            await tg("sendMessage", {
              chat_id: u.message.chat.id,
              text: "✅ Trading Desk connecté ! Tu recevras ici les alertes d'ordres à valider."
            });
            continue;
          }

          if (u.callback_query) {
            const cq = u.callback_query;
            const [action, alertId] = String(cq.data || "").split(":");
            let feedback = "Action inconnue.";
            try {
              if (action === "approve") {
                const alert = await onApprove(alertId);
                feedback = `✅ Ordre validé (exécuté à ${fmt(alert.executedPrice)} USDT).`;
              } else if (action === "reject") {
                await onReject(alertId);
                feedback = "❌ Ordre refusé.";
              }
            } catch (err) {
              feedback = `⚠️ ${err.message}`;
            }
            await tg("answerCallbackQuery", { callback_query_id: cq.id, text: feedback.slice(0, 190) });
            if (cq.message) {
              await tg("editMessageText", {
                chat_id: cq.message.chat.id,
                message_id: cq.message.message_id,
                text: `${cq.message.text}\n\n➡️ ${feedback}`
              }).catch(() => {});
            }
          }
        }
      } catch (err) {
        console.error("Telegram polling :", err.message);
        await new Promise((r) => setTimeout(r, 10_000));
      }
    }
  })();
}

export function stopTelegramPolling() {
  polling = false;
}
