import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const SEARCH_URL = "https://api.twitter.com/2/tweets/search/recent";
// X recent search caps queries at 512 chars (basic tier)
const MAX_QUERY_LEN = 512;

// ── Per-IP token bucket ──────────────────────────────────────────────────────
// This route spends the operator's PAID X API quota, so it must not be an
// open proxy. The legitimate client polls every 25s; 6/min per IP leaves
// headroom without letting a curl loop drain the monthly read cap.
// In-memory state is per serverless instance — not airtight, but it removes
// the trivial single-source abuse path at zero infra cost.
const BUCKET_CAPACITY = 6;
const BUCKET_REFILL_MS = 10_000; // one token back every 10s
const buckets = new Map<string, { tokens: number; lastRefill: number }>();

function allowRequest(ip: string): boolean {
  const now = Date.now();
  let b = buckets.get(ip);
  if (!b) {
    b = { tokens: BUCKET_CAPACITY, lastRefill: now };
    buckets.set(ip, b);
  }
  const refill = Math.floor((now - b.lastRefill) / BUCKET_REFILL_MS);
  if (refill > 0) {
    b.tokens = Math.min(BUCKET_CAPACITY, b.tokens + refill);
    b.lastRefill = now;
  }
  if (b.tokens <= 0) return false;
  b.tokens -= 1;
  // keep the map from growing unboundedly
  if (buckets.size > 5000) buckets.clear();
  return true;
}

interface ApiTweet {
  id: string;
  text: string;
  username: string;
  name: string;
  avatarUrl: string | null;
  verified: boolean;
  createdAt: number;
}

interface XUser {
  name: string;
  username: string;
  avatarUrl: string | null;
  verified: boolean;
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

function buildUserMap(body: Record<string, unknown>): Map<string, XUser> {
  const users = new Map<string, XUser>();
  const includes = body.includes;
  if (!isRecord(includes)) return users;
  for (const raw of asArray(includes.users)) {
    if (!isRecord(raw)) continue;
    const id = asString(raw.id);
    const username = asString(raw.username);
    if (!id || !username) continue;
    users.set(id, {
      name: asString(raw.name) ?? username,
      username,
      avatarUrl: asString(raw.profile_image_url),
      verified: raw.verified === true,
    });
  }
  return users;
}

function mapTweets(body: unknown): { tweets: ApiTweet[]; newestId: string | null } {
  if (!isRecord(body)) return { tweets: [], newestId: null };

  const users = buildUserMap(body);
  const tweets: ApiTweet[] = [];

  for (const raw of asArray(body.data)) {
    if (!isRecord(raw)) continue;
    const id = asString(raw.id);
    const text = asString(raw.text);
    if (!id || text === null) continue;

    const authorId = asString(raw.author_id);
    const user = authorId ? users.get(authorId) : undefined;
    const createdAtRaw = asString(raw.created_at);
    const createdMs = createdAtRaw ? Date.parse(createdAtRaw) : Number.NaN;

    tweets.push({
      id,
      text,
      username: user?.username ?? "unknown",
      name: user?.name ?? "Unknown",
      avatarUrl: user?.avatarUrl ?? null,
      verified: user?.verified ?? false,
      createdAt: Number.isFinite(createdMs) ? createdMs : Date.now(),
    });
  }

  const meta = body.meta;
  const newestId = isRecord(meta) ? asString(meta.newest_id) : null;
  return { tweets, newestId };
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const query = url.searchParams.get("query");
  if (!query) {
    return NextResponse.json({ error: "Missing required 'query' parameter" }, { status: 400 });
  }
  if (query.length > MAX_QUERY_LEN) {
    return NextResponse.json({ error: "query too long" }, { status: 400 });
  }

  const token = process.env.X_BEARER_TOKEN;
  if (!token) {
    return NextResponse.json({ configured: false, tweets: [], newestId: null });
  }

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!allowRequest(ip)) {
    return NextResponse.json(
      { configured: true, rateLimited: true, tweets: [], newestId: null },
      { status: 429 },
    );
  }

  const sinceId = url.searchParams.get("sinceId");
  const apiUrl = new URL(SEARCH_URL);
  apiUrl.searchParams.set("query", query);
  apiUrl.searchParams.set("max_results", "25");
  apiUrl.searchParams.set("tweet.fields", "created_at,author_id");
  apiUrl.searchParams.set("expansions", "author_id");
  apiUrl.searchParams.set("user.fields", "name,username,profile_image_url,verified");
  if (sinceId) apiUrl.searchParams.set("since_id", sinceId);

  try {
    const res = await fetch(apiUrl.toString(), {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });

    if (res.status === 429) {
      return NextResponse.json({ configured: true, rateLimited: true, tweets: [], newestId: null });
    }
    if (!res.ok) {
      return NextResponse.json({
        configured: true,
        error: String(res.status),
        tweets: [],
        newestId: null,
      });
    }

    const body: unknown = await res.json();
    const { tweets, newestId } = mapTweets(body);
    return NextResponse.json({ configured: true, tweets, newestId });
  } catch {
    return NextResponse.json({
      configured: true,
      error: "fetch_failed",
      tweets: [],
      newestId: null,
    });
  }
}
