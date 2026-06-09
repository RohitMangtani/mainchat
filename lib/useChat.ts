"use client";

// ─── useChat: the Mainchat orchestrator hook ────────────────────────────────
// Owns connector lifecycles (one effect per platform), batches inbound
// messages on a 120ms tick so React render cost stays flat under load,
// enriches every message with a vibe score, and exposes pause/resume
// semantics for the feed.

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AppConfig,
  ChatMessage,
  ConnState,
  Connector,
  ConnectorEvents,
  PlatformId,
  PlatformStatus,
  VibeSnapshot,
} from "./types";
import { scoreMessage, VibeTracker } from "./vibe";
import { TwitchConnector } from "./connectors/twitch";
import { KickConnector } from "./connectors/kick";
import { XConnector } from "./connectors/x";
import { DemoConnector } from "./connectors/demo";

const MAX_MESSAGES = 350;
const FLUSH_INTERVAL_MS = 120;
const VIBE_INTERVAL_MS = 2000;
const ALL_PLATFORMS: readonly PlatformId[] = ["twitch", "kick", "x"];

export interface UseChatResult {
  /** Oldest → newest, capped at 350. */
  messages: ChatMessage[];
  statuses: Record<PlatformId, PlatformStatus>;
  vibe: VibeSnapshot;
  paused: boolean;
  setPaused: (p: boolean) => void;
  /** Messages held while paused. */
  pendingCount: number;
  /** Flush held messages and unpause. */
  resume: () => void;
  clearFeed: () => void;
}

function initialStatuses(): Record<PlatformId, PlatformStatus> {
  return {
    twitch: { state: "idle" },
    kick: { state: "idle" },
    x: { state: "idle" },
  };
}

function emptyVibe(): VibeSnapshot {
  return {
    meter: 0,
    label: "quiet",
    topChatters: [],
    keywords: [],
    betCount: 0,
    rate: 0,
  };
}

function isPlatformId(value: unknown): value is PlatformId {
  return value === "twitch" || value === "kick" || value === "x";
}

