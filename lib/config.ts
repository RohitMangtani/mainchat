import type { AppConfig } from "./types";

const STORAGE_KEY = "mainchat.config.v1";

/** One-click "Market Bubble Mode" — the pre-configured defaults for the show. */
export const MARKET_BUBBLE_DEFAULTS: AppConfig = {
  twitchChannel: "fazebanks",
  kickChannel: "fazebanks",
  xQuery: '"market bubble" OR @Banks OR @blknoiz06 -is:retweet',
  enabled: { twitch: true, kick: true, x: true },
  demoMode: false,
  brandPreset: "marketbubble",
  brandName: "Market Bubble",
  toxicityFilter: true,
};

export const BLANK_DEFAULTS: AppConfig = {
  ...MARKET_BUBBLE_DEFAULTS,
  twitchChannel: "",
  kickChannel: "",
  xQuery: "",
  brandPreset: "custom",
  brandName: "",
};

export function loadConfig(): AppConfig {
  if (typeof window === "undefined") return MARKET_BUBBLE_DEFAULTS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return MARKET_BUBBLE_DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<AppConfig>;
    // merge so new fields added in future versions pick up defaults
    return {
      ...MARKET_BUBBLE_DEFAULTS,
      ...parsed,
      enabled: { ...MARKET_BUBBLE_DEFAULTS.enabled, ...(parsed.enabled ?? {}) },
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
