// ─── Kick connector ─────────────────────────────────────────────────────────
// Kick chat rides Pusher. We resolve the channel slug → chatroom id through
// our own /api/kick/channel proxy (Kick's API has no CORS), then subscribe to
// the public `chatrooms.<id>.v2` Pusher channel.

import type {
  Badge,
  ChatMessage,
  Connector,
  ConnectorEvents,
  NativeEmoteRef,
  PlatformStatus,
} from "../types";
import { parseKickEmotes } from "../emotes";

// Kick's public production Pusher app key, embedded in their web client.
const PUSHER_URL =
  "wss://ws-us2.pusher.com/app/32cbd69e4b950bf97679?protocol=7&client=js&version=8.4.0&flash=false";

const BACKOFF_MIN_MS = 1_000;
const BACKOFF_MAX_MS = 30_000;
const KEEPALIVE_MS = 60_000;
const VIEWER_REFRESH_MS = 60_000;

// After JSON.parse, the event name contains single backslashes.
const CHAT_EVENT = "App\\Events\\ChatMessageEvent";


const BADGE_MAP: Record<string, Badge> = {
  broadcaster: "owner",
  moderator: "mod",
  vip: "vip",
  subscriber: "sub",
  founder: "sub",
  og: "og",
  verified: "verified",
};

interface ChannelLookup {
  ok: boolean;
  chatroomId: number | null;
  live: boolean;
  viewers: number | null;
  title: string | null;
  detail?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export class KickConnector implements Connector {
  private readonly channel: string;
  private readonly events: ConnectorEvents;

  private active = false;
  private connected = false;
  private ws: WebSocket | null = null;
  private chatroomId: number | null = null;
  private backoffMs = BACKOFF_MIN_MS;

  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private viewerTimer: ReturnType<typeof setInterval> | null = null;

  private live = false;
  private viewers: number | null = null;
  private streamTitle: string | undefined;

  private idCounter = 0;

  constructor(channel: string, events: ConnectorEvents) {
    this.channel = channel.trim().toLowerCase();
    this.events = events;
  }

  start(): void {
    if (this.active) return;
    this.active = true;
    this.backoffMs = BACKOFF_MIN_MS;
    void this.connect(false);
  }

  stop(): void {
    this.active = false;
    this.connected = false;
    this.clearTimers();
    this.teardownSocket();
  }

  // ── connection flow ───────────────────────────────────────────────────────

  private async connect(isReconnect: boolean): Promise<void> {
    if (!this.active) return;

    this.emitStatus({
      state: isReconnect ? "reconnecting" : "connecting",
      detail: `looking up ${this.channel}`,
    });

    const lookup = await this.fetchChannel();
    if (!this.active) return;

    if (!lookup.ok || lookup.chatroomId === null) {
      this.emitStatus({
        state: "error",
        detail: `channel lookup failed: ${lookup.detail ?? "unknown"}`,
      });
      this.scheduleReconnect();
      return;
    }

    this.chatroomId = lookup.chatroomId;
    this.live = lookup.live;
    this.viewers = lookup.viewers;
    this.streamTitle = lookup.title ?? undefined;

    this.emitStatus({
      state: isReconnect ? "reconnecting" : "connecting",
      detail: "opening chat socket",
      live: this.live,
      viewers: this.viewers,
      streamTitle: this.streamTitle,
    });

    this.openSocket();
  }

  private openSocket(): void {
    if (!this.active) return;
    this.teardownSocket();

    let ws: WebSocket;
    try {
      ws = new WebSocket(PUSHER_URL);
    } catch (err) {
      this.emitStatus({
        state: "error",
        detail: err instanceof Error ? err.message : "websocket open failed",
      });
      this.scheduleReconnect();
      return;
    }

    this.ws = ws;

    ws.onmessage = (event: MessageEvent<unknown>) => {
      if (!this.active || this.ws !== ws) return;
      const raw: unknown = event.data;
      if (typeof raw !== "string") return;
      this.handleFrame(raw);
    };

    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.connected = false;
      this.clearIntervals();
      if (!this.active) return;
      this.scheduleReconnect();
    };

    ws.onerror = () => {
      // onclose always follows; reconnect is scheduled there.
    };
  }

