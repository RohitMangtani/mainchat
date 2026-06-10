"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AppConfig, PlatformStatus } from "@/lib/types";
import { MARKET_BUBBLE_DEFAULTS, loadConfig, saveConfig } from "@/lib/config";
import { useChat } from "@/lib/useChat";
import { ChatFeed } from "./ChatFeed";
import { ConfigPanel } from "./ConfigPanel";
import { Header } from "./Header";
import { StreamStage } from "./StreamStage";
import { Ticker } from "./Ticker";
import { VibePanel } from "./VibePanel";

const CHAT_WIDTH_KEY = "mainchat.chatWidth.v1";
const MIN_CHAT = 300;
const MAX_CHAT = 600;

type StreamInfo = Pick<PlatformStatus, "live" | "viewers" | "streamTitle">;

/** Next Thursday 1:00 PM Pacific (the show's slot). Pacific is UTC-7 in
 *  the summer months this targets. */
function nextShowTime(): Date {
  const now = new Date();
  for (let d = 0; d < 8; d += 1) {
    const candidate = new Date(now.getTime() + d * 86_400_000);
    const la = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Los_Angeles",
      weekday: "short",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(candidate);
    const get = (t: string) => la.find((p) => p.type === t)?.value ?? "";
    if (get("weekday") === "Thu") {
      const target = new Date(
        `${get("year")}-${get("month")}-${get("day")}T13:00:00-07:00`,
      );
      if (target.getTime() > now.getTime()) return target;
    }
  }
  return new Date(now.getTime() + 7 * 86_400_000);
}

/** Off-air state a judge actually sees: when no stream is live, say when the
 *  next show is and offer the simulated crowd in one tap. */
function OffAirBanner({
  onDemo,
  demoOn,
}: {
  onDemo: (on: boolean) => void;
  demoOn: boolean;
}) {
  const [now, setNow] = useState(() => Date.now());
  const [target] = useState(() => nextShowTime());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const ms = Math.max(0, target.getTime() - now);
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);

  return (
    <div className="flex items-center gap-2.5 border-b hairline bg-ink-1/40 px-3 py-1.5 md:px-5">
      <span className="h-1.5 w-1.5 rounded-full bg-faint" />
      <p className="min-w-0 truncate font-mono text-[10px] tracking-wider text-muted">
        OFF AIR · NEXT SHOW THU 1:00 PM PT
        <span className="text-cream/80"> · in {h}h {m}m</span>
      </p>
      <button
        onClick={() => onDemo(!demoOn)}
        className={`ml-auto shrink-0 rounded-md border px-2.5 py-1 font-mono text-[9px] tracking-widest transition-colors ${
          demoOn
            ? "border-gold/40 bg-gold/15 text-gold"
            : "border-white/10 text-muted hover:border-gold/40 hover:text-gold"
        }`}
      >
        {demoOn ? "DEMO CROWD ON — STOP" : "SIMULATE THE CROWD"}
      </button>
    </div>
  );
}

/** Live/viewer info for the optional second Twitch stream — its chat
 *  connector deliberately doesn't own a status pill, so the dashboard
 *  polls the info route directly (shared by the header sum + stage tag). */
