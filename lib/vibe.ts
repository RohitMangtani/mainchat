// ─── Mainchat vibe engine ───────────────────────────────────────────────────
// Lightweight local "AI" layer: lexicon sentiment scoring, tag detection,
// toxicity flagging, and a rolling 90s window tracker that powers the
// vibe meter, top chatters, and trending keywords. Zero deps, no React.

import type {
  ChatMessage,
  PlatformId,
  TopChatter,
  VibeInfo,
  VibeSnapshot,
  VibeTag,
} from "./types";

// ─── Sentiment lexicon ──────────────────────────────────────────────────────

/** Single-token weights, matched on lowercase word-boundary tokens. */
const TOKEN_WEIGHTS: Record<string, number> = {
  // bullish / hype
  pump: 1,
  pumping: 2,
  pumped: 1,
  moon: 1,
  mooning: 2,
  cook: 1,
  cooking: 2,
  bull: 1,
  bullish: 2,
  send: 1,
  sending: 1,
  lfg: 2,
  green: 1,
  dub: 1,
  fire: 1,
  insane: 1,
  goat: 2,
  goated: 2,
  printing: 2,
  banger: 1,
  w: 1,
  // bearish / negative
  dump: -1,
  dumping: -2,
  dumped: -1,
  rug: -2,
  rugged: -2,
  rugging: -2,
  bear: -1,
  bearish: -2,
  red: -1,
  rekt: -2,
  cooked: -1, // "we're cooked"
  trash: -1,
  mid: -1,
  fade: -1,
  l: -1,
};

/** Multi-word phrases, matched with word boundaries on the lowercase text. */
const PHRASE_WEIGHTS: ReadonlyArray<readonly [RegExp, number]> = [
  [/\bup\s+only\b/, 2],
  [/\bclip\s+that\b/, 1],
  [/\bdown\s+bad\b/, -2],
];

/** Emoji weights, counted by substring inclusion (each occurrence counts). */
const EMOJI_WEIGHTS: ReadonlyArray<readonly [string, number]> = [
  ["\u{1F680}", 2], // 🚀 rocket
  ["\u{1F525}", 1], // 🔥 fire
  ["\u{1F4C8}", 2], // 📈 chart up
  ["\u{1F4B0}", 1], // 💰 money bag
  ["\u{1F911}", 1], // 🤑 money face
  ["\u{1F4B8}", 1], // 💸 flying money
  ["\u{1FAE7}", 1], // 🫧 bubbles
  ["\u{1F48E}", 1], // 💎 diamond
  ["\u{1F4C9}", -2], // 📉 chart down
  ["\u{1F480}", -1], // 💀 skull
  ["\u{1FA78}", -1], // 🩸 blood drop
];

// ─── Tag detection ──────────────────────────────────────────────────────────

const BET_WORDS_RE =
  /\b(?:polymarket|kalshi|odds|bet|bets|betting|wager|wagers|yes\s+shares|no\s+shares|calls|puts|long|short|leverage)\b/;
const PERCENT_RE = /\d+(?:\.\d+)?\s?%/;
const DOLLAR_RE = /\$\s?\d/;
const QUESTION_START_RE = /^(?:who|what|why|how|when|anyone)\b/;

// ─── Toxicity ───────────────────────────────────────────────────────────────
// Compact filter list: genuine slurs and strong directed abuse only.
// Mild non-directed profanity intentionally does NOT trip this.

const SLUR_RE =
  /\b(?:n[i1]gg(?:er|a)s?|fagg?ots?|fags?|retards?|retarded|kikes?|sp[i1]cs?|chinks?|gooks?|wetbacks?|beaners?|trann(?:y|ies)|dykes?|coons?|kys)\b/i;

