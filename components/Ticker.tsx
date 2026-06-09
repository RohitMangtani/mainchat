"use client";

import { useEffect, useState } from "react";

interface TapeItem {
  symbol: string;
  price: number;
  change24h: number;
  kind: "stock" | "crypto";
}

interface TapeMarket {
  question: string;
  yesPct: number;
}

const REFRESH_MS = 60_000;

function formatPrice(p: number): string {
  if (p >= 1000) return p.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (p >= 1) return p.toFixed(2);
  return p.toPrecision(3).replace(/0+$/, "").replace(/\.$/, "");
}

function shortQuestion(q: string): string {
  const trimmed = q.replace(/^Will\s+/i, "").replace(/\?$/, "");
  return trimmed.length > 44 ? `${trimmed.slice(0, 42)}…` : trimmed;
}

/**
 * MARKET WATCH — a working replica of the ticker band Market Bubble runs on
 * their actual broadcast: amber symbols, cyan values, green/red deltas, plus
 * live Polymarket odds (the show's presenting sponsor). Refreshes every 60s.
 */
export function Ticker() {
  const [items, setItems] = useState<TapeItem[]>([]);
  const [markets, setMarkets] = useState<TapeMarket[]>([]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/tape", { cache: "no-store" });
        const data: unknown = await res.json();
        if (cancelled || typeof data !== "object" || data === null) return;
        const d = data as { items?: TapeItem[]; markets?: TapeMarket[] };
        if (Array.isArray(d.items)) setItems(d.items);
        if (Array.isArray(d.markets)) setMarkets(d.markets);
      } catch {
        // keep the last tape on a failed refresh
      }
    };
    void load();
    const id = window.setInterval(() => void load(), REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  // duplicate the strip so the marquee loops seamlessly at -50%
  const strip = (key: string) => (
    <div key={key} className="flex shrink-0 items-center">
      {items.map((it) => {
        const up = it.change24h >= 0;
        return (
          <span key={`${key}-${it.symbol}`} className="flex items-center">
            <span className="font-mono text-[10px] font-bold tracking-wider text-gold">
              {it.symbol}
            </span>
            <span className="ml-1.5 font-mono text-[10px] tracking-wider text-[#6fc6e0]">
              ${formatPrice(it.price)}
            </span>
            <span
              className={`ml-1.5 font-mono text-[10px] tracking-wider ${up ? "text-mint" : "text-blood"}`}
            >
              {up ? "▲" : "▼"}
              {Math.abs(it.change24h).toFixed(1)}%
            </span>
            <span className="mx-4 text-[8px] text-white/15">◆</span>
          </span>
        );
      })}
      {markets.map((m, i) => (
        <span key={`${key}-m${i}`} className="flex items-center">
          <span className="font-mono text-[9px] tracking-[0.2em] text-gold/70">
            ODDS
          </span>
          <span className="ml-1.5 font-mono text-[10px] tracking-wider text-cream/70">
            {shortQuestion(m.question)}
          </span>
          <span className="ml-1.5 font-mono text-[10px] font-bold tracking-wider text-[#6fc6e0]">
            {m.yesPct}%
          </span>
          <span className="mx-4 text-[8px] text-white/15">◆</span>
        </span>
      ))}
    </div>
  );

  return (
    <div className="flex items-stretch border-y hairline bg-ink-1/60">
      <div className="z-10 flex shrink-0 items-center border-r hairline bg-ink-0 px-3">
        <span className="chyron text-[8.5px]">Market Watch</span>
      </div>
      {items.length === 0 && markets.length === 0 ? (
        <div className="py-[13px]" />
      ) : (
        <div className="relative min-w-0 flex-1 overflow-hidden py-1.5">
          <div className="flex w-max animate-marquee">
            {strip("a")}
            {strip("b")}
          </div>
          <div className="pointer-events-none absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-ink-0 to-transparent" />
          <div className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-ink-0 to-transparent" />
        </div>
      )}
    </div>
  );
}
