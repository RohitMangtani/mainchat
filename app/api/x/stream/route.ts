import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const SEARCH_URL = "https://api.twitter.com/2/tweets/search/recent";

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

  const token = process.env.X_BEARER_TOKEN;
  if (!token) {
    return NextResponse.json({ configured: false, tweets: [], newestId: null });
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
