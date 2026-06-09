// ─── /api/twitch/info ───────────────────────────────────────────────────────
// Read-only stream info: live status, viewer count, title.
// Primary: official Helix API when TWITCH_CLIENT_ID/TWITCH_CLIENT_SECRET are
// set (app access token via client_credentials, cached in module scope).
// Fallback: decapi.me, a long-standing public Twitch read API — keeps the
// dashboard fully functional with zero credentials.
// Never throws, never 500s — failures return { ok: false } so the client
// treats the data as "unknown".

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

interface InfoResponse {
  ok: boolean;
  live: boolean;
  viewers: number | null;
  title: string | null;
}

const UNKNOWN: InfoResponse = { ok: false, live: false, viewers: null, title: null };

// ── Helix (official) ─────────────────────────────────────────────────────────

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getHelixToken(clientId: string, secret: string): Promise<string | null> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.token;
  }
  try {
    const res = await fetch(
      `https://id.twitch.tv/oauth2/token?client_id=${clientId}&client_secret=${secret}&grant_type=client_credentials`,
      { method: "POST", cache: "no-store" },
    );
    if (!res.ok) return null;
    const data: unknown = await res.json();
    if (
      typeof data === "object" &&
      data !== null &&
      typeof (data as Record<string, unknown>).access_token === "string"
    ) {
      const d = data as { access_token: string; expires_in?: number };
      cachedToken = {
        token: d.access_token,
        expiresAt: Date.now() + (d.expires_in ?? 3600) * 1000,
      };
      return d.access_token;
    }
  } catch {
    // fall through
  }
  return null;
}

async function fetchHelix(channel: string): Promise<InfoResponse | null> {
  const clientId = process.env.TWITCH_CLIENT_ID;
  const secret = process.env.TWITCH_CLIENT_SECRET;
  if (!clientId || !secret) return null;

  const token = await getHelixToken(clientId, secret);
  if (!token) return null;

  try {
    const res = await fetch(
      `https://api.twitch.tv/helix/streams?user_login=${encodeURIComponent(channel)}`,
      {
        headers: { "Client-Id": clientId, Authorization: `Bearer ${token}` },
        cache: "no-store",
      },
    );
    if (!res.ok) return null;
    const payload: unknown = await res.json();
    if (typeof payload !== "object" || payload === null) return null;
    const list = (payload as Record<string, unknown>).data;
    if (!Array.isArray(list)) return null;
    if (list.length === 0) {
      return { ok: true, live: false, viewers: null, title: null };
    }
    const s = list[0] as Record<string, unknown>;
    return {
      ok: true,
      live: true,
      viewers: typeof s.viewer_count === "number" ? s.viewer_count : null,
      title: typeof s.title === "string" ? s.title : null,
    };
  } catch {
    return null;
  }
}

// ── decapi (zero-config fallback) ────────────────────────────────────────────

// decapi answers HTTP 200 for everything — real counts, "<channel> is
// offline", "User not found", and even its own upstream Twitch errors — so
// outcomes must be distinguished by body content. Anything we can't
// positively classify returns null (→ ok:false), never fake "offline" data.
function looksLikeDecapiError(text: string): boolean {
  return (
    text.startsWith("[Error") ||
    /^user not found/i.test(text) ||
    /^no user with the name/i.test(text) ||
    /^a username has to be specified/i.test(text)
  );
}

async function fetchDecapi(channel: string): Promise<InfoResponse | null> {
  try {
    const enc = encodeURIComponent(channel);
    const [countRes, titleRes] = await Promise.all([
      fetch(`https://decapi.me/twitch/viewercount/${enc}`, { cache: "no-store" }),
      fetch(`https://decapi.me/twitch/title/${enc}`, { cache: "no-store" }),
    ]);
    if (!countRes.ok) return null;

    const countText = (await countRes.text()).trim();
    const titleText = titleRes.ok ? (await titleRes.text()).trim() : "";

    if (looksLikeDecapiError(countText)) return null;

    const viewers = /^\d+$/.test(countText) ? parseInt(countText, 10) : null;
    const offline = /\bis offline\b/i.test(countText);
    if (viewers === null && !offline) return null; // unclassifiable prose

    const title =
      titleText && !looksLikeDecapiError(titleText) ? titleText : null;

    return { ok: true, live: viewers !== null, viewers, title };
  } catch {
    return null;
  }
}

export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const channel = searchParams.get("channel")?.trim().toLowerCase();

  if (!channel) {
    return NextResponse.json(
      { error: "missing required query param: channel" },
      { status: 400 },
    );
  }

  const info = (await fetchHelix(channel)) ?? (await fetchDecapi(channel));
  return NextResponse.json(info ?? UNKNOWN, { status: 200 });
}