  private handleFrame(raw: string): void {
    let frame: unknown;
    try {
      frame = JSON.parse(raw) as unknown;
    } catch {
      return;
    }
    if (!isRecord(frame) || typeof frame.event !== "string") return;

    switch (frame.event) {
      case "pusher:connection_established":
        this.send({
          event: "pusher:subscribe",
          data: { auth: "", channel: `chatrooms.${this.chatroomId}.v2` },
        });
        break;

      case "pusher_internal:subscription_succeeded":
        this.connected = true;
        this.backoffMs = BACKOFF_MIN_MS;
        this.emitStatus({
          state: "connected",
          detail: `joined ${this.channel} chat`,
          live: this.live,
          viewers: this.viewers,
          streamTitle: this.streamTitle,
        });
        this.startIntervals();
        break;

      case "pusher:ping":
        this.send({ event: "pusher:pong", data: {} });
        break;

      case CHAT_EVENT:
        if (typeof frame.data === "string") this.handleChatPayload(frame.data);
        break;

      default:
        break;
    }
  }

  // ── chat message parsing ──────────────────────────────────────────────────

  private handleChatPayload(encoded: string): void {
    let payload: unknown;
    try {
      payload = JSON.parse(encoded) as unknown;
    } catch {
      return;
    }
    if (!isRecord(payload)) return;

    const content = typeof payload.content === "string" ? payload.content : "";
    if (!content) return;

    const sender = isRecord(payload.sender) ? payload.sender : null;
    const senderName =
      sender && typeof sender.username === "string" ? sender.username : "";
    const senderSlug =
      sender && typeof sender.slug === "string" ? sender.slug : "";
    const username = (senderSlug || senderName).toLowerCase();
    if (!username) return;

    const identity =
      sender && isRecord(sender.identity) ? sender.identity : null;
    const color =
      identity && typeof identity.color === "string"
        ? identity.color
        : undefined;

    const badges: Badge[] = [];
    if (identity && Array.isArray(identity.badges)) {
      for (const entry of identity.badges as unknown[]) {
        if (!isRecord(entry) || typeof entry.type !== "string") continue;
        const mapped = BADGE_MAP[entry.type];
        if (mapped && !badges.includes(mapped)) badges.push(mapped);
      }
    }

    const nativeId =
      typeof payload.id === "string" || typeof payload.id === "number"
        ? String(payload.id)
        : `${Date.now()}-${++this.idCounter}`;

    let timestamp = Date.now();
    if (typeof payload.created_at === "string") {
      const parsed = Date.parse(payload.created_at);
      if (!Number.isNaN(parsed)) timestamp = parsed;
    }

    // [emote:id:name] → bare name in text + per-message image map; locate
    // each name's occurrences so the UI can render the actual images inline
    const { text: cleanText, emotes: emoteMap } = parseKickEmotes(content);
    let nativeEmotes: NativeEmoteRef[] | undefined;
    if (emoteMap.size > 0) {
      nativeEmotes = [];
      const chars = Array.from(cleanText);
      for (const [name, url] of emoteMap) {
        const nameLen = Array.from(name).length;
        for (let i = 0; i + nameLen <= chars.length; i += 1) {
          if (chars.slice(i, i + nameLen).join("") === name) {
            nativeEmotes.push({ name, url, start: i, end: i + nameLen - 1 });
            i += nameLen - 1;
          }
        }
      }
      nativeEmotes.sort((a, b) => a.start - b.start);
      if (nativeEmotes.length === 0) nativeEmotes = undefined;
    }

    const msg: ChatMessage = {
      id: `kick-${nativeId}`,
      platform: "kick",
      username,
      displayName: senderName || username,
      text: cleanText,
      color,
      badges,
      timestamp,
      nativeEmotes,
      // Neutral placeholder — useChat enriches centrally via scoreMessage().
      vibe: { score: 0, tags: [], toxic: false },
    };

    if (this.active) this.events.onMessage(msg);
  }

  // ── channel lookup + viewer refresh ───────────────────────────────────────

