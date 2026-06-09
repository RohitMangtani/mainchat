"use client";

import type { ConnState, PlatformId, PlatformStatus } from "@/lib/types";
import { PLATFORM_META } from "./PlatformBadge";
import { BubbleMark, GearIcon, PlatformIcon } from "./icons";
import { Hover } from "./Tooltip";

const STATE_LABEL: Record<ConnState, string> = {
  idle: "idle",
  connecting: "connecting…",
  connected: "connected",
  reconnecting: "reconnecting…",
  error: "error",
  unconfigured: "not configured",
  disabled: "off",
};

function stateDot(state: ConnState, live?: boolean) {
  if (state === "connected") return live ? "#3df59b" : "#f5c400";
  if (state === "connecting" || state === "reconnecting") return "#f5c400";
  if (state === "error") return "#ff4d5e";
  return "#55545e";
}

function viewerLabel(n: number | null | undefined) {
  if (n == null) return null;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
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
            {status.detail ? ` · ${status.detail}` : ""}
            {viewers ? ` · ${viewers} watching` : ""}
          </span>
        </span>
      }
    >
      <span className="flex cursor-default items-center gap-1.5 rounded-lg border border-white/8 bg-ink-1 px-2.5 py-1.5 transition-colors hover:border-white/15">
        <PlatformIcon platform={platform} className="h-3 w-3" style={{ color: meta.color }} />
        <span
          className={`h-1.5 w-1.5 rounded-full ${
            status.state === "connected" && status.live ? "animate-pulse-dot" : ""
          }`}
          style={{ color: dot, background: dot }}
        />
        {viewers && (
          <span className="tabular text-[11px] text-cream/85">{viewers}</span>
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
  const initial = (brandName.trim()[0] || "M").toUpperCase();

  return (
    <header className="flex items-center gap-3 px-4 py-3 md:px-5">
      <BubbleMark letter={initial} className="h-8 w-8 shrink-0" />

      <div className="min-w-0">
        <h1 className="display-label gold-text truncate text-[13px] font-black leading-tight">
          {brandName.trim() || "Mainchat"}
        </h1>
        <p className="flourish -mt-px text-[12px] text-muted">
          {brandPreset === "marketbubble" ? "invest in yourself" : "every chat, one feed"}
        </p>
      </div>

      <div className="ml-auto flex items-center gap-1.5 md:gap-2">
        <StatusPill platform="twitch" status={statuses.twitch} />
        <StatusPill platform="kick" status={statuses.kick} />
        <StatusPill platform="x" status={statuses.x} />

        <button
          onClick={onOpenConfig}
          title="Settings"
          className="ml-1 flex h-8 w-8 items-center justify-center rounded-lg border border-white/8 bg-ink-1 text-muted transition-all hover:rotate-45 hover:border-gold/30 hover:text-gold"
        >
          <GearIcon className="h-4 w-4" />
        </button>
      </div>
    </header>
  );
}
