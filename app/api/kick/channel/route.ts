// ─── Kick channel lookup proxy ──────────────────────────────────────────────
// Kick's public API has no CORS headers and sits behind Cloudflare, so the
// browser can't hit it directly. This route fetches server-side with
// browser-like headers and returns a normalized, defensive payload.

export const dynamic = "force-dynamic";

const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "application/json",
};

interface ChannelInfo {
  chatroomId: number;
  live: boolean;
  viewers: number | null;
  title: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Pull chatroom id + livestream facts out of an untrusted Kick API payload. */
function extractChannelInfo(data: unknown): ChannelInfo | null {
  if (!isRecord(data)) return null;

  const chatroom = data.chatroom;
  if (!isRecord(chatroom) || typeof chatroom.id !== "number") return null;

  let live = false;
  let viewers: number | null = null;
  let title: string | null = null;

  const livestream = data.livestream;
  if (isRecord(livestream)) {
    // v2 exposes livestream.is_live; older payloads imply live by presence.
    live = typeof livestream.is_live === "boolean" ? livestream.is_live : true;
    if (typeof livestream.viewer_count === "number") {
      viewers = livestream.viewer_count;
    }
    if (typeof livestream.session_title === "string") {
      title = livestream.session_title;
    }
  }

  return { chatroomId: chatroom.id, live, viewers, title };
}

export async function GET(request: Request): Promise<Response> {
  const slug = new URL(request.url).searchParams.get("slug");
  if (!slug) {
    return Response.json(
      { error: "missing required query param: slug" },
      { status: 400 },
    );
  }

  const encoded = encodeURIComponent(slug.trim().toLowerCase());
  const endpoints = [
    `https://kick.com/api/v2/channels/${encoded}`,
    `https://kick.com/api/v1/channels/${encoded}`,
  ];

  let detail = "no endpoint returned a chatroom id";

  for (const endpoint of endpoints) {
    try {
      const res = await fetch(endpoint, {
        headers: BROWSER_HEADERS,
        cache: "no-store",
      });
      if (!res.ok) {
        detail = `upstream responded ${res.status}`;
        continue;
      }

      const body = await res.text();
      let data: unknown;
      try {
        data = JSON.parse(body) as unknown;
      } catch {
        detail = "upstream returned non-JSON (likely a Cloudflare challenge)";
        continue;
      }

      const info = extractChannelInfo(data);
      if (!info) {
        detail = "response had no chatroom id";
        continue;
      }

      return Response.json({
        ok: true,
        chatroomId: info.chatroomId,
        live: info.live,
        viewers: info.viewers,
        title: info.title,
      });
    } catch (err) {
      detail = err instanceof Error ? err.message : "fetch failed";
    }
  }

  // All failures are soft: the connector reads `ok` + `detail`, never a 500.
  return Response.json({
    ok: false,
    chatroomId: null,
    live: false,
    viewers: null,
    title: null,
    detail,
  });
}
