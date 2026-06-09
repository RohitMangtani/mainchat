"use client";

import { memo, useState } from "react";
import type { Badge, ChatMessage } from "@/lib/types";
import { PLATFORM_META, PlatformBadge } from "./PlatformBadge";
import { Hover } from "./Tooltip";

const BADGE_META: Record<Badge, { label: string; className: string }> = {
  owner: { label: "HOST", className: "bg-gold/20 text-gold-soft border-gold/40" },
  mod: { label: "MOD", className: "bg-mint/10 text-mint border-mint/30" },
  vip: { label: "VIP", className: "bg-[#ff66c4]/10 text-[#ff8fd4] border-[#ff66c4]/30" },
  sub: { label: "SUB", className: "bg-twitch/10 text-[#c39bff] border-twitch/25" },
  og: { label: "OG", className: "bg-kick/10 text-[#8dfc62] border-kick/25" },
  verified: { label: "✓", className: "bg-white/10 text-cream border-white/25" },
};

function formatClock(ts: number) {
  return new Date(ts).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

function MessageRowInner({
  msg,
  filterToxic,
}: {
  msg: ChatMessage;
  filterToxic: boolean;
}) {
  const [revealed, setRevealed] = useState(false);
  const meta = PLATFORM_META[msg.platform];
  const blurred = filterToxic && msg.vibe.toxic && !revealed;

  const sourceTip = (
    <span>
      Coming from <b style={{ color: meta.color }}>{meta.name}</b>
      {msg.isDemo && " · demo feed"}
      <span className="mt-1 block text-muted">
        {msg.displayName} · {formatClock(msg.timestamp)}
        {msg.vibe.tags.includes("bet") && " · prediction talk"}
      </span>
    </span>
  );

  return (
    <div
      className="group animate-msg-in border-l-2 py-[5px] pl-2.5 pr-2 leading-snug transition-colors hover:bg-white/[0.03]"
      style={{ borderLeftColor: `${meta.color}55` }}
    >
      <Hover tip={sourceTip} block>
        <span className="mr-1.5 inline-flex translate-y-px items-center gap-1">
          <PlatformBadge platform={msg.platform} />
          {msg.badges.map((b) => (
            <span
              key={b}
              className={`inline-flex items-center rounded border px-1 py-px font-mono text-[8.5px] tracking-wider ${BADGE_META[b].className}`}
            >
              {BADGE_META[b].label}
            </span>
          ))}
          {msg.isDemo && (
            <span className="inline-flex items-center rounded border border-faint/40 bg-white/5 px-1 py-px font-mono text-[8.5px] tracking-wider text-muted">
              DEMO
            </span>
          )}
        </span>
        <span
          className="text-[13px] font-bold"
          style={{ color: msg.color || meta.color }}
        >
          {msg.displayName}
        </span>
        <span className="mx-1 text-faint">·</span>
        <span
          className={`text-[13px] text-cream/90 ${blurred ? "blurred-toxic" : ""}`}
          onClick={blurred ? () => setRevealed(true) : undefined}
          title={blurred ? "Filtered by vibe shield — click to reveal" : undefined}
        >
          {msg.text}
        </span>
        {msg.vibe.tags.includes("bet") && !blurred && (
          <span className="ml-1.5 inline-flex translate-y-px items-center rounded border border-gold/35 bg-gold/10 px-1 py-px font-mono text-[8.5px] tracking-wider text-gold-soft">
            BET
          </span>
        )}
        {msg.vibe.tags.includes("hype") && !blurred && (
          <span className="ml-1 inline-flex translate-y-px items-center rounded border border-blood/30 bg-blood/10 px-1 py-px font-mono text-[8.5px] tracking-wider text-[#ff9aa4]">
            HYPE
          </span>
        )}
        <span className="tabular ml-1.5 hidden text-[10px] text-faint group-hover:inline">
          {formatClock(msg.timestamp)}
        </span>
      </Hover>
    </div>
  );
}

/** Memoized — the feed re-renders on every batch flush; rows themselves don't change. */
export const MessageRow = memo(MessageRowInner);
