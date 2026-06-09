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

  // drag-to-resize the chat column
  const onDragStart = (e: React.PointerEvent) => {
    dragRef.current = { startX: e.clientX, startW: chatWidth };
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
      setChatWidth((w) => {
        window.localStorage.setItem(CHAT_WIDTH_KEY, String(w));
        return w;
      });
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
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

      <Header
        brandName={config.brandName}
        brandPreset={config.brandPreset}
        statuses={chat.statuses}
        onOpenConfig={() => setConfigOpen(true)}
      />

      <Ticker />

      {/* main floor */}
      <main className="relative flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3 md:overflow-hidden lg:flex-row lg:items-stretch">
        {/* left column: stage + vibe */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
          <StreamStage
            twitchChannel={config.enabled.twitch ? config.twitchChannel : ""}
            kickChannel={config.enabled.kick ? config.kickChannel : ""}
            statuses={chat.statuses}
          />
          <VibePanel vibe={chat.vibe} />
        </div>

        {/* drag handle (desktop) */}
        <div
          onPointerDown={onDragStart}
          className="group hidden w-1.5 shrink-0 cursor-col-resize items-center justify-center lg:flex"
          title="Drag to resize chat"
        >
          <div className="h-16 w-[3px] rounded-full bg-white/8 transition-colors group-hover:bg-gold/40" />
        </div>

        {/* right column: the unified chat (CSS var carries the drag-resized width) */}
        <div
          className="relative flex min-h-[420px] flex-col lg:min-h-0 lg:w-[var(--chat-w)] lg:shrink-0"
          style={{ "--chat-w": `${chatWidth}px` } as React.CSSProperties}
        >
          <ChatFeed
            messages={chat.messages}
            paused={chat.paused}
            pendingCount={chat.pendingCount}
            totalCount={chat.totalCount}
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
