"use client";

import { useEffect, useMemo, useState } from "react";
import type { PlatformId, PlatformStatus } from "@/lib/types";
import { PLATFORM_META } from "./PlatformBadge";
import { Hover } from "./Tooltip";

export type StageMode = "split" | "twitch" | "kick" | "pip";

const MODES: { id: StageMode; label: string }[] = [
  { id: "split", label: "SPLIT" },
  { id: "twitch", label: "TWITCH" },
  { id: "kick", label: "KICK" },
  { id: "pip", label: "PIP" },
];

function viewerLabel(n: number | null | undefined) {
  if (n == null) return "—";
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function LiveTag({
  platform,
  status,
}: {
  platform: "twitch" | "kick";
  status: PlatformStatus;
}) {
  const meta = PLATFORM_META[platform];
  return (
    <Hover
      tip={
        <span>
          Coming from <b style={{ color: meta.color }}>{meta.name}</b>
          <span className="mt-1 block text-muted">
            {status.live ? `live · ${viewerLabel(status.viewers)} watching` : "offline"}
            {status.streamTitle ? ` · ${status.streamTitle}` : ""}
          </span>
        </span>
      }
    >
      <span className="pointer-events-auto flex items-center gap-1.5 rounded-md border border-white/10 bg-ink-0/80 px-2 py-1 backdrop-blur">
        <span
          className={`h-1.5 w-1.5 rounded-full ${status.live ? "animate-pulse-dot" : ""}`}
          style={{ color: meta.color, background: status.live ? meta.color : "#55545e" }}
        />
        <span className="font-mono text-[9px] tracking-widest" style={{ color: meta.color }}>
          {meta.name.toUpperCase()}
        </span>
        <span className="tabular text-[10px] text-cream/80">
          {status.live ? viewerLabel(status.viewers) : "OFF"}
        </span>
      </span>
    </Hover>
  );
}

function EmptySlot({ platform }: { platform: "twitch" | "kick" }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-1.5 bg-ink-1">
      <p className="flourish text-lg text-faint">no {platform} channel set</p>
      <p className="font-mono text-[10px] tracking-wider text-faint">ADD ONE IN SETTINGS</p>
    </div>
  );
}

/** Embedded live players — split, solo, or picture-in-picture. No tab switching, ever. */
export function StreamStage({
  twitchChannel,
  kickChannel,
  statuses,
}: {
  twitchChannel: string;
  kickChannel: string;
  statuses: Record<PlatformId, PlatformStatus>;
}) {
  const [mode, setMode] = useState<StageMode>("split");
  const [pipMain, setPipMain] = useState<"twitch" | "kick">("twitch");
  const [host, setHost] = useState<string | null>(null);

  // Twitch's embed requires the embedding hostname as a `parent` param —
  // resolve it at runtime so the same build works on any domain.
  useEffect(() => {
    setHost(window.location.hostname);
  }, []);

  const twitchSrc = useMemo(
    () =>
      host && twitchChannel
        ? `https://player.twitch.tv/?channel=${encodeURIComponent(twitchChannel)}&parent=${host}&muted=true&autoplay=true`
        : null,
    [host, twitchChannel],
  );
  const kickSrc = useMemo(
    () =>
      kickChannel
        ? `https://player.kick.com/${encodeURIComponent(kickChannel)}?autoplay=true&muted=true`
        : null,
    [kickChannel],
  );

  const players: Record<"twitch" | "kick", React.ReactNode> = {
    twitch: twitchSrc ? (
      <iframe
        key={twitchSrc}
        src={twitchSrc}
        className="h-full w-full"
        allowFullScreen
        allow="autoplay; fullscreen"
        title="Twitch stream"
      />
    ) : (
      <EmptySlot platform="twitch" />
    ),
    kick: kickSrc ? (
      <iframe
        key={kickSrc}
        src={kickSrc}
        className="h-full w-full"
        allowFullScreen
        allow="autoplay; fullscreen"
        title="Kick stream"
      />
    ) : (
      <EmptySlot platform="kick" />
    ),
  };

  const pipSmall = pipMain === "twitch" ? "kick" : "twitch";

  return (
    <section className="panel relative flex flex-col overflow-hidden">
      {/* stage toolbar */}
      <div className="flex items-center gap-2 border-b hairline px-3 py-2">
        <h2 className="display-label text-[10px] text-gold">Stage</h2>
        <div className="ml-auto flex items-center gap-1 rounded-lg border border-white/8 bg-ink-0/60 p-0.5">
          {MODES.map((m) => (
            <button
              key={m.id}
              onClick={() => {
                if (m.id === "pip" && mode === "pip") {
                  setPipMain((p) => (p === "twitch" ? "kick" : "twitch"));
                } else {
                  setMode(m.id);
                }
              }}
              className={`rounded-md px-2.5 py-1 font-mono text-[9px] tracking-widest transition-all ${
                mode === m.id
                  ? "bg-gold/15 text-gold shadow-[inset_0_0_0_1px_rgba(245,196,0,0.3)]"
                  : "text-muted hover:text-cream"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* players */}
      <div className="relative aspect-video max-h-[62vh] w-full bg-black md:aspect-auto md:h-full md:min-h-0 md:flex-1">
        {mode === "split" && (
          <div className="grid h-full grid-cols-1 gap-px md:grid-cols-2">
            <div className="relative h-full min-h-[180px]">{players.twitch}</div>
            <div className="relative h-full min-h-[180px]">{players.kick}</div>
          </div>
        )}
        {(mode === "twitch" || mode === "kick") && (
          <div className="h-full">{players[mode]}</div>
        )}
        {mode === "pip" && (
          <div className="relative h-full">
            <div className="h-full">{players[pipMain]}</div>
            <button
              onClick={() => setPipMain(pipSmall)}
              title="Swap streams"
              className="absolute bottom-3 right-3 z-10 aspect-video w-[30%] min-w-[160px] overflow-hidden rounded-lg border border-gold/30 shadow-[0_10px_40px_rgba(0,0,0,0.7)] transition-transform hover:scale-[1.03]"
            >
              <div className="pointer-events-none h-full w-full">{players[pipSmall]}</div>
            </button>
          </div>
        )}

        {/* live overlays */}
        <div className="pointer-events-none absolute left-3 top-3 z-10 flex gap-2">
          <LiveTag platform="twitch" status={statuses.twitch} />
          <LiveTag platform="kick" status={statuses.kick} />
        </div>
      </div>
    </section>
  );
}
