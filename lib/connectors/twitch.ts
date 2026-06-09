// ─── Twitch connector ───────────────────────────────────────────────────────
// Anonymous read-only Twitch IRC over WebSocket, plus a viewer-count poller
// that hits our own /api/twitch/info proxy.

import type {
  Badge,
  ChatMessage,
  ConnState,
  Connector,
  ConnectorEvents,
  PlatformStatus,
  VibeInfo,
} from "../types";
import { parseTwitchEmoteTag } from "../emotes";

const IRC_URL = "wss://irc-ws.chat.twitch.tv:443";
const BACKOFF_MIN_MS = 1_000;
const BACKOFF_MAX_MS = 30_000;
const INFO_POLL_MS = 60_000;
const INFO_FIRST_DELAY_MS = 3_000;

const NEUTRAL_VIBE: VibeInfo = { score: 0, tags: [], toxic: false };

interface ParsedIrcLine {
  tags: Record<string, string>;
  nick: string;
  command: string;
  channel: string;
  trailing: string;
}

/** Unescape IRC v3 tag values: \s → space, \: → ";", \\ → "\", \r, \n. */
function unescapeTagValue(value: string): string {
  let out = "";
  let i = 0;
  while (i < value.length) {
    const ch = value[i];
    if (ch === "\\" && i + 1 < value.length) {
      const next = value[i + 1];
      switch (next) {
        case "s":
          out += " ";
          break;
        case ":":
          out += ";";
          break;
        case "\\":
          out += "\\";
          break;
        case "r":
          out += "\r";
          break;
        case "n":
          out += "\n";
          break;
        default:
          out += next;
          break;
      }
      i += 2;
    } else {
      out += ch;
      i += 1;
    }
  }
  return out;
}

/** Minimal robust IRC line parser for the message shapes Twitch sends. */
function parseIrcLine(line: string): ParsedIrcLine | null {
  let rest = line;
  const tags: Record<string, string> = {};

  if (rest.startsWith("@")) {
    const spaceIdx = rest.indexOf(" ");
    if (spaceIdx === -1) return null;
    const rawTags = rest.slice(1, spaceIdx);
    rest = rest.slice(spaceIdx + 1);
    for (const pair of rawTags.split(";")) {
      const eq = pair.indexOf("=");
      if (eq === -1) {
        if (pair.length > 0) tags[pair] = "";
      } else {
        tags[pair.slice(0, eq)] = unescapeTagValue(pair.slice(eq + 1));
      }
    }
  }

  let nick = "";
  if (rest.startsWith(":")) {
    const spaceIdx = rest.indexOf(" ");
    if (spaceIdx === -1) return null;
    const source = rest.slice(1, spaceIdx);
    rest = rest.slice(spaceIdx + 1);
    const bangIdx = source.indexOf("!");
    nick = bangIdx === -1 ? source : source.slice(0, bangIdx);
  }

  let trailing = "";
  const trailingIdx = rest.indexOf(" :");
  let middle = rest;
  if (trailingIdx !== -1) {
    trailing = rest.slice(trailingIdx + 2);
    middle = rest.slice(0, trailingIdx);
  }

  const parts = middle.split(" ").filter((p) => p.length > 0);
  if (parts.length === 0) return null;
  const command = parts[0];
  const channel = parts.find((p) => p.startsWith("#")) ?? "";

  return { tags, nick, command, channel, trailing };
}

/** Map Twitch badge list ("broadcaster/1,subscriber/12") to our Badge type. */
function mapBadges(raw: string | undefined): Badge[] {
  if (!raw) return [];
  const badges: Badge[] = [];
  for (const entry of raw.split(",")) {
    const name = entry.split("/")[0];
    switch (name) {
      case "broadcaster":
        if (!badges.includes("owner")) badges.push("owner");
        break;
      case "moderator":
        if (!badges.includes("mod")) badges.push("mod");
        break;
      case "vip":
        if (!badges.includes("vip")) badges.push("vip");
        break;
      case "subscriber":
      case "founder":
        if (!badges.includes("sub")) badges.push("sub");
        break;
      default:
        break;
    }
  }
  return badges;
}

