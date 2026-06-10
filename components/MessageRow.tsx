"use client";

import { memo, useMemo, useState } from "react";
import type { Badge, ChatMessage } from "@/lib/types";
import { emoteResolver } from "@/lib/emoteResolver";
import { HOST_LABELS } from "@/lib/config";
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
  animate = true,
}: {
  msg: ChatMessage;
  filterToxic: boolean;
  /** rows animate in below ~1 msg/s; above that, instant append reads better */
  animate?: boolean;
}) {
  const [revealed, setRevealed] = useState(false);
  const meta = PLATFORM_META[msg.platform];
  const blurred = filterToxic && msg.vibe.toxic && !revealed;

  // native (Twitch/Kick) + third-party (7TV/BTTV/FFZ) emotes → inline images
  const fragments = useMemo(
    () =>
      emoteResolver.fragment(
        { platform: msg.platform, text: msg.text },
        msg.nativeEmotes,
      ),
    [msg.platform, msg.text, msg.nativeEmotes],
  );

  // whose chat this arrived through — both hosts stream on several platforms,
  // so the platform badge alone doesn't answer "who is this coming from"
  const hostLabel = msg.channel
    ? (HOST_LABELS[msg.channel] ?? msg.channel.slice(0, 8).toUpperCase())
    : null;

  const sourceTip = (
    <span>
      Coming from <b style={{ color: meta.color }}>{meta.name}</b>
      {msg.channel && (
        <>
          {" · "}
          <b className="text-gold-soft">{msg.channel}</b>
          {hostLabel && HOST_LABELS[msg.channel] ? ` (${HOST_LABELS[msg.channel]}'s chat)` : ""}
        </>
      )}
      {msg.isDemo && " · demo feed"}
      <span className="mt-1 block text-muted">
        {msg.displayName} · {formatClock(msg.timestamp)}
        {msg.vibe.tags.includes("bet") && " · prediction talk"}
      </span>
    </span>
  );

  return (
    <div
      className={`group border-l-2 py-[5px] pl-2.5 pr-2 leading-snug transition-colors hover:bg-white/[0.03] ${
        animate ? "animate-msg-in" : ""
      }`}
      style={{ borderLeftColor: `${meta.color}55` }}
    >
      <Hover tip={sourceTip} block>
        <span className="mr-1.5 inline-flex translate-y-px items-center gap-1">
          <PlatformBadge platform={msg.platform} />
          {hostLabel && HOST_LABELS[msg.channel ?? ""] && (
            <span className="inline-flex items-center rounded border border-gold/30 bg-gold/8 px-1 py-px font-mono text-[8.5px] tracking-wider text-gold-soft">
              {hostLabel}
            </span>
          )}
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
          {fragments.map((f, i) =>
            f.kind === "text" ? (
              <span key={i}>{f.text}</span>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={i}
                src={f.url}
                alt={f.name}
                title={f.name}
                loading="lazy"
                className="inline-block h-[20px] w-auto -translate-y-px align-middle"
              />
            ),
          )}
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
