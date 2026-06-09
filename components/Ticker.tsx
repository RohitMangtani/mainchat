"use client";

import { useMemo } from "react";
import type { VibeSnapshot } from "@/lib/types";

/** Thin trading-floor tape under the header — keywords, rate, bets, vibe. */
export function Ticker({ vibe }: { vibe: VibeSnapshot }) {
  const items = useMemo(() => {
    const out: { label: string; value: string; gold?: boolean }[] = [
      { label: "VIBE", value: `${vibe.label.toUpperCase()} ${Math.round(vibe.meter)}`, gold: true },
      { label: "FLOW", value: `${Math.round(vibe.rate)} MSG/MIN` },
      { label: "BETS", value: `${vibe.betCount} CALLED`, gold: true },
    ];
    for (const k of vibe.keywords.slice(0, 6)) {
      out.push({ label: "TREND", value: k.toUpperCase() });
    }
    if (vibe.topChatters[0]) {
      out.push({
        label: "LOUDEST",
        value: vibe.topChatters[0].displayName.toUpperCase(),
        gold: true,
      });
    }
    return out;
  }, [vibe]);

  // duplicate the strip so the marquee loops seamlessly at -50%
  const strip = (key: string) => (
    <div key={key} className="flex shrink-0 items-center">
      {items.map((it, i) => (
        <span key={`${key}-${i}`} className="flex items-center">
          <span className="font-mono text-[9px] tracking-[0.2em] text-faint">{it.label}</span>
          <span
            className={`ml-1.5 font-mono text-[10px] tracking-wider ${
              it.gold ? "text-gold-soft" : "text-cream/75"
            }`}
          >
            {it.value}
          </span>
          <span className="mx-4 text-[8px] text-gold/30">◆</span>
        </span>
      ))}
    </div>
  );

  return (
    <div className="relative overflow-hidden border-y hairline bg-ink-1/60 py-1.5">
      <div className="flex w-max animate-marquee">
        {strip("a")}
        {strip("b")}
      </div>
      <div className="pointer-events-none absolute inset-y-0 left-0 w-12 bg-gradient-to-r from-ink-0 to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-ink-0 to-transparent" />
    </div>
  );
}
