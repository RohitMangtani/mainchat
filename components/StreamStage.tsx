"use client";

import { useEffect, useMemo, useState } from "react";
import type { PlatformId, PlatformStatus } from "@/lib/types";
import { PLATFORM_META } from "./PlatformBadge";
import { Hover } from "./Tooltip";

export type StageMode = "split" | "a" | "b" | "pip";

function viewerLabel(n: number | null | undefined) {
  if (n == null) return "—";
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function LiveTag({
  name,
  color,
  status,
}: {
  name: string;
  color: string;
  status: Pick<PlatformStatus, "live" | "viewers" | "streamTitle">;
}) {
  return (
    <Hover
      tip={
        <span>
          Coming from <b style={{ color }}>{name}</b>
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
        <span className="font-mono text-[9px] tracking-widest" style={{ color }}>
          {name.toUpperCase()}
        </span>
        <span className="tabular text-[10px] text-cream/80">
          {status.live ? viewerLabel(status.viewers) : "OFF"}
        </span>
      </span>
    </Hover>
  );
}

function EmptySlot({ hint }: { hint: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-1.5 bg-ink-1 px-3 text-center">
      <p className="flourish text-sm text-faint sm:text-lg">{hint}</p>
      <p className="hidden font-mono text-[10px] tracking-wider text-faint sm:block">
        CONFIGURE IN SETTINGS
      </p>
    </div>
  );
}

/**
 * Embedded live players — split, solo, or picture-in-picture. Slot A is the
 * primary Twitch stream; slot B is the Kick stream when configured, else the
 * optional second Twitch stream (the co-host). No tab switching, ever.
 */
export function StreamStage({
  twitchChannel,
  twitchChannel2,
  kickChannel,
  statuses,
}: {
  twitchChannel: string;
  twitchChannel2: string;
  kickChannel: string;
  statuses: Record<PlatformId, PlatformStatus>;
}) {
  const [mode, setMode] = useState<StageMode>("split");
  const [pipMain, setPipMain] = useState<"a" | "b">("a");
  const [host, setHost] = useState<string | null>(null);

  // Twitch's embed requires the embedding hostname as a `parent` param —
  // resolve it at runtime so the same build works on any domain.
  useEffect(() => {
    setHost(window.location.hostname);
  }, []);

  const twitchSrc = (channel: string) =>
    host && channel
      ? `https://player.twitch.tv/?channel=${encodeURIComponent(channel)}&parent=${host}&muted=true&autoplay=true`
      : null;

  const slotASrc = twitchSrc(twitchChannel);

  // slot B: Kick wins when configured; otherwise the second Twitch stream
  const slotB = useMemo(() => {
    if (kickChannel.trim()) {
      return {
        kind: "kick" as const,
        src: `https://player.kick.com/${encodeURIComponent(kickChannel)}?autoplay=true&muted=true`,
        label: "KICK",
        name: "Kick",
        color: PLATFORM_META.kick.color,
      };
    }
    if (twitchChannel2.trim()) {
      return {
        kind: "twitch2" as const,
        src: null as string | null, // resolved below once host is known
        label: twitchChannel2.slice(0, 9).toUpperCase(),
        name: `Twitch · ${twitchChannel2}`,
        color: PLATFORM_META.twitch.color,
      };
    }
    return {
      kind: "none" as const,
      src: null as string | null,
      label: "—",
      name: "",
      color: "#55545e",
    };
  }, [kickChannel, twitchChannel2]);
  const slotBSrc = slotB.kind === "twitch2" ? twitchSrc(twitchChannel2) : slotB.src;

  // live status for a twitch2 slot — polled here (the chat connector for the
  // second channel deliberately doesn't own a status pill)
  const [slotBTwitchStatus, setSlotBTwitchStatus] = useState<
    Pick<PlatformStatus, "live" | "viewers" | "streamTitle">
  >({});
  useEffect(() => {
    if (slotB.kind !== "twitch2") return undefined;
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch(
          `/api/twitch/info?channel=${encodeURIComponent(twitchChannel2)}`,
          { cache: "no-store" },
        );
        const d: unknown = await res.json();
        if (cancelled || typeof d !== "object" || d === null) return;
        const info = d as { ok?: boolean; live?: boolean; viewers?: number | null; title?: string | null };
        if (info.ok) {
          setSlotBTwitchStatus({
            live: info.live === true,
            viewers: info.viewers ?? null,
            streamTitle: info.title ?? undefined,
          });
        }
      } catch {
        // keep last known
      }
    };
    void poll();
    const id = window.setInterval(() => void poll(), 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [slotB.kind, twitchChannel2]);

  const slotBStatus =
    slotB.kind === "kick" ? statuses.kick : slotBTwitchStatus;

  const MODES: { id: StageMode; label: string }[] = [
    { id: "split", label: "SPLIT" },
    { id: "a", label: "TWITCH" },
    { id: "b", label: slotB.label },
    { id: "pip", label: "PIP" },
  ];

  const pipSmall = pipMain === "a" ? "b" : "a";

  // Both players live at FIXED positions in the element tree across every
  // mode — only classNames change. React therefore never remounts the
  // iframes, so switching layouts never reloads the streams or drops audio.
  const wrapperClass = (p: "a" | "b"): string => {
    if (mode === "split") {
      return "relative aspect-video w-full md:aspect-auto md:h-full md:min-h-0";
    }
    if (mode === "a" || mode === "b") {
      return mode === p
        ? "relative col-span-full h-full w-full"
        : "absolute h-0 w-0 overflow-hidden";
    }
    // pip
    return pipMain === p
      ? "absolute inset-0"
      : "absolute bottom-3 right-3 z-10 aspect-video w-[30%] min-w-[160px] overflow-hidden rounded-lg border border-gold/30 shadow-[0_10px_40px_rgba(0,0,0,0.7)]";
  };

  // Mobile keeps the stage COMPACT so chat owns the screen below it: split
  // renders the players side-by-side (small but always visible), solo/PiP
  // cap at 32vh. Desktop lets the stage flex to fill the column.
  const stageClass =
    mode === "split"
      ? "relative grid w-full grid-cols-2 gap-px bg-black md:min-h-0 md:flex-1 md:auto-rows-fr"
      : "relative aspect-video max-h-[32vh] w-full bg-black md:aspect-auto md:min-h-0 md:max-h-none md:flex-1";

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
                  setPipMain((p) => (p === "a" ? "b" : "a"));
                } else {
                  setMode(m.id);
                }
              }}
              className={`rounded-md px-2 py-1 font-mono text-[9px] tracking-widest transition-all sm:px-2.5 ${
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
        <div className={wrapperClass("a")}>
          {slotASrc ? (
            <iframe
              src={slotASrc}
              className="absolute inset-0 h-full w-full"
              allowFullScreen
              allow="autoplay; fullscreen"
              title="Primary Twitch stream"
            />
          ) : (
            <EmptySlot hint="no twitch channel set" />
          )}
          {mode === "pip" && pipMain !== "a" && (
            <button
              onClick={() => setPipMain("a")}
              title="Swap streams"
              className="absolute inset-0 z-10 transition-colors hover:bg-white/5"
              aria-label="Make the primary stream big"
            />
          )}
        </div>
        <div className={wrapperClass("b")}>
          {slotBSrc ? (
            <iframe
              src={slotBSrc}
              className="absolute inset-0 h-full w-full"
              allowFullScreen
              allow="autoplay; fullscreen"
              title="Second stream"
            />
          ) : (
            <EmptySlot hint="second stream slot — kick or a co-host" />
          )}
          {mode === "pip" && pipMain !== "b" && (
            <button
              onClick={() => setPipMain("b")}
              title="Swap streams"
              className="absolute inset-0 z-10 transition-colors hover:bg-white/5"
              aria-label="Make the second stream big"
            />
          )}
        </div>

        {/* live overlays — header pills cover status on phones */}
        <div className="pointer-events-none absolute left-3 top-3 z-10 hidden gap-2 sm:flex">
          <LiveTag
            name="Twitch"
            color={PLATFORM_META.twitch.color}
            status={statuses.twitch}
          />
          {slotB.kind !== "none" && (
            <LiveTag name={slotB.name} color={slotB.color} status={slotBStatus} />
          )}
        </div>
      </div>
    </section>
  );
}
