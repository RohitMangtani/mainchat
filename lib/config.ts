import type { AppConfig } from "./types";

const STORAGE_KEY = "mainchat.config.v1";

/** One-click "Market Bubble Mode" — the pre-configured defaults for the show. */
export const MARKET_BUBBLE_DEFAULTS: AppConfig = {
  // the show streams on Banks' channel (verified: its live titles are the
  // Market Bubble episodes); Ansem's channel fills the second stage slot
  twitchChannel: "fazebanks",
  twitchChannel2: "blknoiz06",
  // the show doesn't stream on Kick today — the lane stays ready for the
  // day they add one (exactly what the brief asks for)
  kickChannel: "",
  // a bare @handle engages the KEYLESS live-broadcast chat lane — the show
  // streams on X, so its broadcast chat joins the feed with zero credentials
  xQuery: "@MarketBubble",
  enabled: { twitch: true, kick: true, x: true },
  demoMode: false,
  brandPreset: "marketbubble",
  brandName: "Market Bubble",
  toxicityFilter: true,
};

export const BLANK_DEFAULTS: AppConfig = {
  ...MARKET_BUBBLE_DEFAULTS,
  twitchChannel: "",
  twitchChannel2: "",
  kickChannel: "",
  xQuery: "",
  brandPreset: "custom",
  brandName: "",
};

function str(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

export function loadConfig(): AppConfig {
  if (typeof window === "undefined") return MARKET_BUBBLE_DEFAULTS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return MARKET_BUBBLE_DEFAULTS;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) {
      return MARKET_BUBBLE_DEFAULTS;
    }
    // field-by-field coercion: a wrong-typed persisted value (manual edits,
    // older versions) falls back to its default instead of bricking the boot
    const p = parsed as Record<string, unknown>;
    const en =
      typeof p.enabled === "object" && p.enabled !== null
        ? (p.enabled as Record<string, unknown>)
        : {};
    const d = MARKET_BUBBLE_DEFAULTS;
    return {
      twitchChannel: str(p.twitchChannel, d.twitchChannel),
      twitchChannel2: str(p.twitchChannel2, d.twitchChannel2),
      kickChannel: str(p.kickChannel, d.kickChannel),
      xQuery: str(p.xQuery, d.xQuery),
      enabled: {
        twitch: bool(en.twitch, d.enabled.twitch),
        kick: bool(en.kick, d.enabled.kick),
        x: bool(en.x, d.enabled.x),
      },
      demoMode: bool(p.demoMode, d.demoMode),
      brandPreset: p.brandPreset === "custom" ? "custom" : "marketbubble",
      brandName: str(p.brandName, d.brandName),
      toxicityFilter: bool(p.toxicityFilter, d.toxicityFilter),
    };
  } catch {
    return MARKET_BUBBLE_DEFAULTS;
  }
}

export function saveConfig(config: AppConfig): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {
    // storage full / private mode — settings just won't persist
  }
}
