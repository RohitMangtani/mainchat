"use client";

import { useEffect, useState } from "react";
import type { ConnState, PlatformId, PlatformStatus } from "@/lib/types";
import { PLATFORM_META } from "./PlatformBadge";
import { BubbleMark, GearIcon, PlatformIcon } from "./icons";
import { Hover } from "./Tooltip";

const STATE_LABEL: Record<ConnState, string> = {
  idle: "standing by",
  connecting: "connecting…",
  connected: "connected",
  reconnecting: "reconnecting…",
  error: "error",
  unconfigured: "not configured",
  disabled: "off",
};

function stateDot(state: ConnState, live?: boolean) {
  if (state === "connected") return live ? "#d11226" : "#3dbf7a"; // red = on air
  if (state === "connecting" || state === "reconnecting") return "#f0b95a";
  if (state === "error") return "#f4506e";
  if (state === "unconfigured") return "#b98f00"; // needs setup ≠ switched off
  return "#55545e";
}

function viewerLabel(n: number | null | undefined) {
  if (n == null) return null;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

/** Dual-city clock strip — a direct lift from the show's broadcast top bar. */
function WorldClocks() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = window.setInterval(() => setNow(new Date()), 10_000);
    return () => window.clearInterval(id);
  }, []);

  if (!now) return null;
  const fmt = (tz: string) =>
    now.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      timeZone: tz,
    });

  return (
    <div className="hidden items-center gap-4 xl:flex">
      {[
        { city: "NEW YORK", tz: "America/New_York" },
        { city: "LOS ANGELES", tz: "America/Los_Angeles" },
      ].map(({ city, tz }) => (
        <div key={tz} className="text-right">
          <p className="display-label text-[8px] leading-tight text-faint">{city}</p>
          <p className="tabular text-[12px] leading-tight text-cream/85">{fmt(tz)}</p>
        </div>
      ))}
    </div>
  );
}

function StatusPill({
  platform,
  status,
}: {
  platform: PlatformId;
  status: PlatformStatus;
}) {
  const meta = PLATFORM_META[platform];
  const dot = stateDot(status.state, status.live);
  const viewers = viewerLabel(status.viewers);

  return (
    <Hover
      tip={
        <span>
          Coming from <b style={{ color: meta.color }}>{meta.name}</b>
          <span className="mt-1 block text-muted">
            {STATE_LABEL[status.state]}
            {status.live ? " · LIVE" : ""}
            {status.detail ? ` · ${status.detail}` : ""}
            {viewers ? ` · ${viewers} watching` : ""}
          </span>
        </span>
      }
    >
      <span className="flex cursor-default items-center gap-1 rounded-lg border border-white/8 bg-ink-1 px-1.5 py-1.5 transition-colors hover:border-white/15 sm:gap-1.5 sm:px-2.5">
        <PlatformIcon platform={platform} className="h-3 w-3" style={{ color: meta.color }} />
        <span
          className={`h-1.5 w-1.5 rounded-full ${
            status.state === "connected" && status.live ? "animate-pulse-dot" : ""
          }`}
          style={{ color: dot, background: dot }}
        />
        {viewers && (
          // viewer counts yield on phones so the brand never truncates
          <span className="tabular hidden text-[11px] text-cream/85 sm:inline">
            {viewers}
          </span>
        )}
      </span>
    </Hover>
  );
}

export function Header({
  brandName,
  brandPreset,
  statuses,
  onOpenConfig,
}: {
  brandName: string;
  brandPreset: "marketbubble" | "custom";
  statuses: Record<PlatformId, PlatformStatus>;
  onOpenConfig: () => void;
}) {
  return (
    <header className="flex items-center gap-2.5 px-3 py-2.5 md:gap-3 md:px-5 md:py-3">
      <BubbleMark className="h-7 w-7 shrink-0 text-cream md:h-8 md:w-8" />

      <div className="min-w-0">
        <h1 className="display-label truncate text-[12px] font-black leading-tight tracking-[0.08em] text-cream sm:tracking-[0.2em] md:text-[14px]">
          {brandName.trim() || "Mainchat"}
        </h1>
        {brandPreset === "marketbubble" && (
          <p className="flourish -mt-px hidden text-[12px] text-muted sm:block">
            <span className="text-[#d11226]/90">&ldquo;</span>invest in yourself
            <span className="text-[#d11226]/90">&rdquo;</span>
          </p>
        )}
      </div>

      <div className="ml-auto flex items-center gap-1.5 md:gap-3">
        <WorldClocks />
        <div className="flex items-center gap-1.5 md:gap-2">
          <StatusPill platform="twitch" status={statuses.twitch} />
          <StatusPill platform="kick" status={statuses.kick} />
          <StatusPill platform="x" status={statuses.x} />
        </div>

        <button
          onClick={onOpenConfig}
          title="Settings"
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/8 bg-ink-1 text-muted transition-all hover:rotate-45 hover:border-gold/40 hover:text-gold"
        >
          <GearIcon className="h-4 w-4" />
        </button>
      </div>
    </header>
  );
}
