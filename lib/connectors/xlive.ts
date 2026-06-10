// ─── X live-broadcast chat connector ─────────────────────────────────────────
// Keyless: asks our /api/x/live route to resolve the anonymous Periscope chat
// endpoint for a user's live broadcast, then speaks the chatnow WebSocket
// protocol directly from the browser. When the user is offline it idles and
// re-probes every 90s, so a mid-session go-live is picked up automatically.

import type {
  ChatMessage,
  Connector,
  ConnectorEvents,
  PlatformStatus,
} from "../types";

const IDLE_PROBE_MS = 90_000;
const BACKOFF_MIN_MS = 1_000;
const BACKOFF_MAX_MS = 30_000;

interface LiveLookup {
  live: boolean;
  wsUrl: string | null;
  accessToken: string | null;
  roomId: string | null;
  broadcastTitle: string | null;
  detail: string;
}

// ── narrowing helpers ─────────────────────────────────────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function nonEmpty(value: string | null): string | null {
  return value !== null && value.length > 0 ? value : null;
}

/** JSON.parse that returns null instead of throwing — chat frames are hostile. */
function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function parseLookup(body: unknown): LiveLookup | null {
  if (!isRecord(body) || typeof body.live !== "boolean") return null;
  return {
    live: body.live,
    wsUrl: asString(body.wsUrl),
    accessToken: asString(body.accessToken),
    roomId: asString(body.roomId),
    broadcastTitle: asString(body.broadcastTitle),
    detail: asString(body.detail) ?? "",
  };
}

// ── connector ─────────────────────────────────────────────────────────────────

export class XLiveConnector implements Connector {
  private readonly user: string;
  private readonly events: ConnectorEvents;

  private ws: WebSocket | null = null;
  private stopped = true;
  private started = false;
  /** Incremented on every start/stop so stale async work can detect it is obsolete. */
  private generation = 0;
  private lookupTimer: ReturnType<typeof setTimeout> | null = null;

  private reconnectDelay = BACKOFF_MIN_MS;
  private msgCounter = 0;
  private lastStatusKey = "";
  private broadcastTitle: string | null = null;

  constructor(user: string, events: ConnectorEvents) {
    this.user = user.trim().replace(/^@/, "");
    this.events = events;
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    this.stopped = false;
    this.generation += 1;
    this.reconnectDelay = BACKOFF_MIN_MS;
    this.lastStatusKey = "";

    if (this.user.length === 0) {
      this.emitStatus({
        state: "unconfigured",
        detail: "set an X handle to watch for live broadcasts",
      });
      return;
    }

    this.emitStatus({ state: "connecting", detail: "looking for a live X broadcast…" });
    void this.lookup(this.generation);
  }

  stop(): void {
    this.stopped = true;
    this.started = false;
    this.generation += 1;
    this.clearLookupTimer();
    this.teardownSocket();
  }

  // ── internal plumbing ───────────────────────────────────────────────────────

  private isStale(gen: number): boolean {
    return this.stopped || gen !== this.generation;
  }

  private clearLookupTimer(): void {
    if (this.lookupTimer !== null) {
      clearTimeout(this.lookupTimer);
      this.lookupTimer = null;
    }
  }

  private teardownSocket(): void {
    const ws = this.ws;
    this.ws = null;
    if (ws) {
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
  }

  private emitStatus(status: PlatformStatus): void {
    if (this.stopped) return;
    const key = `${status.state}|${status.detail ?? ""}|${status.live === true ? "1" : "0"}`;
    if (key === this.lastStatusKey) return;
    this.lastStatusKey = key;
    this.events.onStatus(status);
  }

  private nextBackoff(): number {
    const delay = this.reconnectDelay;
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, BACKOFF_MAX_MS);
    return delay;
  }

  private scheduleLookup(gen: number, delayMs: number): void {
    if (this.isStale(gen)) return;
    this.clearLookupTimer();
    this.lookupTimer = setTimeout(() => {
      this.lookupTimer = null;
      void this.lookup(gen);
    }, delayMs);
  }

  // ── live lookup ─────────────────────────────────────────────────────────────

  private async lookup(gen: number): Promise<void> {
    if (this.isStale(gen)) return;

    let lookup: LiveLookup | null = null;
    try {
      const res = await fetch(`/api/x/live?user=${encodeURIComponent(this.user)}`, {
        cache: "no-store",
      });
      if (this.isStale(gen)) return;
      if (res.ok) {
        const body: unknown = await res.json();
        if (this.isStale(gen)) return;
        lookup = parseLookup(body);
      }
    } catch {
      // network failure — handled as a null lookup below
    }
    if (this.isStale(gen)) return;

    if (!lookup) {
      // Our own route unreachable or malformed — retry with backoff.
      this.emitStatus({ state: "reconnecting", detail: "X live lookup failed — retrying" });
      this.scheduleLookup(gen, this.nextBackoff());
      return;
    }

    if (!lookup.live || !lookup.wsUrl || !lookup.accessToken || !lookup.roomId) {
      // Offline (the normal weekly state). Probe every 90s so a mid-session
      // go-live is picked up automatically.
      this.reconnectDelay = BACKOFF_MIN_MS;
      this.emitStatus({
        state: "idle",
        detail: `X chat joins when @${this.user} goes live`,
        live: false,
      });
      this.scheduleLookup(gen, IDLE_PROBE_MS);
      return;
    }

    this.broadcastTitle = nonEmpty(lookup.broadcastTitle);
    this.connectSocket(gen, lookup.wsUrl, lookup.accessToken, lookup.roomId);
  }

