"use client";

import { useEffect, useMemo, useRef } from "react";
import { useSearchParams } from "next/navigation";
import type { AppConfig } from "@/lib/types";
import { MARKET_BUBBLE_DEFAULTS } from "@/lib/config";
import { useChat } from "@/lib/useChat";
import { MessageRow } from "./MessageRow";

const MAX_OVERLAY_ROWS = 18;

/** Transparent unified-feed overlay for OBS. Channels via URL params. */
export function OverlayFeed() {
  const params = useSearchParams();

  const config: AppConfig = useMemo(() => {
    const d = MARKET_BUBBLE_DEFAULTS;
    const twitch = params.get("twitch") ?? d.twitchChannel;
    const kick = params.get("kick") ?? d.kickChannel;
    const xQuery = params.get("x") ?? d.xQuery;
    return {
      ...d,
      twitchChannel: twitch,
      kickChannel: kick,
      xQuery,
      enabled: {
        twitch: twitch.trim() !== "",
        kick: kick.trim() !== "",
        x: xQuery.trim() !== "",
      },
      demoMode: params.get("demo") === "1",
      toxicityFilter: params.get("unfiltered") !== "1",
    };
  }, [params]);

  const chat = useChat(config);
  const endRef = useRef<HTMLDivElement>(null);

  // glance mode: opaque, huge type, zero interaction — a confidence monitor
  // the hosts can read from the desk, ten feet away
  const glance = params.get("mode") === "glance";

  // transparent canvas, no grain — globals.css keys off this class
  useEffect(() => {
    if (glance) return undefined; // glance keeps the broadcast-black canvas
    document.body.classList.add("overlay-mode");
    return () => document.body.classList.remove("overlay-mode");
  }, [glance]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [chat.messages]);

  const rows = chat.messages.slice(glance ? -12 : -MAX_OVERLAY_ROWS);

  return (
    <div
      className="flex h-dvh flex-col justify-end overflow-hidden px-2 pb-2 [mask-image:linear-gradient(to_bottom,transparent,black_18%)]"
      style={glance ? { zoom: 1.7 } : undefined}
    >
      {rows.map((m) => (
        <div
          key={m.id}
          className={`mb-0.5 w-fit max-w-full rounded-md ${
            glance ? "" : "bg-ink-0/85 backdrop-blur-sm"
          }`}
        >
          <MessageRow msg={m} filterToxic={config.toxicityFilter} />
        </div>
      ))}
      <div ref={endRef} />
    </div>
  );
}