function useTwitch2Info(channel: string): StreamInfo {
  const [info, setInfo] = useState<StreamInfo>({});
  useEffect(() => {
    const ch = channel.trim();
    if (ch === "") {
      setInfo({});
      return undefined;
    }
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch(`/api/twitch/info?channel=${encodeURIComponent(ch)}`, {
          cache: "no-store",
        });
        const d: unknown = await res.json();
        if (cancelled || typeof d !== "object" || d === null) return;
        const r = d as { ok?: boolean; live?: boolean; viewers?: number | null; title?: string | null };
        if (r.ok) {
          setInfo({
            live: r.live === true,
            viewers: r.viewers ?? null,
            streamTitle: r.title ?? undefined,
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
  }, [channel]);
  return info;
}

export function Dashboard() {
  // start from defaults on both server and client, then hydrate the saved
  // config after mount — keeps SSR markup deterministic
  const [config, setConfig] = useState<AppConfig>(MARKET_BUBBLE_DEFAULTS);
  const [hydrated, setHydrated] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [chatWidth, setChatWidth] = useState(400);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{ startX: number; startW: number } | null>(null);

  useEffect(() => {
    setConfig(loadConfig());
    const w = Number(window.localStorage.getItem(CHAT_WIDTH_KEY));
    if (w >= MIN_CHAT && w <= MAX_CHAT) setChatWidth(w);
    setHydrated(true);
  }, []);

  const applyConfig = useCallback((next: AppConfig) => {
    setConfig(next);
    saveConfig(next);
  }, []);

  const chat = useChat(hydrated ? config : { ...config, enabled: { twitch: false, kick: false, x: false }, demoMode: false });
  const twitch2Info = useTwitch2Info(
    hydrated && config.enabled.twitch ? config.twitchChannel2 : "",
  );

  // drag-to-resize the chat column — no transition while dragging (1:1
  // tracking); player iframes get pointer-events:none so they can't eat
  // the pointermove stream
  const persistWidth = (w: number) =>
    window.localStorage.setItem(CHAT_WIDTH_KEY, String(w));

  const onDragStart = (e: React.PointerEvent) => {
    // capture the pointer so the stream survives leaving the 10px handle;
    // touch-action:none on the handle stops the browser claiming the swipe
    // as a pan (which would pointercancel the drag on tablets)
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startW: chatWidth };
    setDragging(true);
    const onMove = (ev: PointerEvent) => {
      if (!dragRef.current) return;
      const next = Math.min(
        MAX_CHAT,
        Math.max(MIN_CHAT, dragRef.current.startW - (ev.clientX - dragRef.current.startX)),
      );
      setChatWidth(next);
    };
    const onUp = () => {
      dragRef.current = null;
      setDragging(false);
      setChatWidth((w) => {
        persistWidth(w);
        return w;
      });
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const nudgeWidth = (delta: number) => {
    setChatWidth((w) => {
      const next = Math.min(MAX_CHAT, Math.max(MIN_CHAT, w + delta));
      persistWidth(next);
      return next;
    });
  };

  return (
    <div className="relative flex h-dvh flex-col">
      {/* gold atmosphere behind the header */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-64"
        style={{
          background:
            "radial-gradient(60% 100% at 50% 0%, rgba(245,196,0,0.07) 0%, transparent 70%)",
        }}
      />

      {/* staggered load reveal — one orchestrated entrance, then stillness */}
      <div className="animate-rise">
        <Header
          brandName={config.brandName}
          brandPreset={config.brandPreset}
          statuses={chat.statuses}
          twitch2Info={twitch2Info}
          onOpenConfig={() => setConfigOpen(true)}
        />
      </div>

      <div className="animate-rise [animation-delay:70ms]">
        <Ticker />
      </div>

      {hydrated &&
        !chat.statuses.twitch.live &&
        !chat.statuses.kick.live &&
        !twitch2Info.live && (
          <OffAirBanner
            demoOn={config.demoMode}
            onDemo={(on) => applyConfig({ ...config, demoMode: on })}
          />
        )}

      {/* main floor — no page scroll at any size: the stage stays pinned and
          the chat scrolls inside its own pane (the Twitch-mobile pattern) */}
      <main
        className={`relative flex min-h-0 flex-1 flex-col gap-2.5 overflow-hidden p-2.5 short:flex-row short:items-stretch short:gap-2 short:p-2 md:gap-3 md:p-3 lg:flex-row lg:items-stretch ${
          dragging ? "select-none [&_iframe]:pointer-events-none" : ""
        }`}
      >
        {/* left column: stage + vibe — compact and pinned on mobile */}
        <div className="flex min-w-0 shrink-0 animate-rise flex-col gap-2.5 [animation-delay:140ms] short:min-h-0 short:flex-1 md:min-h-0 md:flex-1 md:gap-3">
          <StreamStage
            twitchChannel={config.enabled.twitch ? config.twitchChannel : ""}
            twitchChannel2={config.enabled.twitch ? config.twitchChannel2 : ""}
            kickChannel={config.enabled.kick ? config.kickChannel : ""}
            statuses={chat.statuses}
            twitch2Info={twitch2Info}
          />
          {/* the vibe strip yields its height to the players on short screens */}
          <div className="short:hidden">
            <VibePanel vibe={chat.vibe} />
          </div>
        </div>

        {/* drag handle (desktop) — W3C window-splitter semantics */}
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize chat column"
          aria-valuenow={chatWidth}
          aria-valuemin={MIN_CHAT}
          aria-valuemax={MAX_CHAT}
          tabIndex={0}
          onPointerDown={onDragStart}
          onDoubleClick={() => {
            setChatWidth(400);
            persistWidth(400);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") nudgeWidth(16);
            if (e.key === "ArrowRight") nudgeWidth(-16);
            if (e.key === "Home") nudgeWidth(MAX_CHAT);
            if (e.key === "End") nudgeWidth(-MAX_CHAT);
          }}
          className="group relative hidden w-2.5 shrink-0 cursor-col-resize touch-none items-center justify-center outline-none after:absolute after:inset-y-0 after:-inset-x-2.5 lg:flex"
          title="Drag to resize chat · double-click to reset"
        >
          <div className="h-16 w-[3px] rounded-full bg-white/8 transition-colors group-hover:bg-gold/40 group-focus-visible:bg-gold/60 group-active:bg-gold/80" />
        </div>

        {/* right column: the unified chat fills whatever the stage doesn't
            use; on lg the CSS var carries the drag-resized width */}
        <div
          className="relative flex min-h-0 flex-1 animate-rise flex-col [animation-delay:210ms] short:min-h-0 short:w-[320px] short:flex-none short:shrink-0 lg:flex-none lg:w-[var(--chat-w)] lg:shrink-0"
          style={{ "--chat-w": `${chatWidth}px` } as React.CSSProperties}
        >
          <ChatFeed
            messages={chat.messages}
            paused={chat.paused}
            pendingCount={chat.pendingCount}
            totalCount={chat.totalCount}
            msgRate={chat.vibe.rate}
            onPause={() => chat.setPaused(true)}
            onResume={chat.resume}
            onClear={chat.clearFeed}
            filterToxic={config.toxicityFilter}
          />
        </div>
      </main>

      <ConfigPanel
        open={configOpen}
        config={config}
        onChange={applyConfig}
        onClose={() => setConfigOpen(false)}
      />
    </div>
  );
}
