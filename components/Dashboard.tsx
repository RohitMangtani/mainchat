"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AppConfig } from "@/lib/types";
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

  // drag-to-resize the chat column — no transition while dragging (1:1
  // tracking); player iframes get pointer-events:none so they can't eat
  // the pointermove stream
  const persistWidth = (w: number) =>
    window.localStorage.setItem(CHAT_WIDTH_KEY, String(w));

  const onDragStart = (e: React.PointerEvent) => {
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
          onOpenConfig={() => setConfigOpen(true)}
        />
      </div>

      <div className="animate-rise [animation-delay:70ms]">
        <Ticker />
      </div>

      {/* main floor — no page scroll at any size: the stage stays pinned and
          the chat scrolls inside its own pane (the Twitch-mobile pattern) */}
      <main
        className={`relative flex min-h-0 flex-1 flex-col gap-2.5 overflow-hidden p-2.5 md:gap-3 md:p-3 lg:flex-row lg:items-stretch ${
          dragging ? "select-none [&_iframe]:pointer-events-none" : ""
        }`}
      >
        {/* left column: stage + vibe — compact and pinned on mobile */}
        <div className="flex min-w-0 shrink-0 animate-rise flex-col gap-2.5 [animation-delay:140ms] md:min-h-0 md:flex-1 md:gap-3">
          <StreamStage
            twitchChannel={config.enabled.twitch ? config.twitchChannel : ""}
            twitchChannel2={config.enabled.twitch ? config.twitchChannel2 : ""}
            kickChannel={config.enabled.kick ? config.kickChannel : ""}
            statuses={chat.statuses}
          />
          <VibePanel vibe={chat.vibe} />
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
          className="group hidden w-2.5 shrink-0 cursor-col-resize items-center justify-center outline-none lg:flex"
          title="Drag to resize chat · double-click to reset"
        >
          <div className="h-16 w-[3px] rounded-full bg-white/8 transition-colors group-hover:bg-gold/40 group-focus-visible:bg-gold/60 group-active:bg-gold/80" />
        </div>

        {/* right column: the unified chat fills whatever the stage doesn't
            use; on lg the CSS var carries the drag-resized width */}
        <div
          className="relative flex min-h-0 flex-1 animate-rise flex-col [animation-delay:210ms] lg:flex-none lg:w-[var(--chat-w)] lg:shrink-0"
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