  private async fetchChannel(): Promise<ChannelLookup> {
    const failed = (detail: string): ChannelLookup => ({
      ok: false,
      chatroomId: null,
      live: false,
      viewers: null,
      title: null,
      detail,
    });

    // Kick's API permits cross-origin reads, and the browser's TLS fingerprint
    // passes Cloudflare where server-side fetches get 403'd — so go direct
    // first and only fall back to our proxy route.
    try {
      const res = await fetch(
        `https://kick.com/api/v2/channels/${encodeURIComponent(this.channel)}`,
        { cache: "no-store", headers: { accept: "application/json" } },
      );
      if (res.ok) {
        const data: unknown = await res.json();
        if (isRecord(data)) {
          const chatroom = isRecord(data.chatroom) ? data.chatroom : null;
          const chatroomId =
            chatroom && typeof chatroom.id === "number" ? chatroom.id : null;
          if (chatroomId !== null) {
            const ls = isRecord(data.livestream) ? data.livestream : null;
            return {
              ok: true,
              chatroomId,
              live: ls?.is_live === true,
              viewers:
                ls && typeof ls.viewer_count === "number"
                  ? ls.viewer_count
                  : null,
              title:
                ls && typeof ls.session_title === "string"
                  ? ls.session_title
                  : null,
            };
          }
        }
      } else if (res.status === 404) {
        return failed("channel not found");
      }
    } catch {
      // CORS/network hiccup — fall through to the proxy
    }

    try {
      const res = await fetch(
        `/api/kick/channel?slug=${encodeURIComponent(this.channel)}`,
        { cache: "no-store" },
      );
      const data: unknown = await res.json();
      if (!isRecord(data)) return failed("bad proxy response");
      if (data.ok !== true || typeof data.chatroomId !== "number") {
        return failed(
          typeof data.detail === "string" ? data.detail : "lookup rejected",
        );
      }
      return {
        ok: true,
        chatroomId: data.chatroomId,
        live: data.live === true,
        viewers: typeof data.viewers === "number" ? data.viewers : null,
        title: typeof data.title === "string" ? data.title : null,
      };
    } catch (err) {
      return failed(err instanceof Error ? err.message : "lookup fetch failed");
    }
  }

  private async refreshViewers(): Promise<void> {
    const lookup = await this.fetchChannel();
    if (!this.active || !this.connected) return;
    if (!lookup.ok) return;

    this.live = lookup.live;
    this.viewers = lookup.viewers;
    this.streamTitle = lookup.title ?? this.streamTitle;

    this.emitStatus({
      state: "connected",
      detail: `joined ${this.channel} chat`,
      live: this.live,
      viewers: this.viewers,
      streamTitle: this.streamTitle,
    });
  }

  // ── timers / reconnect ────────────────────────────────────────────────────

  private startIntervals(): void {
    this.clearIntervals();
    this.pingTimer = setInterval(() => {
      if (!this.active) return;
      this.send({ event: "pusher:ping", data: {} });
    }, KEEPALIVE_MS);
    this.viewerTimer = setInterval(() => {
      if (!this.active) return;
      void this.refreshViewers();
    }, VIEWER_REFRESH_MS);
  }

  private scheduleReconnect(): void {
    if (!this.active || this.reconnectTimer !== null) return;
    const delay = this.backoffMs;
    this.backoffMs = Math.min(this.backoffMs * 2, BACKOFF_MAX_MS);
    this.emitStatus({
      state: "reconnecting",
      detail: `retrying in ${Math.round(delay / 1000)}s`,
    });
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect(true);
    }, delay);
  }

  private clearIntervals(): void {
    if (this.pingTimer !== null) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    if (this.viewerTimer !== null) {
      clearInterval(this.viewerTimer);
      this.viewerTimer = null;
    }
  }

  private clearTimers(): void {
    this.clearIntervals();
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private teardownSocket(): void {
    const ws = this.ws;
    if (!ws) return;
    this.ws = null;
    ws.onopen = null;
    ws.onmessage = null;
    ws.onclose = null;
    ws.onerror = null;
    try {
      ws.close();
    } catch {
      // already closed
    }
  }

  // ── emit helpers ──────────────────────────────────────────────────────────

  private send(payload: { event: string; data: unknown }): void {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    try {
      ws.send(JSON.stringify(payload));
    } catch {
      // socket died between checks; onclose will handle it
    }
  }

  private emitStatus(status: PlatformStatus): void {
    if (!this.active) return;
    this.events.onStatus(status);
  }
}
