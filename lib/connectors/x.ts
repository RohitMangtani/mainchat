import type {
  ChatMessage,
  Connector,
  ConnectorEvents,
  PlatformStatus,
} from "../types";

const POLL_MS = 25_000;
const UNCONFIGURED_POLL_MS = 60_000;
const FIRST_BATCH_LIMIT = 8;
const QUERY_DETAIL_MAX = 40;

interface PolledTweet {
  id: string;
  text: string;
  username: string;
  name: string;
  avatarUrl?: string;
  verified: boolean;
  createdAt: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? (value as unknown[]) : [];
}

function parseTweet(raw: unknown): PolledTweet | null {
  if (!isRecord(raw)) return null;
  const id = asString(raw.id);
  const text = asString(raw.text);
  const username = asString(raw.username);
  if (!id || text === null || !username) return null;
  const createdAt = typeof raw.createdAt === "number" ? raw.createdAt : Date.now();
  return {
    id,
    text,
    username,
    name: asString(raw.name) ?? username,
    avatarUrl: asString(raw.avatarUrl) ?? undefined,
    verified: raw.verified === true,
    createdAt,
  };
}

/** Strip a single trailing "https://t.co/..." link (X appends these for media/quotes). */
function stripTrailingLink(text: string): string {
  const stripped = text.replace(/\s*https:\/\/t\.co\/\S+\s*$/, "").trimEnd();
  return stripped.length > 0 ? stripped : text.trim();
}

function truncateQuery(query: string): string {
  return query.length > QUERY_DETAIL_MAX ? `${query.slice(0, QUERY_DETAIL_MAX)}…` : query;
}

export class XConnector implements Connector {
  private readonly query: string;
  private readonly events: ConnectorEvents;

  private stopped = true;
  private started = false;
  /** Incremented on every start/stop so stale async work can detect it is obsolete. */
  private generation = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;

  private sinceId: string | null = null;
  private firstBatch = true;
  private unconfigured = false;
  /** 401/403/400 from X — polling fast can't fix these */
  private permanentError = false;
  private rateBackoff = false;
  private lastStatusKey = "";
  private idCounter = 0;

  constructor(query: string, events: ConnectorEvents) {
    this.query = query;
    this.events = events;
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    this.stopped = false;
    this.generation += 1;
    this.sinceId = null;
    this.firstBatch = true;
    this.unconfigured = false;
    this.rateBackoff = false;
    this.lastStatusKey = "";

    const gen = this.generation;
    this.emitStatus({ state: "connecting", detail: "polling X search" });
    void this.poll(gen);
  }

  stop(): void {
    this.stopped = true;
    this.started = false;
    this.generation += 1;
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private isStale(gen: number): boolean {
    return this.stopped || gen !== this.generation;
  }

  private emitStatus(status: PlatformStatus): void {
    if (this.stopped) return;
    const key = `${status.state}|${status.detail ?? ""}`;
    if (key === this.lastStatusKey) return;
    this.lastStatusKey = key;
    this.events.onStatus(status);
  }

  private currentIntervalMs(): number {
    // permanent failures (bad token / bad query) and the unconfigured state
    // poll slowly — enough to self-heal when the operator fixes the cause,
    // without hammering a request that cannot succeed
    if (this.unconfigured || this.permanentError) return UNCONFIGURED_POLL_MS;
    return this.rateBackoff ? POLL_MS * 2 : POLL_MS;
  }

  private schedule(gen: number): void {
    if (this.isStale(gen)) return;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.poll(gen);
    }, this.currentIntervalMs());
  }

  private async poll(gen: number): Promise<void> {
    if (this.isStale(gen)) return;

    try {
      const params = new URLSearchParams({ query: this.query });
      if (this.sinceId) params.set("sinceId", this.sinceId);
      const res = await fetch(`/api/x/stream?${params.toString()}`, { cache: "no-store" });
      if (this.isStale(gen)) return;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const body: unknown = await res.json();
      if (this.isStale(gen)) return;
      this.handleResponse(gen, body);
    } catch {
      if (this.isStale(gen)) return;
      this.emitStatus({ state: "reconnecting", detail: "X poll failed — retrying" });
    }

    this.schedule(gen);
  }

  private handleResponse(gen: number, body: unknown): void {
    if (!isRecord(body)) {
      this.emitStatus({ state: "reconnecting", detail: "X poll failed — retrying" });
      return;
    }

    if (body.configured === false) {
      this.unconfigured = true;
      this.emitStatus({
        state: "unconfigured",
        detail: "Set X_BEARER_TOKEN to stream live X posts",
      });
      return;
    }
    this.unconfigured = false;

    if (body.rateLimited === true) {
      this.rateBackoff = true;
      this.emitStatus({ state: "connected", detail: "X rate limit — backing off" });
      return;
    }

    const apiError = asString(body.error);
    if (apiError !== null) {
      // 401/403 = bad or revoked token, 400 = malformed query — retrying at
      // full cadence can't fix these, so surface a real error state instead
      // of an eternal yellow "reconnecting"
      if (apiError === "401" || apiError === "403") {
        this.permanentError = true;
        this.emitStatus({
          state: "error",
          detail: "X rejected the API token (check X_BEARER_TOKEN)",
        });
      } else if (apiError === "400") {
        this.permanentError = true;
        this.emitStatus({
          state: "error",
          detail: "X rejected the search query — edit it in settings",
        });
      } else {
        this.emitStatus({ state: "reconnecting", detail: `X API error ${apiError} — retrying` });
      }
      return;
    }

    // Clean response.
    this.rateBackoff = false;
    this.permanentError = false;
    this.emitStatus({
      state: "connected",
      detail: `watching X for: ${truncateQuery(this.query)}`,
    });

    const tweets: PolledTweet[] = [];
    for (const raw of asArray(body.tweets)) {
      const tweet = parseTweet(raw);
      if (tweet) tweets.push(tweet);
    }

    // Newest first, so first-batch backfill keeps only the most recent posts.
    tweets.sort((a, b) => b.createdAt - a.createdAt);
    const batch = this.firstBatch ? tweets.slice(0, FIRST_BATCH_LIMIT) : tweets;
    this.firstBatch = false;
    batch.reverse(); // emit oldest-first

    const newestId = asString(body.newestId);
    if (newestId) {
      this.sinceId = newestId;
    } else if (tweets.length > 0) {
      this.sinceId = tweets[0].id;
    }

    for (const tweet of batch) {
      if (this.isStale(gen)) return;
      this.events.onMessage(this.toChatMessage(tweet));
    }
  }

  private toChatMessage(tweet: PolledTweet): ChatMessage {
    this.idCounter += 1;
    const id = tweet.id ? `x-${tweet.id}` : `x-fallback-${this.idCounter}`;
    return {
      id,
      platform: "x",
      username: tweet.username.toLowerCase(),
      displayName: tweet.name,
      text: stripTrailingLink(tweet.text),
      badges: tweet.verified ? ["verified"] : [],
      timestamp: tweet.createdAt,
      avatarUrl: tweet.avatarUrl,
      vibe: { score: 0, tags: [], toxic: false },
    };
  }
}