  // ── chatnow socket ──────────────────────────────────────────────────────────

  private connectSocket(gen: number, wsUrl: string, accessToken: string, roomId: string): void {
    if (this.isStale(gen)) return;
    this.teardownSocket();

    let ws: WebSocket;
    try {
      ws = new WebSocket(wsUrl);
    } catch {
      this.emitStatus({ state: "reconnecting", detail: "X chat socket failed to open — retrying" });
      this.scheduleLookup(gen, this.nextBackoff());
      return;
    }
    this.ws = ws;

    ws.onopen = () => {
      if (this.stopped || this.ws !== ws || gen !== this.generation) return;
      try {
        // Periscope chatnow handshake: auth frame, then join-room frame.
        ws.send(JSON.stringify({ payload: JSON.stringify({ access_token: accessToken }), kind: 3 }));
        ws.send(
          JSON.stringify({
            payload: JSON.stringify({ body: JSON.stringify({ room: roomId }), kind: 1 }),
            kind: 2,
          }),
        );
      } catch {
        // send on a dying socket — onclose will drive the retry
        return;
      }
      const status: PlatformStatus = {
        state: "connected",
        detail: "live X chat (anon feed, ~3s delay)",
        live: true,
      };
      if (this.broadcastTitle) status.streamTitle = this.broadcastTitle;
      this.emitStatus(status);
    };

    ws.onmessage = (event: MessageEvent) => {
      if (this.stopped || this.ws !== ws || gen !== this.generation) return;
      // Any inbound traffic proves the session is healthy → reset backoff.
      this.reconnectDelay = BACKOFF_MIN_MS;
      const data: unknown = event.data;
      this.handleFrame(data);
    };

    ws.onclose = () => {
      if (this.stopped || this.ws !== ws || gen !== this.generation) return;
      // Broadcast may have ended OR the socket just hiccuped. Re-run the
      // lookup with backoff: live:true reconnects, live:false falls back to
      // the 90s idle probe.
      this.teardownSocket();
      const delay = this.nextBackoff();
      this.emitStatus({
        state: "reconnecting",
        detail: `X chat dropped — rechecking in ${Math.round(delay / 1000)}s`,
      });
      this.scheduleLookup(gen, delay);
    };

    ws.onerror = () => {
      // onclose fires after onerror; recovery handled there.
    };
  }

  // ── frame parsing ───────────────────────────────────────────────────────────
  // Frames are triple-nested JSON: { kind, payload } → payload is a JSON
  // string → { body, sender? } → body is ANOTHER JSON string → the message.
  // Every parse is guarded — one malformed frame must never kill the handler.

  private handleFrame(data: unknown): void {
    if (typeof data !== "string") return;

    const frame = safeJsonParse(data);
    if (!isRecord(frame) || frame.kind !== 1) return;

    const payloadRaw = asString(frame.payload);
    if (payloadRaw === null) return;
    const payload = safeJsonParse(payloadRaw);
    if (!isRecord(payload)) return;

    const bodyRaw = asString(payload.body);
    if (bodyRaw === null) return;
    const body = safeJsonParse(bodyRaw);
    if (!isRecord(body)) return;

    // type 1 = chat text; everything else (joins, hearts, control) is skipped.
    if (typeof body.type === "number" && body.type !== 1) return;
    const text = asString(body.body);
    if (text === null || text.trim().length === 0) return;

    const sender = isRecord(payload.sender) ? payload.sender : null;
    const username = (
      nonEmpty(asString(body.username)) ??
      (sender ? nonEmpty(asString(sender.username)) : null) ??
      "viewer"
    ).toLowerCase();
    const displayName =
      nonEmpty(asString(body.displayName)) ??
      (sender ? nonEmpty(asString(sender.display_name)) : null) ??
      username;
    const avatarUrl = sender ? (nonEmpty(asString(sender.profile_image_url)) ?? undefined) : undefined;

    this.msgCounter += 1;
    const uuid = nonEmpty(asString(body.uuid));
    const msg: ChatMessage = {
      id: uuid ? `xlive-${uuid}` : `xlive-${Date.now()}-${this.msgCounter}`,
      platform: "x",
      channel: this.user.toLowerCase(),
      username,
      displayName,
      text,
      badges: [],
      timestamp: Date.now(),
      avatarUrl,
      vibe: { score: 0, tags: [], toxic: false },
    };

    if (this.stopped) return;
    this.events.onMessage(msg);
  }
}