interface InfoPayload {
  ok: boolean;
  live: boolean;
  viewers: number | null;
  title: string | null;
}

function parseInfoPayload(data: unknown): InfoPayload | null {
  if (typeof data !== "object" || data === null) return null;
  const obj = data as Record<string, unknown>;
  if (typeof obj.ok !== "boolean") return null;
  const live = typeof obj.live === "boolean" ? obj.live : false;
  const viewers = typeof obj.viewers === "number" ? obj.viewers : null;
  const title = typeof obj.title === "string" ? obj.title : null;
  return { ok: obj.ok, live, viewers, title };
}

export class TwitchConnector implements Connector {
  private readonly channel: string;
  private readonly events: ConnectorEvents;

  private ws: WebSocket | null = null;
  private stopped = true;
  private started = false;
  private joined = false;

  private reconnectDelay = BACKOFF_MIN_MS;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private infoTimer: ReturnType<typeof setTimeout> | null = null;

  private msgCounter = 0;
  private lastState: ConnState = "idle";
  private lastDetail: string | undefined;
  private live: boolean | undefined;
  private viewers: number | null | undefined;
  private streamTitle: string | undefined;

  constructor(channel: string, events: ConnectorEvents) {
    this.channel = channel.trim().toLowerCase().replace(/^#/, "");
    this.events = events;
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    this.stopped = false;
    this.reconnectDelay = BACKOFF_MIN_MS;
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    this.started = false;
    this.clearReconnectTimer();
    this.clearInfoTimer();
    this.teardownSocket();
  }

  // ── internal ──────────────────────────────────────────────────────────────

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

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private clearInfoTimer(): void {
    if (this.infoTimer !== null) {
      clearTimeout(this.infoTimer);
      this.infoTimer = null;
    }
  }

  private emitStatus(state: ConnState, detail?: string): void {
    if (this.stopped) return;
    this.lastState = state;
    this.lastDetail = detail;
    const status: PlatformStatus = { state, detail };
    if (this.live !== undefined) status.live = this.live;
    if (this.viewers !== undefined) status.viewers = this.viewers;
    if (this.streamTitle !== undefined) status.streamTitle = this.streamTitle;
    this.events.onStatus(status);
  }

  private connect(): void {
    if (this.stopped) return;
    this.teardownSocket();
    this.joined = false;
    this.emitStatus("connecting", `connecting to #${this.channel}`);

    let ws: WebSocket;
    try {
      ws = new WebSocket(IRC_URL);
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;

    ws.onopen = () => {
      if (this.stopped || this.ws !== ws) return;
      const nick = `justinfan${10_000 + Math.floor(Math.random() * 90_000)}`;
      ws.send("CAP REQ :twitch.tv/tags twitch.tv/commands");
      ws.send("PASS SCHMOOPIIE");
      ws.send(`NICK ${nick}`);
      ws.send(`JOIN #${this.channel}`);
      // NOTE: backoff resets on confirmed JOIN (366/first PRIVMSG), not here —
      // an open-then-immediate-close failure must keep growing the delay.
      this.scheduleInfoPoll(INFO_FIRST_DELAY_MS);
    };

    ws.onmessage = (event: MessageEvent) => {
      if (this.stopped || this.ws !== ws) return;
      const data: unknown = event.data;
      if (typeof data !== "string") return;
      for (const rawLine of data.split("\r\n")) {
        const line = rawLine.trim();
        if (line.length > 0) this.handleLine(line, ws);
      }
    };

    ws.onclose = () => {
      if (this.stopped || this.ws !== ws) return;
      this.scheduleReconnect();
    };

    ws.onerror = () => {
      // onclose fires after onerror; reconnect handled there.
    };
  }

  private scheduleReconnect(): void {
    if (this.stopped) return;
    this.teardownSocket();
    this.clearReconnectTimer();
    this.emitStatus(
      "reconnecting",
      `reconnecting to #${this.channel} in ${Math.round(this.reconnectDelay / 1000)}s`,
    );
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.stopped) return;
      this.connect();
    }, this.reconnectDelay);
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, BACKOFF_MAX_MS);
  }

  private handleLine(line: string, ws: WebSocket): void {
    if (line.startsWith("PING")) {
      ws.send("PONG :tmi.twitch.tv");
      return;
    }

    const parsed = parseIrcLine(line);
    if (!parsed) return;

    switch (parsed.command) {
      case "PRIVMSG":
        if (!this.joined) {
          this.joined = true;
          this.reconnectDelay = BACKOFF_MIN_MS;
          this.emitStatus("connected", `joined #${this.channel}`);
        }
        this.handlePrivmsg(parsed);
        break;
      case "366": // end of NAMES list — we are in the channel
        if (!this.joined) {
          this.joined = true;
          this.reconnectDelay = BACKOFF_MIN_MS;
          this.emitStatus("connected", `joined #${this.channel}`);
        }
        break;
      case "RECONNECT":
        this.scheduleReconnect();
        break;
      default:
        break;
    }
  }

  private handlePrivmsg(parsed: ParsedIrcLine): void {
    let text = parsed.trailing;

    // /me messages: \u0001ACTION <text>\u0001
    if (text.startsWith("\u0001ACTION") && text.endsWith("\u0001")) {
      text = text.slice("\u0001ACTION".length, -1).trim();
    }
    if (text.length === 0) return;

    const tags = parsed.tags;
    const username = parsed.nick || (tags["display-name"] ?? "").toLowerCase();
    if (!username) return;

    const rawTs = tags["tmi-sent-ts"];
    const tsNum = rawTs ? parseInt(rawTs, 10) : NaN;
    const timestamp = Number.isFinite(tsNum) ? tsNum : Date.now();

    this.msgCounter += 1;
    const nativeId = tags["id"];
    const id = nativeId
      ? `twitch-${nativeId}`
      : `twitch-${timestamp}-${this.msgCounter}`;

    const color = tags["color"] && tags["color"].length > 0 ? tags["color"] : undefined;

    // positional native emotes from the IRCv3 `emotes` tag
    const emoteTag = tags["emotes"];
    const nativeEmotes =
      emoteTag && emoteTag.length > 0
        ? parseTwitchEmoteTag(emoteTag, text)
        : undefined;

    const msg: ChatMessage = {
      id,
      platform: "twitch",
      username,
      displayName: tags["display-name"] || username,
      text,
      color,
      badges: mapBadges(tags["badges"]),
      timestamp,
      nativeEmotes:
        nativeEmotes && nativeEmotes.length > 0 ? nativeEmotes : undefined,
      vibe: { ...NEUTRAL_VIBE, tags: [] },
    };

    if (this.stopped) return;
    this.events.onMessage(msg);
  }

  // ── stream info polling ───────────────────────────────────────────────────

  private scheduleInfoPoll(delayMs: number): void {
    if (this.stopped) return;
    this.clearInfoTimer();
    this.infoTimer = setTimeout(() => {
      this.infoTimer = null;
      void this.pollInfo();
    }, delayMs);
  }

  private async pollInfo(): Promise<void> {
    if (this.stopped) return;
    try {
      const res = await fetch(
        `/api/twitch/info?channel=${encodeURIComponent(this.channel)}`,
        { cache: "no-store" },
      );
      if (this.stopped) return;
      const raw: unknown = await res.json();
      if (this.stopped) return;
      const info = parseInfoPayload(raw);
      if (info && info.ok) {
        this.live = info.live;
        this.viewers = info.viewers;
        this.streamTitle = info.title ?? undefined;
        // Re-emit with the last-known connection state merged in.
        this.emitStatus(this.lastState, this.lastDetail);
      }
    } catch {
      // Network hiccup — keep last-known values, try again next cycle.
    }
    this.scheduleInfoPoll(INFO_POLL_MS);
  }
}
