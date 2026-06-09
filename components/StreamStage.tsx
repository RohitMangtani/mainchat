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
          style={{
            // red = on air, the broadcast convention their stream package uses
            color: status.live ? "#d11226" : "#55545e",
            background: status.live ? "#d11226" : "#55545e",
          }}
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

  const pipSmall = pipMain === "twitch" ? "kick" : "twitch";

  // Both players live at FIXED positions in the element tree across every
  // mode — only classNames change. React therefore never remounts the
  // iframes, so switching layouts never reloads the streams or drops audio.
  const wrapperClass = (p: "twitch" | "kick"): string => {
    if (mode === "split") {
      return "relative aspect-video w-full md:aspect-auto md:h-full md:min-h-0";
    }
    if (mode === "twitch" || mode === "kick") {
      return mode === p
        ? "relative col-span-full h-full w-full"
        : "absolute h-0 w-0 overflow-hidden";
    }
    // pip
    return pipMain === p
      ? "absolute inset-0"
      : "absolute bottom-3 right-3 z-10 aspect-video w-[30%] min-w-[160px] overflow-hidden rounded-lg border border-gold/30 shadow-[0_10px_40px_rgba(0,0,0,0.7)]";
  };

  const stageClass =
    mode === "split"
      ? "relative grid w-full grid-cols-1 gap-px bg-black md:min-h-0 md:flex-1 md:auto-rows-fr md:grid-cols-2"
      : "relative aspect-video max-h-[62vh] w-full bg-black md:aspect-auto md:min-h-0 md:max-h-none md:flex-1";

  return (
    <section className="panel relative flex flex-col overflow-hidden md:min-h-0 md:flex-1">
      {/* stage toolbar */}
      <div className="flex items-center gap-2 border-b hairline px-3 py-2">
        <h2 className="chyron text-[9px]">Stage</h2>
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

      {/* players — same two children in every mode, layout is pure CSS */}
      <div className={stageClass}>
        <div className={wrapperClass("twitch")}>
          {twitchSrc ? (
            <iframe
              src={twitchSrc}
              className="absolute inset-0 h-full w-full"
              allowFullScreen
              allow="autoplay; fullscreen"
              title="Twitch stream"
            />
          ) : (
            <EmptySlot platform="twitch" />
          )}
          {mode === "pip" && pipMain !== "twitch" && (
            <button
              onClick={() => setPipMain("twitch")}
              title="Swap streams"
              className="absolute inset-0 z-10 transition-colors hover:bg-white/5"
              aria-label="Make Twitch the main stream"
            />
          )}
        </div>
        <div className={wrapperClass("kick")}>
          {kickSrc ? (
            <iframe
              src={kickSrc}
              className="absolute inset-0 h-full w-full"
              allowFullScreen
              allow="autoplay; fullscreen"
              title="Kick stream"
            />
          ) : (
            <EmptySlot platform="kick" />
          )}
          {mode === "pip" && pipMain !== "kick" && (
            <button
              onClick={() => setPipMain("kick")}
              title="Swap streams"
              className="absolute inset-0 z-10 transition-colors hover:bg-white/5"
              aria-label="Make Kick the main stream"
            />
          )}
        </div>

        {/* live overlays */}
        <div className="pointer-events-none absolute left-3 top-3 z-10 flex gap-2">
          <LiveTag platform="twitch" status={statuses.twitch} />
          <LiveTag platform="kick" status={statuses.kick} />
        </div>
      </div>
    </section>
  );
}
