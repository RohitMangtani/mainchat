"use client";

import type { VibeSnapshot } from "@/lib/types";
import { PLATFORM_META } from "./PlatformBadge";
import { PlatformIcon } from "./icons";
import { Hover } from "./Tooltip";

function meterColor(meter: number) {
  if (meter >= 62) return "#3df59b";
  if (meter >= 45) return "#f5c400";
  return "#ff4d5e";
}

/** One-line extractive summary of the last 90s of chat — composed locally
 *  from the vibe window, refreshed every snapshot. */
function pulseLine(v: VibeSnapshot): string {
  if (v.rate < 1) return "chat is quiet — waiting for the crowd";
  const energy =
    v.meter >= 62
      ? "running hot"
      : v.meter < 45
        ? "turning sour"
        : "holding steady";
  const subject =
    v.keywords.length > 0
      ? `locked on ${v.keywords.slice(0, 2).join(" and ")}`
      : "scattered across topics";
  const bets =
    v.betCount > 0
      ? `, ${v.betCount} bet${v.betCount === 1 ? "" : "s"} called`
      : "";
  return `chat is ${energy}, ${subject}${bets}`;
}

/** The lightweight-AI layer made visible: crowd sentiment, leaders, trends. */
export function VibePanel({ vibe }: { vibe: VibeSnapshot }) {
  const color = meterColor(vibe.meter);

  return (
    <section className="panel grid grid-cols-2 gap-x-4 gap-y-3 px-4 py-3 lg:grid-cols-[1.2fr_1fr_1.3fr_auto]">
      {/* vibe meter */}
      <div className="col-span-2 lg:col-span-1">
        <p className="display-label mb-1.5 text-[9px] text-muted">Vibe Check</p>
        <div className="flex items-baseline gap-2.5">
          <span className="flourish text-[26px] leading-none" style={{ color }}>
            {vibe.label}
          </span>
          <span className="tabular text-[11px] text-faint">{Math.round(vibe.meter)}</span>
        </div>
        <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-white/8">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{
              width: `${vibe.meter}%`,
              background: `linear-gradient(90deg, ${color}66, ${color})`,
              boxShadow: `0 0 8px ${color}88`,
            }}
          />
        </div>
        <p className="mt-1.5 truncate text-[11px] text-muted" title={pulseLine(vibe)}>
          {pulseLine(vibe)}
        </p>
      </div>

      {/* top chatters */}
      <div>
        <p className="display-label mb-1.5 text-[9px] text-muted">Top Chatters</p>
        {vibe.topChatters.length === 0 ? (
          <p className="text-[11px] text-faint">—</p>
        ) : (
          <ol className="space-y-0.5">
            {vibe.topChatters.slice(0, 3).map((c, i) => (
              <li key={`${c.platform}:${c.username}`} className="flex items-center gap-1.5">
                <span className="tabular w-3 text-[10px] text-faint">{i + 1}</span>
                <Hover
                  tip={
                    <span>
                      Coming from{" "}
                      <b style={{ color: PLATFORM_META[c.platform].color }}>
                        {PLATFORM_META[c.platform].name}
                      </b>
                      <span className="mt-1 block text-muted">
                        {c.count} messages in the last 90s
                      </span>
                    </span>
                  }
                >
                  <span className="flex cursor-default items-center gap-1 text-[12px] font-bold text-cream/90">
                    <PlatformIcon
                      platform={c.platform}
                      className="h-2.5 w-2.5"
                      style={{ color: PLATFORM_META[c.platform].color }}
                    />
                    {c.displayName}
                  </span>
                </Hover>
                <span className="tabular ml-auto text-[10px] text-faint">{c.count}</span>
              </li>
            ))}
          </ol>
        )}
      </div>

      {/* trending keywords */}
      <div>
        <p className="display-label mb-1.5 text-[9px] text-muted">Chat Is On</p>
        {vibe.keywords.length === 0 ? (
          <p className="text-[11px] text-faint">listening…</p>
        ) : (
          <div className="flex flex-wrap gap-1">
            {vibe.keywords.slice(0, 6).map((k) => (
              <span
                key={k}
                className="rounded-md border border-gold/20 bg-gold/5 px-1.5 py-0.5 font-mono text-[10px] text-gold-soft"
              >
                {k}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* counters */}
      <div className="flex gap-5 lg:flex-col lg:gap-1.5">
        <div>
          <p className="display-label text-[9px] text-muted">Msgs/min</p>
          <p className="tabular text-lg leading-tight text-cream">{Math.round(vibe.rate)}</p>
        </div>
        <div>
          <p className="display-label text-[9px] text-muted">Bets called</p>
          <p className="tabular gold-text text-lg leading-tight">{vibe.betCount}</p>
        </div>
      </div>
    </section>
  );
}
