// ─── /api/x/live ─────────────────────────────────────────────────────────────
// Keyless X live-broadcast chat resolution. Mirrors the anonymous flow X's own
// web player uses: guest token → user id → live broadcast → chat token →
// Periscope (proxsee) public chat access. Zero credentials required.
//
// The chain is fragile by nature (graphql query ids and feature flags rot),
// so every failure path returns 200 { live:false, detail } naming the exact
// step that broke — the detail string is the debugging lifeline.

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// X's public web-app bearer token — embedded in their site JS for years,
// shared by every anonymous web session. Not a secret.
const PUBLIC_BEARER =
  "Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA";

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const HANDLE_RE = /^[A-Za-z0-9_]{1,15}$/;

// Feature flags for the UserByScreenName graphql query. These rot over time;
// when they do the call 4xx's and we fall back to syndication / fxtwitter.
const GRAPHQL_FEATURES = JSON.stringify({
  hidden_profile_likes_enabled: true,
  hidden_profile_subscriptions_enabled: true,
  rweb_tipjar_consumption_enabled: true,
  responsive_web_graphql_exclude_directive_enabled: true,
  verified_phone_label_enabled: false,
  subscriptions_verification_info_is_identity_verified_enabled: true,
  subscriptions_verification_info_verified_since_enabled: true,
  highlights_tweets_tab_ui_enabled: true,
  responsive_web_twitter_article_notes_tab_enabled: true,
  creator_subscriptions_tweet_preview_api_enabled: true,
  responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
  responsive_web_graphql_timeline_navigation_enabled: true,
});
const GRAPHQL_FIELD_TOGGLES = JSON.stringify({ withAuxiliaryUserLabels: false });

interface LiveResponse {
  live: boolean;
  wsUrl: string | null;
  accessToken: string | null;
  roomId: string | null;
  broadcastTitle: string | null;
  detail: string;
}

function offline(detail: string): NextResponse {
  const body: LiveResponse = {
    live: false,
    wsUrl: null,
    accessToken: null,
    roomId: null,
    broadcastTitle: null,
    detail,
  };
  return NextResponse.json(body);
}

// ── narrowing helpers ─────────────────────────────────────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

/** Accept string or safe-integer ids (syndication historically returns both). */
function asIdString(value: unknown): string | null {
  if (typeof value === "string" && value.length > 0) return value;
  if (typeof value === "number" && Number.isSafeInteger(value)) return String(value);
  return null;
}

// ── fetch helper ──────────────────────────────────────────────────────────────

interface FetchResult {
  status: number;
  body: unknown;
}

interface JsonFetchInit {
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  body?: string;
}

/** Browser-UA fetch that never throws: null = network failure. */
async function fetchJson(url: string, init?: JsonFetchInit): Promise<FetchResult | null> {
  try {
    const res = await fetch(url, {
      method: init?.method ?? "GET",
      headers: { "User-Agent": BROWSER_UA, ...(init?.headers ?? {}) },
      body: init?.body,
      cache: "no-store",
    });
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      body = null; // non-JSON body — callers treat as failure via narrowing
    }
    return { status: res.status, body };
  } catch {
    return null;
  }
}

// ── step 1: guest token ───────────────────────────────────────────────────────

async function getGuestToken(): Promise<string | null> {
  const res = await fetchJson("https://api.twitter.com/1.1/guest/activate.json", {
    method: "POST",
    headers: { Authorization: PUBLIC_BEARER },
  });
  if (!res || res.status < 200 || res.status >= 300 || !isRecord(res.body)) return null;
  return asString(res.body.guest_token);
}

// ── step 2: resolve user id (graphql → syndication → fxtwitter) ──────────────

async function resolveViaGraphql(user: string, guestToken: string): Promise<string | null> {
  const variables = JSON.stringify({ screen_name: user, withSafetyModeUserFields: true });
  const url =
    "https://api.twitter.com/graphql/G3KGOASz96M-Qu0nwmGXNg/UserByScreenName" +
    `?variables=${encodeURIComponent(variables)}` +
    `&features=${encodeURIComponent(GRAPHQL_FEATURES)}` +
    `&fieldToggles=${encodeURIComponent(GRAPHQL_FIELD_TOGGLES)}`;
  const res = await fetchJson(url, {
    headers: { Authorization: PUBLIC_BEARER, "x-guest-token": guestToken },
  });
  if (!res || res.status !== 200 || !isRecord(res.body)) return null;
  const data = res.body.data;
  if (!isRecord(data)) return null;
  const user_ = data.user;
  if (!isRecord(user_)) return null;
  const result = user_.result;
  if (!isRecord(result)) return null;
  return asString(result.rest_id);
}

async function resolveViaSyndication(user: string): Promise<string | null> {
  const res = await fetchJson(
    `https://cdn.syndication.twimg.com/widgets/followbutton/info.json?screen_names=${encodeURIComponent(user)}`,
  );
  if (!res || res.status !== 200 || !Array.isArray(res.body)) return null;
  const first: unknown = res.body[0];
  if (!isRecord(first)) return null;
  return asIdString(first.id);
}

async function resolveViaFxtwitter(user: string): Promise<string | null> {
  const res = await fetchJson(`https://api.fxtwitter.com/${encodeURIComponent(user)}`);
  if (!res || res.status !== 200 || !isRecord(res.body)) return null;
  const user_ = res.body.user;
  if (!isRecord(user_)) return null;
  return asIdString(user_.id);
}

