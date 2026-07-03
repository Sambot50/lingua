// Sources d'actualités et de sentiment de marché — gratuites, sans clé API.

const RSS_FEEDS = [
  { name: "CoinDesk", url: "https://www.coindesk.com/arc/outboundfeeds/rss/" },
  { name: "Cointelegraph", url: "https://cointelegraph.com/rss" }
];

async function fetchText(url, timeoutMs = 12000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": "TradingDesk/1.0 (agrégateur RSS personnel)" }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

function stripHtml(s) {
  return s
    .replace(/<!\[CDATA\[|\]\]>/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function parseRss(xml, sourceName, maxItems = 10) {
  const items = [];
  const itemRe = /<item[\s>][\s\S]*?<\/item>/g;
  const matches = xml.match(itemRe) || [];
  for (const block of matches.slice(0, maxItems)) {
    const pick = (tag) => {
      const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
      return m ? stripHtml(m[1]) : "";
    };
    const title = pick("title");
    if (!title) continue;
    items.push({
      source: sourceName,
      titre: title,
      description: pick("description").slice(0, 300),
      date: pick("pubDate")
    });
  }
  return items;
}

// Dernières actualités crypto agrégées (les erreurs par flux sont tolérées)
export async function fetchNews(maxTotal = 14) {
  const results = await Promise.allSettled(
    RSS_FEEDS.map(async (f) => parseRss(await fetchText(f.url), f.name))
  );
  const items = results
    .filter((r) => r.status === "fulfilled")
    .flatMap((r) => r.value);
  items.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
  return items.slice(0, maxTotal);
}

// Indice Fear & Greed (alternative.me) — 0 = peur extrême, 100 = avidité extrême
export async function fetchFearGreed() {
  try {
    const res = await fetch("https://api.alternative.me/fng/?limit=1");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const d = data?.data?.[0];
    if (!d) return null;
    return { valeur: Number(d.value), classification: d.value_classification };
  } catch {
    return null;
  }
}