const DIRECTED_ABUSE_RE =
  /\bfuck\s+(?:you|u|off)\b|\bkill\s+(?:your|ur)\s*self\b|\b(?:you'?\s?re|you\s+are|u\s+r|ur)\s+(?:an?\s+)?(?:idiot|moron|loser|scum|scumbag|dumbass|dipshit|worthless|pathetic|subhuman|piece\s+of\s+(?:shit|garbage|trash))\b/i;

// ─── Helpers ────────────────────────────────────────────────────────────────

function countOccurrences(haystack: string, needle: string): number {
  if (needle.length === 0) return 0;
  let count = 0;
  let idx = haystack.indexOf(needle);
  while (idx !== -1) {
    count++;
    idx = haystack.indexOf(needle, idx + needle.length);
  }
  return count;
}

function tokenize(lower: string): string[] {
  const matches = lower.match(/[a-z0-9']+/g);
  return matches ?? [];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

// ─── scoreMessage ───────────────────────────────────────────────────────────

export function scoreMessage(text: string): VibeInfo {
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();
  const tokens = tokenize(lower);

  // Sentiment: lexicon tokens + phrases + emoji, clamped to [-3, 3].
  let raw = 0;
  for (const token of tokens) {
    const weight = TOKEN_WEIGHTS[token];
    if (weight !== undefined) raw += weight;
  }
  for (const [phrase, weight] of PHRASE_WEIGHTS) {
    if (phrase.test(lower)) raw += weight;
  }
  for (const [emoji, weight] of EMOJI_WEIGHTS) {
    raw += countOccurrences(trimmed, emoji) * weight;
  }
  const score = clamp(raw, -3, 3);

  // Tags.
  const tags: VibeTag[] = [];

  if (BET_WORDS_RE.test(lower) || PERCENT_RE.test(lower) || DOLLAR_RE.test(lower)) {
    tags.push("bet");
  }

  let letters = 0;
  let uppers = 0;
  for (const ch of trimmed) {
    if (ch >= "a" && ch <= "z") letters++;
    else if (ch >= "A" && ch <= "Z") {
      letters++;
      uppers++;
    }
  }
  const capsRatio = letters > 0 ? uppers / letters : 0;
  const exclaims = countOccurrences(trimmed, "!");
  const rocketFire =
    countOccurrences(trimmed, "\u{1F680}") + countOccurrences(trimmed, "\u{1F525}");
  if ((capsRatio > 0.6 && trimmed.length > 6) || exclaims >= 3 || rocketFire >= 2) {
    tags.push("hype");
  }

  if (trimmed.endsWith("?") || QUESTION_START_RE.test(lower)) {
    tags.push("question");
  }

  // Toxicity.
  const toxic = SLUR_RE.test(trimmed) || DIRECTED_ABUSE_RE.test(trimmed);

  return { score, tags, toxic };
}

// ─── VibeTracker ────────────────────────────────────────────────────────────

const WINDOW_MS = 90_000;
const WINDOW_SECONDS = 90;

interface WindowEntry {
  ts: number;
  score: number;
  tags: VibeTag[];
  text: string;
  username: string;
  displayName: string;
  platform: PlatformId;
}

const STOPWORDS = new Set<string>([
  // English fillers
  "the", "and", "for", "are", "but", "not", "all", "any", "can", "had",
  "has", "have", "was", "were", "will", "with", "this", "that", "these",
  "those", "they", "them", "their", "then", "than", "there", "here",
  "what", "when", "where", "which", "who", "whom", "why", "how", "you",
  "your", "youre", "you're", "just", "like", "get", "got", "its", "it's",
  "into", "onto", "out", "our", "his", "her", "him", "she", "from",
  "about", "over", "under", "again", "more", "most", "some", "each",
  "very", "too", "also", "now", "only", "own", "same", "still", "even",
  "ever", "off", "did", "does", "doing", "done", "dont", "don't", "cant",
  "can't", "wont", "won't", "isnt", "isn't", "arent", "aren't", "being",
  "been", "because", "cause", "could", "should", "would", "one", "two",
  "way", "much", "many", "let", "lets", "let's", "say", "said", "see",
  "look", "make", "made", "going", "want", "need", "know", "think",
  "mean", "thats", "that's", "theres", "there's", "well", "hey", "hello",
  "wait", "come", "came", "back", "right", "good", "time", "thing",
  "things", "stuff",
  // chat fillers
  "lol", "lmao", "lmfao", "rofl", "omg", "bro", "bruh", "dude", "man",
  "yeah", "yea", "nah", "yes", "okay", "kinda", "sorta", "really",
  "gonna", "wanna", "gotta", "cuz", "tho", "though", "ngl", "tbh",
  "idk", "imo", "btw", "pls", "plz", "chat", "guys", "everyone",
  "actually", "literally",
]);

const URL_RE = /(?:https?:\/\/|www\.)\S+/g;

export class VibeTracker {
  private entries: WindowEntry[] = [];

  add(msg: ChatMessage): void {
    const now = Date.now();
    this.prune(now);
    this.entries.push({
      ts: now,
      score: msg.vibe.score,
      tags: msg.vibe.tags,
      text: msg.text,
      username: msg.username,
      displayName: msg.displayName,
      platform: msg.platform,
    });
  }

  snapshot(): VibeSnapshot {
    const now = Date.now();
    this.prune(now);
    const entries = this.entries;
    const count = entries.length;

    if (count === 0) {
      return {
        meter: 50,
        label: labelFor(50),
        topChatters: [],
        keywords: [],
        betCount: 0,
        rate: 0,
      };
    }

    // Meter: 50 + mean(score) * 16, clamped 0..100.
    let scoreSum = 0;
    for (const entry of entries) scoreSum += entry.score;
    const meter = clamp(50 + (scoreSum / count) * 16, 0, 100);

    // Top chatters: one entry per username+platform pair, top 5 by count.
    const chatterCounts = new Map<string, TopChatter>();
    for (const entry of entries) {
      const key = `${entry.platform}:${entry.username}`;
      const existing = chatterCounts.get(key);
      if (existing) {
        existing.count++;
        existing.displayName = entry.displayName;
      } else {
        chatterCounts.set(key, {
          username: entry.username,
          displayName: entry.displayName,
          platform: entry.platform,
          count: 1,
        });
      }
    }
    const topChatters = Array.from(chatterCounts.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Keywords: token frequency, urls/punctuation stripped, stopwords dropped,
    // top 6 tokens that appear at least twice.
    const tokenCounts = new Map<string, number>();
    for (const entry of entries) {
      const cleaned = entry.text.toLowerCase().replace(URL_RE, " ");
      for (let token of tokenize(cleaned)) {
        token = token.replace(/^'+|'+$/g, "");
        if (token.length < 3) continue;
        if (STOPWORDS.has(token)) continue;
        tokenCounts.set(token, (tokenCounts.get(token) ?? 0) + 1);
      }
    }
    const keywords = Array.from(tokenCounts.entries())
      .filter(([, n]) => n >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([token]) => token);

    // Bet count + message rate over actual window coverage.
    let betCount = 0;
    for (const entry of entries) {
      if (entry.tags.includes("bet")) betCount++;
    }
    const oldestTs = entries[0].ts;
    const secondsSinceOldest = (now - oldestTs) / 1000;
    const coverage = Math.max(1, Math.min(WINDOW_SECONDS, secondsSinceOldest));
    const rate = Math.round(((count / coverage) * 60) * 10) / 10;

    return {
      meter,
      label: labelFor(meter),
      topChatters,
      keywords,
      betCount,
      rate,
    };
  }

  private prune(now: number): void {
    const cutoff = now - WINDOW_MS;
    // Entries are appended in time order, so find the first one still inside
    // the window and drop everything before it.
    let firstAlive = 0;
    while (firstAlive < this.entries.length && this.entries[firstAlive].ts < cutoff) {
      firstAlive++;
    }
    if (firstAlive > 0) this.entries = this.entries.slice(firstAlive);
  }
}

function labelFor(meter: number): string {
  if (meter >= 80) return "euphoric";
  if (meter >= 62) return "cooking";
  if (meter >= 45) return "steady";
  if (meter >= 28) return "shaky";
  return "rugging";
}
