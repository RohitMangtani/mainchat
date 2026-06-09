// ─── Emote engine ────────────────────────────────────────────────────────────
// Turns raw chat text into ordered fragments the UI can render: plain text
// runs interleaved with emote images. Handles Twitch native (positional IRC
// tag) emotes, Kick inline [emote:id:name] syntax, and third-party sets
// (7TV / BTTV / FFZ, global + per-channel). No keys required.
//
// Pure lib: no React, no persistence. Safe to import from client components.

// ─── Public types ────────────────────────────────────────────────────────────

export type MessageFragment =
  | { kind: "text"; text: string }
  | { kind: "emote"; name: string; url: string };

/** A platform-native emote already resolved by the connector.
 *  start/end are INCLUSIVE code-point indices into the message text
 *  (Twitch counts by unicode code points, not UTF-16 units). */
export interface NativeEmote {
  name: string;
  url: string;
  start: number;
  end: number;
}

// ─── Internal helpers (not exported) ─────────────────────────────────────────

const FETCH_TIMEOUT_MS = 10_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** APIs are inconsistent about ids being strings or numbers. */
function idString(value: unknown): string | null {
  if (typeof value === "string" && value.length > 0) return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function httpsPrefixed(url: string): string {
  return url.startsWith("//") ? `https:${url}` : url;
}

/** Fetch JSON, soft-failing to null on any network/HTTP/parse error. */
async function fetchJson(url: string): Promise<unknown> {
  try {
    const signal =
      typeof AbortSignal !== "undefined" &&
      typeof AbortSignal.timeout === "function"
        ? AbortSignal.timeout(FETCH_TIMEOUT_MS)
        : undefined;
    const res = await fetch(url, { signal });
    if (!res.ok) return null;
    return (await res.json()) as unknown;
  } catch {
    return null;
  }
}

/** 7TV emote list shape: [{ name, data: { host: { url } } }] */
function collect7tvEmotes(list: unknown, out: Map<string, string>): void {
  if (!Array.isArray(list)) return;
  for (const item of list) {
    if (!isRecord(item)) continue;
    const name = nonEmptyString(item.name);
    const data = isRecord(item.data) ? item.data : null;
    const host = data && isRecord(data.host) ? data.host : null;
    const base = host ? nonEmptyString(host.url) : null;
    if (!name || !base) continue;
    out.set(name, `${httpsPrefixed(base)}/2x.webp`);
  }
}

/** BTTV emote list shape: [{ id, code }] */
function collectBttvEmotes(list: unknown, out: Map<string, string>): void {
  if (!Array.isArray(list)) return;
  for (const item of list) {
    if (!isRecord(item)) continue;
    const code = nonEmptyString(item.code);
    const id = idString(item.id);
    if (!code || !id) continue;
    out.set(code, `https://cdn.betterttv.net/emote/${id}/2x`);
  }
}

/** FFZ payload shape: { sets: { [id]: { emoticons: [{ name, urls }] } } } */
function collectFfzSets(payload: unknown, out: Map<string, string>): void {
  if (!isRecord(payload) || !isRecord(payload.sets)) return;
  for (const setValue of Object.values(payload.sets)) {
    if (!isRecord(setValue) || !Array.isArray(setValue.emoticons)) continue;
    for (const emoticon of setValue.emoticons) {
      if (!isRecord(emoticon)) continue;
      const name = nonEmptyString(emoticon.name);
      const urls = isRecord(emoticon.urls) ? emoticon.urls : null;
      const raw = urls
        ? nonEmptyString(urls["2"]) ?? nonEmptyString(urls["1"])
        : null;
      if (!name || !raw) continue;
      out.set(name, httpsPrefixed(raw));
    }
  }
}

/** Overlay src onto dst (entries in src win). */
function overlay(dst: Map<string, string>, src: Map<string, string>): void {
  for (const [name, url] of src) dst.set(name, url);
}

type EmotePlatform = "twitch" | "kick" | "x";

const ALL_PLATFORMS: readonly EmotePlatform[] = ["twitch", "kick", "x"];

// ─── Resolver ────────────────────────────────────────────────────────────────

export class EmoteResolver {
  /** Merged global sets (7TV > BTTV > FFZ precedence). */
  private readonly globals = new Map<string, string>();
  /** Channel sets keyed by "platform:channel". */
  private readonly channelSets = new Map<string, Map<string, string>>();
  /** Precomputed per-platform lookup: globals overlaid with that platform's
   *  loaded channel sets. Rebuilt only when sets load, so fragment() stays
   *  O(tokens) with O(1) lookups. */
  private readonly lookup = new Map<EmotePlatform, Map<string, string>>();
  /** In-flight / settled channel loads keyed by "platform:channel". */
  private readonly loadPromises = new Map<string, Promise<void>>();
  private globalsPromise: Promise<void> | null = null;

  constructor() {
    this.rebuildAllLookups();
  }

  /** Fetch + cache third-party emote sets for a channel.
   *  Idempotent: concurrent and repeat calls share a single fetch.
   *  Never rejects — failures soft-fail to whatever loaded. */
  async loadChannel(platform: "twitch" | "kick", channel: string): Promise<void> {
    const login = channel.trim().toLowerCase().replace(/^[@#]/, "");
    if (!login) return;
    const key = `${platform}:${login}`;
    const existing = this.loadPromises.get(key);
    if (existing) return existing;

    const promise = this.doLoadChannel(platform, login, key)
      .catch(() => undefined)
      .then(() => {
        // If absolutely nothing loaded (e.g. offline), forget this attempt so
        // a later call can retry. Partial loads stay cached.
        const channelSize = this.channelSets.get(key)?.size ?? 0;
        if (this.globals.size === 0 && channelSize === 0) {
          this.loadPromises.delete(key);
          this.channelSets.delete(key);
        }
      });
    this.loadPromises.set(key, promise);
    return promise;
  }

  /** Split message text into ordered text/emote fragments. Synchronous.
   *  Native (positional) emotes are applied first, then remaining text is
   *  tokenized on whitespace and matched whole-word against cached sets. */
  fragment(
    msg: { platform: "twitch" | "kick" | "x"; text: string },
    nativeEmotes?: NativeEmote[],
  ): MessageFragment[] {
    const text = msg.text;
    const map = this.lookup.get(msg.platform) ?? this.globals;
    const natives = nativeEmotes && nativeEmotes.length > 0 ? nativeEmotes : null;

    // Fast path: nothing to match against.
    if (!natives && map.size === 0) return [{ kind: "text", text }];

    if (!natives) {
      const frags = this.matchTokens(text, map);
      return frags.length > 0 ? frags : [{ kind: "text", text }];
    }

    // Positional emotes index by unicode code point.
    const codePoints = Array.from(text);
    const sorted = natives
      .filter(
        (e) =>
          Number.isInteger(e.start) &&
          Number.isInteger(e.end) &&
          e.start >= 0 &&
          e.end >= e.start &&
          e.end < codePoints.length,
      )
      .sort((a, b) => a.start - b.start);

    const out: MessageFragment[] = [];
    let cursor = 0;
    for (const emote of sorted) {
      if (emote.start < cursor) continue; // overlapping/duplicate range
      if (emote.start > cursor) {
        const between = codePoints.slice(cursor, emote.start).join("");
        for (const frag of this.matchTokens(between, map)) out.push(frag);
      }
      out.push({
        kind: "emote",
        name:
          emote.name ||
          codePoints.slice(emote.start, emote.end + 1).join(""),
        url: emote.url,
      });
      cursor = emote.end + 1;
    }
    if (cursor < codePoints.length) {
      const tail = codePoints.slice(cursor).join("");
      for (const frag of this.matchTokens(tail, map)) out.push(frag);
    }
    return out.length > 0 ? out : [{ kind: "text", text }];
  }

  // ─── private ───────────────────────────────────────────────────────────────

  /** Whitespace-tokenize and match whole tokens against the lookup map,
   *  preserving original spacing. O(tokens). */
  private matchTokens(
    text: string,
    map: Map<string, string>,
  ): MessageFragment[] {
    if (text.length === 0) return [];
    if (map.size === 0) return [{ kind: "text", text }];
    const parts = text.split(/(\s+)/); // keep whitespace separators
    const out: MessageFragment[] = [];
    let buffer = "";
    for (const part of parts) {
      if (part.length === 0) continue;
      const url = map.get(part); // whitespace never matches a name
      if (url !== undefined) {
        if (buffer.length > 0) {
          out.push({ kind: "text", text: buffer });
          buffer = "";
        }
        out.push({ kind: "emote", name: part, url });
      } else {
        buffer += part;
      }
    }
    if (buffer.length > 0) out.push({ kind: "text", text: buffer });
    return out;
  }

  private ensureGlobals(): Promise<void> {
    if (!this.globalsPromise) {
      this.globalsPromise = this.loadGlobals()
        .catch(() => undefined)
        .then(() => {
          // Total failure → allow a future loadChannel call to retry globals.
          if (this.globals.size === 0) this.globalsPromise = null;
        });
    }
    return this.globalsPromise;
  }

  private async loadGlobals(): Promise<void> {
    const [sevenTv, bttv, ffz] = await Promise.all([
      fetchJson("https://7tv.io/v3/emote-sets/global"),
      fetchJson("https://api.betterttv.net/3/cached/emotes/global"),
      fetchJson("https://api.frankerfacez.com/v1/set/global"),
    ]);
    // Precedence within the global scope: 7TV > BTTV > FFZ.
    // Apply lowest priority first so later overlays win.
    collectFfzSets(ffz, this.globals);
    collectBttvEmotes(bttv, this.globals);
    if (isRecord(sevenTv)) collect7tvEmotes(sevenTv.emotes, this.globals);
    this.rebuildAllLookups();
  }

  private async doLoadChannel(
    platform: "twitch" | "kick",
    login: string,
    key: string,
  ): Promise<void> {
    const globalsReady = this.ensureGlobals();

    if (platform === "kick") {
      // No kick numeric channel id available here, so only the global
      // 7TV/BTTV/FFZ sets apply to kick chat (see module notes).
      await globalsReady;
      return;
    }

    // FFZ rooms key off the login; 7TV/BTTV need the numeric Twitch user id.
    const ffzPromise = fetchJson(
      `https://api.frankerfacez.com/v1/room/${encodeURIComponent(login)}`,
    );
    const userId = await this.resolveTwitchId(login);
    const [sevenTv, bttv, ffz] = await Promise.all([
      userId
        ? fetchJson(`https://7tv.io/v3/users/twitch/${encodeURIComponent(userId)}`)
        : Promise.resolve<unknown>(null),
      userId
        ? fetchJson(
            `https://api.betterttv.net/3/cached/users/twitch/${encodeURIComponent(userId)}`,
          )
        : Promise.resolve<unknown>(null),
      ffzPromise,
    ]);

    // Precedence within the channel scope: 7TV > BTTV > FFZ (last set wins).
    const channelMap = new Map<string, string>();
    collectFfzSets(ffz, channelMap);
    if (isRecord(bttv)) {
      collectBttvEmotes(bttv.channelEmotes, channelMap);
      collectBttvEmotes(bttv.sharedEmotes, channelMap);
    }
    if (isRecord(sevenTv)) {
      const emoteSet = isRecord(sevenTv.emote_set) ? sevenTv.emote_set : null;
      if (emoteSet) collect7tvEmotes(emoteSet.emotes, channelMap);
    }
    this.channelSets.set(key, channelMap);

    await globalsReady; // globals merged before the final lookup rebuild
    this.rebuildLookup(platform);
  }

  private async resolveTwitchId(login: string): Promise<string | null> {
    const data = await fetchJson(
      `https://api.ivr.fi/v2/twitch/user?login=${encodeURIComponent(login)}`,
    );
    if (!Array.isArray(data) || data.length === 0) return null;
    const first: unknown = data[0];
    if (!isRecord(first)) return null;
    return idString(first.id);
  }

  /** Channel sets beat globals on name collisions. */
  private rebuildLookup(platform: EmotePlatform): void {
    const merged = new Map(this.globals);
    if (platform !== "x") {
      const prefix = `${platform}:`;
      for (const [key, set] of this.channelSets) {
        if (key.startsWith(prefix)) overlay(merged, set);
      }
    }
    this.lookup.set(platform, merged);
  }

  private rebuildAllLookups(): void {
    for (const platform of ALL_PLATFORMS) this.rebuildLookup(platform);
  }
}

// ─── Twitch IRCv3 `emotes` tag ───────────────────────────────────────────────

/** Parse the IRCv3 `emotes` tag ("id1:0-4,6-10/id2:12-15") against the
 *  message text. Indices are INCLUSIVE and count unicode code points.
 *  Invalid or out-of-range entries are skipped. Result sorted by start. */
export function parseTwitchEmoteTag(tag: string, text: string): NativeEmote[] {
  const out: NativeEmote[] = [];
  if (!tag || !text) return out;
  const codePoints = Array.from(text);
  for (const group of tag.split("/")) {
    const colon = group.indexOf(":");
    if (colon <= 0 || colon === group.length - 1) continue;
    const id = group.slice(0, colon);
    const url = `https://static-cdn.jtvnw.net/emoticons/v2/${id}/default/dark/2.0`;
    for (const range of group.slice(colon + 1).split(",")) {
      const dash = range.indexOf("-");
      if (dash <= 0) continue;
      const start = Number.parseInt(range.slice(0, dash), 10);
      const end = Number.parseInt(range.slice(dash + 1), 10);
      if (!Number.isInteger(start) || !Number.isInteger(end)) continue;
      if (start < 0 || end < start || end >= codePoints.length) continue;
      out.push({
        name: codePoints.slice(start, end + 1).join(""),
        url,
        start,
        end,
      });
    }
  }
  out.sort((a, b) => a.start - b.start);
  return out;
}

// ─── Kick inline emote syntax ────────────────────────────────────────────────

/** Kick embeds emotes inline as "[emote:12345:KEKW]". Replace each with the
 *  bare name and return a name → image-url map for the message. */
export function parseKickEmotes(content: string): {
  text: string;
  emotes: Map<string, string>;
} {
  const emotes = new Map<string, string>();
  if (!content.includes("[emote:")) return { text: content, emotes };
  const text = content.replace(
    /\[emote:(\d+):([^\]]*)\]/g,
    (_match: string, id: string, name: string): string => {
      const safeName = name.length > 0 ? name : `emote${id}`;
      emotes.set(safeName, `https://files.kick.com/emotes/${id}/fullsize`);
      return safeName;
    },
  );
  return { text, emotes };
}