export function useChat(config: AppConfig): UseChatResult {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [statuses, setStatuses] = useState<Record<PlatformId, PlatformStatus>>(
    initialStatuses,
  );
  const [vibe, setVibe] = useState<VibeSnapshot>(emptyVibe);
  const [paused, setPausedState] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

  // Refs back the hot ingest path so connector callbacks stay stable across
  // renders and never close over stale state.
  const bufferRef = useRef<ChatMessage[]>([]);
  const heldRef = useRef<ChatMessage[]>([]);
  const pausedRef = useRef(false);
  const trackerRef = useRef<VibeTracker | null>(null);
  if (trackerRef.current === null) {
    trackerRef.current = new VibeTracker();
  }

  // ── Shared ingest path (all connectors funnel through here) ──────────────
  const ingest = useCallback((msg: ChatMessage) => {
    const enriched: ChatMessage = { ...msg, vibe: scoreMessage(msg.text) };
    trackerRef.current?.add(enriched);
    if (pausedRef.current) {
      heldRef.current.push(enriched);
      setPendingCount(heldRef.current.length);
    } else {
      bufferRef.current.push(enriched);
    }
  }, []);

  // Partial updates (e.g. a viewer-count refresh) merge into existing status.
  const mergeStatus = useCallback(
    (platform: PlatformId, incoming: PlatformStatus) => {
      setStatuses((prev) => ({
        ...prev,
        [platform]: { ...prev[platform], ...incoming },
      }));
    },
    [],
  );

  // Full replacement — used when a platform goes unconfigured/disabled so
  // stale detail/viewers/live flags don't linger.
  const replaceStatus = useCallback(
    (platform: PlatformId, state: ConnState) => {
      setStatuses((prev) => ({ ...prev, [platform]: { state } }));
    },
    [],
  );

  const makeEvents = useCallback(
    (platform: PlatformId): ConnectorEvents => ({
      onMessage: ingest,
      onStatus: (status) => {
        mergeStatus(platform, status);
      },
    }),
    [ingest, mergeStatus],
  );

  // ── Twitch lifecycle ──────────────────────────────────────────────────────
  useEffect(() => {
    const channel = config.twitchChannel.trim();
    if (config.enabled.twitch && channel !== "") {
      const connector: Connector = new TwitchConnector(
        channel,
        makeEvents("twitch"),
      );
      connector.start();
      return () => {
        connector.stop();
      };
    }
    replaceStatus("twitch", config.enabled.twitch ? "unconfigured" : "disabled");
    return undefined;
  }, [config.twitchChannel, config.enabled.twitch, makeEvents, replaceStatus]);

  // ── Kick lifecycle ────────────────────────────────────────────────────────
  useEffect(() => {
    const channel = config.kickChannel.trim();
    if (config.enabled.kick && channel !== "") {
      const connector: Connector = new KickConnector(
        channel,
        makeEvents("kick"),
      );
      connector.start();
      return () => {
        connector.stop();
      };
    }
    replaceStatus("kick", config.enabled.kick ? "unconfigured" : "disabled");
    return undefined;
  }, [config.kickChannel, config.enabled.kick, makeEvents, replaceStatus]);

  // ── X lifecycle ───────────────────────────────────────────────────────────
  useEffect(() => {
    const query = config.xQuery.trim();
    if (config.enabled.x && query !== "") {
      const connector: Connector = new XConnector(query, makeEvents("x"));
      connector.start();
      return () => {
        connector.stop();
      };
    }
    replaceStatus("x", config.enabled.x ? "unconfigured" : "disabled");
    return undefined;
  }, [config.xQuery, config.enabled.x, makeEvents, replaceStatus]);

  // ── Demo lifecycle ────────────────────────────────────────────────────────
  // Keyed off a stable JSON string so toggling one platform restarts the demo
  // connector with the new platform mix, but unrelated config edits don't.
  const enabledKey = JSON.stringify(
    ALL_PLATFORMS.filter((p) => config.enabled[p]),
  );

  useEffect(() => {
    if (!config.demoMode) return undefined;
    const parsed: unknown = JSON.parse(enabledKey);
    let platforms: PlatformId[] = Array.isArray(parsed)
      ? parsed.filter(isPlatformId)
      : [];
    if (platforms.length === 0) {
      platforms = [...ALL_PLATFORMS];
    }
    const events: ConnectorEvents = {
      onMessage: ingest,
      onStatus: (status) => {
        for (const p of platforms) {
          mergeStatus(p, status);
        }
      },
    };
    const connector: Connector = new DemoConnector(platforms, events);
    connector.start();
    return () => {
      connector.stop();
    };
  }, [config.demoMode, enabledKey, ingest, mergeStatus]);

  // ── Flush tick: drain the buffer into React state in one setState ────────
  useEffect(() => {
    const id = window.setInterval(() => {
      if (bufferRef.current.length === 0) return;
      const batch = bufferRef.current;
      bufferRef.current = [];
      setMessages((prev) => {
        const next = prev.concat(batch);
        return next.length > MAX_MESSAGES
          ? next.slice(next.length - MAX_MESSAGES)
          : next;
      });
    }, FLUSH_INTERVAL_MS);
    return () => {
      window.clearInterval(id);
    };
  }, []);

  // ── Vibe tick ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const id = window.setInterval(() => {
      const tracker = trackerRef.current;
      if (tracker) setVibe(tracker.snapshot());
    }, VIBE_INTERVAL_MS);
    return () => {
      window.clearInterval(id);
    };
  }, []);

  // ── Pause / resume / clear ────────────────────────────────────────────────
  const setPaused = useCallback((p: boolean) => {
    pausedRef.current = p;
    setPausedState(p);
  }, []);

  const resume = useCallback(() => {
    if (heldRef.current.length > 0) {
      bufferRef.current = bufferRef.current.concat(heldRef.current);
      heldRef.current = [];
    }
    setPendingCount(0);
    pausedRef.current = false;
    setPausedState(false);
  }, []);

  const clearFeed = useCallback(() => {
    bufferRef.current = [];
    heldRef.current = [];
    setPendingCount(0);
    setMessages([]);
  }, []);

  return {
    messages,
    statuses,
    vibe,
    paused,
    setPaused,
    pendingCount,
    resume,
    clearFeed,
  };
}
