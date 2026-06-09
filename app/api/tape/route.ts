// ─── /api/tape ───────────────────────────────────────────────────────────────
// The MARKET WATCH tape — a replica of the band Market Bubble runs on their
// actual broadcast (SPY/BTC/ETH/SOL/NVDA/TSLA/GOLD/HIMS) extended with the
// hosts' signature crypto calls. Three free, keyless upstreams:
//   stocks  → Yahoo Finance v8 chart (the endpoint yfinance wraps)
//   crypto  → CoinGecko simple price
//   odds    → Polymarket gamma (the show's presenting sponsor)
// All are rate-limited public APIs, so results are cached in module scope for
// 60s regardless of how many dashboards poll. Never 500s; on upstream failure
// serves the last good tape.

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const CACHE_MS = 60_000;
const UA = { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)" };

// The show's on-air ticker, in their order.
const STOCKS: { ticker: string; symbol: string }[] = [
  { ticker: "SPY", symbol: "SPY" },
  { ticker: "NVDA", symbol: "NVDA" },
  { ticker: "TSLA", symbol: "TSLA" },
  { ticker: "GC=F", symbol: "GOLD" },
  { ticker: "HIMS", symbol: "HIMS" },
];

// Majors + the hosts' signature calls (Ansem: SOL/WIF/BONK legend, 2026
// longs HYPE + ZEC, plus the pump.fun casino his audience trades on).
const COINS: { id: string; symbol: string }[] = [
  { id: "bitcoin", symbol: "BTC" },
  { id: "ethereum", symbol: "ETH" },
  { id: "solana", symbol: "SOL" },
  { id: "hyperliquid", symbol: "HYPE" },
  { id: "zcash", symbol: "ZEC" },
  { id: "dogwifcoin", symbol: "WIF" },
  { id: "bonk", symbol: "BONK" },
  { id: "dogecoin", symbol: "DOGE" },
  { id: "pump-fun", symbol: "PUMP" },
];

export interface TapeItem {
  symbol: string;
  price: number;
  change24h: number;
  kind: "stock" | "crypto";
}

export interface TapeMarket {
  question: string;
  yesPct: number;
}

interface Tape {
  items: TapeItem[];
  markets: TapeMarket[];
}

let cached: { tape: Tape; at: number } | null = null;
let inflight: Promise<Tape> | null = null;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

async function fetchStock(ticker: string, symbol: string): Promise<TapeItem | null> {
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=2d`,
      { cache: "no-store", headers: UA },
    );
    if (!res.ok) return null;
    const body: unknown = await res.json();
    if (!isRecord(body) || !isRecord(body.chart)) return null;
    const result = Array.isArray(body.chart.result) ? body.chart.result[0] : null;
    if (!isRecord(result) || !isRecord(result.meta)) return null;
    const meta = result.meta;
    const price = meta.regularMarketPrice;
    if (typeof price !== "number") return null;
    const prev =
      typeof meta.chartPreviousClose === "number" ? meta.chartPreviousClose : null;
    const change24h = prev && prev > 0 ? ((price - prev) / prev) * 100 : 0;
    return { symbol, price, change24h, kind: "stock" };
  } catch {
    return null;
  }
}

async function fetchStocks(): Promise<TapeItem[]> {
  const settled = await Promise.allSettled(
    STOCKS.map((s) => fetchStock(s.ticker, s.symbol)),
  );
  return settled
    .map((r) => (r.status === "fulfilled" ? r.value : null))
    .filter((v): v is TapeItem => v !== null);
}

async function fetchCoins(): Promise<TapeItem[]> {
  const ids = COINS.map((c) => c.id).join(",");
  const res = await fetch(
    `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`,
    { cache: "no-store", headers: { accept: "application/json" } },
  );
  if (!res.ok) throw new Error(`coingecko ${res.status}`);
  const body: unknown = await res.json();
  if (!isRecord(body)) throw new Error("coingecko shape");

  const out: TapeItem[] = [];
  for (const c of COINS) {
    const entry = body[c.id];
    if (!isRecord(entry) || typeof entry.usd !== "number") continue;
    out.push({
      symbol: c.symbol,
      price: entry.usd,
      change24h:
        typeof entry.usd_24h_change === "number" ? entry.usd_24h_change : 0,
      kind: "crypto",
    });
  }
  return out;
}

async function fetchMarkets(): Promise<TapeMarket[]> {
  const res = await fetch(
    "https://gamma-api.polymarket.com/markets?closed=false&order=volume24hr&ascending=false&limit=8",
    { cache: "no-store", headers: { accept: "application/json" } },
  );
  if (!res.ok) throw new Error(`polymarket ${res.status}`);
  const body: unknown = await res.json();
  if (!Array.isArray(body)) throw new Error("polymarket shape");

  const out: TapeMarket[] = [];
  for (const raw of body) {
    if (out.length >= 4) break;
    if (!isRecord(raw)) continue;
    const question = typeof raw.question === "string" ? raw.question : null;
    const pricesRaw =
      typeof raw.outcomePrices === "string" ? raw.outcomePrices : null;
    if (!question || !pricesRaw) continue;
    try {
      const prices: unknown = JSON.parse(pricesRaw);
      if (!Array.isArray(prices) || typeof prices[0] !== "string") continue;
      const yes = Number.parseFloat(prices[0]);
      if (!Number.isFinite(yes)) continue;
      out.push({ question, yesPct: Math.round(yes * 100) });
    } catch {
      continue;
    }
  }
  return out;
}

async function buildTape(): Promise<Tape> {
  const [stocks, coins, markets] = await Promise.allSettled([
    fetchStocks(),
    fetchCoins(),
    fetchMarkets(),
  ]);
  const stockItems = stocks.status === "fulfilled" ? stocks.value : [];
  const coinItems = coins.status === "fulfilled" ? coins.value : [];

  // Interleave to match the show's band: SPY leads, then majors, then the rest.
  const bySymbol = new Map<string, TapeItem>();
  for (const i of [...stockItems, ...coinItems]) bySymbol.set(i.symbol, i);
  const ORDER = [
    "SPY", "BTC", "ETH", "SOL", "NVDA", "TSLA", "GOLD", "HIMS",
    "HYPE", "ZEC", "WIF", "BONK", "DOGE", "PUMP",
  ];
  const items = ORDER.map((s) => bySymbol.get(s)).filter(
    (v): v is TapeItem => v !== undefined,
  );

  return {
    items: items.length > 0 ? items : (cached?.tape.items ?? []),
    markets:
      markets.status === "fulfilled" ? markets.value : (cached?.tape.markets ?? []),
  };
}

export async function GET(): Promise<NextResponse> {
  const now = Date.now();
  if (cached && now - cached.at < CACHE_MS) {
    return NextResponse.json(cached.tape);
  }
  if (!inflight) {
    inflight = buildTape()
      .then((tape) => {
        cached = { tape, at: Date.now() };
        return tape;
      })
      .finally(() => {
        inflight = null;
      });
  }
  try {
    const tape = await inflight;
    return NextResponse.json(tape);
  } catch {
    return NextResponse.json(cached?.tape ?? { items: [], markets: [] });
  }
}