// ── step 3: find live broadcast ───────────────────────────────────────────────

interface BroadcastHit {
  id: string;
  title: string | null;
}

/** Accepts either an array of broadcast records or a map keyed by id. */
function pickRunningBroadcast(value: unknown): BroadcastHit | null {
  const candidates: unknown[] = Array.isArray(value)
    ? value
    : isRecord(value)
      ? Object.values(value)
      : [];
  for (const raw of candidates) {
    if (!isRecord(raw)) continue;
    // Periscope broadcast state: RUNNING while live; ENDED/TIMED_OUT after.
    const state = asString(raw.state);
    if (state !== null && state.toUpperCase() !== "RUNNING") continue;
    const id = asString(raw.id) ?? asString(raw.broadcast_id);
    if (!id) continue;
    // Periscope puts the human title in "status".
    return { id, title: asString(raw.status) ?? asString(raw.title) };
  }
  return null;
}

async function findLiveBroadcast(
  userId: string,
  guestToken: string,
): Promise<BroadcastHit | null> {
  const res = await fetchJson(
    `https://api.twitter.com/1.1/broadcasts/by_user_id/${encodeURIComponent(userId)}.json?user_id=${encodeURIComponent(userId)}`,
    { headers: { Authorization: PUBLIC_BEARER, "x-guest-token": guestToken } },
  );
  if (!res || res.status !== 200) return null;
  if (Array.isArray(res.body)) return pickRunningBroadcast(res.body);
  if (!isRecord(res.body)) return null;
  return pickRunningBroadcast(res.body.broadcasts);
}

// ── step 4: chat token → chat access ─────────────────────────────────────────

async function getChatToken(broadcastId: string, guestToken: string): Promise<string | null> {
  const res = await fetchJson(
    `https://api.twitter.com/1.1/live_video_stream/status/${encodeURIComponent(broadcastId)}.json`,
    { headers: { Authorization: PUBLIC_BEARER, "x-guest-token": guestToken } },
  );
  if (!res || res.status !== 200 || !isRecord(res.body)) return null;
  return asString(res.body.chatToken) ?? asString(res.body.chat_token);
}

interface ChatAccess {
  wsUrl: string;
  accessToken: string;
  roomId: string;
}

async function getChatAccess(chatToken: string): Promise<ChatAccess | null> {
  const res = await fetchJson("https://proxsee.pscp.tv/api/v2/accessChatPublic", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_token: chatToken }),
  });
  if (!res || res.status !== 200 || !isRecord(res.body)) return null;
  const endpoint = asString(res.body.endpoint);
  const accessToken = asString(res.body.access_token);
  const roomId = asString(res.body.room_id);
  if (!endpoint || !accessToken || !roomId) return null;
  return {
    wsUrl: endpoint.replace(/^https/, "wss") + "/chatapi/v1/chatnow",
    accessToken,
    roomId,
  };
}

// ── handler ───────────────────────────────────────────────────────────────────

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const raw = url.searchParams.get("user");
  if (!raw || raw.trim().length === 0) {
    return NextResponse.json({ error: "Missing required 'user' parameter" }, { status: 400 });
  }
  const user = raw.trim().replace(/^@/, "");
  if (!HANDLE_RE.test(user)) {
    return NextResponse.json({ error: "Invalid X handle" }, { status: 400 });
  }

  try {
    // 1. Anonymous guest token — same as X's own web player.
    const guestToken = await getGuestToken();
    if (!guestToken) {
      return offline("guest token activation failed (api.twitter.com/1.1/guest/activate.json)");
    }

    // 2. Handle → numeric user id, with two keyless fallbacks.
    let userId = await resolveViaGraphql(user, guestToken);
    if (!userId) userId = await resolveViaSyndication(user);
    if (!userId) userId = await resolveViaFxtwitter(user);
    if (!userId) {
      return offline(
        `user id resolution failed for @${user} (graphql, syndication and fxtwitter all failed)`,
      );
    }

    // 3. Any RUNNING broadcast for that user? Not finding one is the normal
    //    offline case, not an error.
    const broadcast = await findLiveBroadcast(userId, guestToken);
    if (!broadcast) {
      return offline(`no live broadcast found for @${user}`);
    }

    // 4a. Broadcast id → chat token.
    const chatToken = await getChatToken(broadcast.id, guestToken);
    if (!chatToken) {
      return offline(
        `live_video_stream status returned no chatToken (broadcast ${broadcast.id})`,
      );
    }

    // 4b. Chat token → Periscope public chat endpoint + room credentials.
    const access = await getChatAccess(chatToken);
    if (!access) {
      return offline("accessChatPublic failed (proxsee.pscp.tv returned no endpoint/token/room)");
    }

    const body: LiveResponse = {
      live: true,
      wsUrl: access.wsUrl,
      accessToken: access.accessToken,
      roomId: access.roomId,
      broadcastTitle: broadcast.title,
      detail: `live broadcast ${broadcast.id} for @${user}`,
    };
    return NextResponse.json(body);
  } catch {
    // Belt and braces: this route must never 500.
    return offline("unexpected failure in /api/x/live resolution chain");
  }
}
