// ─── Demo connector ─────────────────────────────────────────────────────────
// Synthesizes a believable crypto-Twitter / stream-chat crowd reacting to a
// Market Bubble episode (FaZe Banks + Ansem, prediction-market podcast) so the
// dashboard feels alive when real streams are quiet. Every message carries
// `isDemo: true`. This connector never emits onStatus — it does not own any
// platform's connection state.

import type {
  Badge,
  ChatMessage,
  Connector,
  ConnectorEvents,
  PlatformId,
} from "../types";

// ─── Random helpers ──────────────────────────────────────────────────────────

/** Random integer in [min, max], inclusive. */
function ri(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function pick<T>(arr: readonly T[]): T {
  const item = arr[ri(0, arr.length - 1)];
  // Pools are non-empty constants; fallback keeps TS + runtime safe anyway.
  return item ?? arr[0]!;
}

/** Polymarket-style percentage. */
function pct(): number {
  return ri(18, 92);
}

/** Share price in cents. */
function cents(): number {
  return ri(8, 88);
}

/** SOL spot, roughly plausible. */
function solPrice(): number {
  return pick([135, 140, 142, 148, 150, 155, 160, 165, 172, 180] as const);
}

// ─── Personas ────────────────────────────────────────────────────────────────

interface Persona {
  handle: string;
  displayName: string;
  platform: PlatformId;
  color: string;
  badges: Badge[];
}

const PERSONAS: readonly Persona[] = [
  // Twitch crowd — fast chatters, a couple of mods and subs.
  { handle: "gigabrainqq", displayName: "gigabrainqq", platform: "twitch", color: "#ff4d4d", badges: ["mod"] },
  { handle: "basistrade_enjoyer", displayName: "basistrade enjoyer", platform: "twitch", color: "#22d3ee", badges: ["mod", "sub"] },
  { handle: "solrotator", displayName: "solrotator", platform: "twitch", color: "#00d4aa", badges: ["sub"] },
  { handle: "perpetualbull", displayName: "PerpetualBull", platform: "twitch", color: "#f5a623", badges: [] },
  { handle: "exitliquidityy", displayName: "exitliquidityy", platform: "twitch", color: "#b975ff", badges: [] },
  { handle: "delta1fan", displayName: "delta1fan", platform: "twitch", color: "#4da6ff", badges: ["sub"] },
  { handle: "chartgoblin", displayName: "chart goblin", platform: "twitch", color: "#ff6bd6", badges: [] },
  { handle: "fundingrateflat", displayName: "fundingrateflat", platform: "twitch", color: "#9ae62e", badges: [] },
  { handle: "wagmi_wendy", displayName: "wagmi wendy", platform: "twitch", color: "#ffd23f", badges: ["sub"] },
  { handle: "liquidat3d", displayName: "LIQUIDAT3D", platform: "twitch", color: "#ff7849", badges: [] },
  { handle: "ngmi_nick", displayName: "ngmi nick", platform: "twitch", color: "#94a3ff", badges: [] },
  // Kick crowd — degens, an OG, a VIP, a mod.
  { handle: "greenline_gus", displayName: "greenline gus", platform: "kick", color: "#53fc18", badges: ["og"] },
  { handle: "sizetalks", displayName: "sizetalks", platform: "kick", color: "#ff5e5b", badges: ["mod"] },
  { handle: "railgunrandy", displayName: "railgun randy", platform: "kick", color: "#39c0ff", badges: ["vip"] },
  { handle: "degenscalper", displayName: "degenscalper", platform: "kick", color: "#ffb020", badges: [] },
  { handle: "kickflip_kelly", displayName: "kickflip kelly", platform: "kick", color: "#e879f9", badges: ["sub"] },
  { handle: "overleveraged_olly", displayName: "overleveraged olly", platform: "kick", color: "#fb7185", badges: [] },
  { handle: "juicedperp", displayName: "juicedperp", platform: "kick", color: "#34d399", badges: ["sub"] },
  { handle: "moonbagmarty", displayName: "moonbag marty", platform: "kick", color: "#fde047", badges: [] },
  { handle: "stoplosswho", displayName: "stoplosswho", platform: "kick", color: "#60a5fa", badges: [] },
  // X crowd — post-brained, some verified.
  { handle: "0xmilady", displayName: "milady", platform: "x", color: "#f472b6", badges: ["verified"] },
  { handle: "polywhale", displayName: "polywhale", platform: "x", color: "#38bdf8", badges: ["verified"] },
  { handle: "yesbettor", displayName: "yes bettor", platform: "x", color: "#4ade80", badges: ["verified"] },
  { handle: "ansemfanacct", displayName: "ansem fan acct", platform: "x", color: "#fbbf24", badges: [] },
  { handle: "bubbleboy_clips", displayName: "bubble boy clips", platform: "x", color: "#a78bfa", badges: [] },
  { handle: "thetagang_tina", displayName: "thetagang tina", platform: "x", color: "#fb923c", badges: [] },
  { handle: "onchainoracle", displayName: "onchain oracle", platform: "x", color: "#2dd4bf", badges: [] },
  { handle: "ct_intern", displayName: "ct intern", platform: "x", color: "#c084fc", badges: [] },
] as const;

// ─── Message templates ───────────────────────────────────────────────────────

type Audience = "chat" | "x" | "any";

interface Template {
  audience: Audience;
  make: () => string;
}

const TEMPLATES: readonly Template[] = [
  // Live reactions — short, fast, chat-flavored.
  { audience: "chat", make: () => "BANKS IS COOKING" },
  { audience: "chat", make: () => "W TAKE" },
  { audience: "chat", make: () => "L take ngl" },
  { audience: "chat", make: () => "clip that" },
  { audience: "chat", make: () => "CLIP IT NOW" },
  { audience: "chat", make: () => "LMAOOO" },
  { audience: "chat", make: () => "ansem cooked him there" },
  { audience: "chat", make: () => "no shot he just said that" },
  { audience: "chat", make: () => "he's so right for that" },
  { audience: "chat", make: () => "chat is this real" },
  { audience: "chat", make: () => "REAL" },
  { audience: "chat", make: () => "FACTS" },
  { audience: "chat", make: () => "GIGACHAD take" },
  { audience: "chat", make: () => "W stream" },
  { audience: "chat", make: () => "we are so back" },
  { audience: "chat", make: () => "it's over... wait no we're back" },
  { audience: "chat", make: () => "best episode yet no cap" },
  { audience: "chat", make: () => "the bubble boys are BACK" },
  { audience: "chat", make: () => "banks lowkey gets markets better than half of CT" },
  { audience: "chat", make: () => "ansem's voice is so calming lol" },
  { audience: "chat", make: () => "first time catching this live, show is great" },
  { audience: "chat", make: () => "PUMP IT" },
  { audience: "chat", make: () => "rewind that 10 seconds, instant classic" },
  { audience: "chat", make: () => "mods pin that take" },
  // Prediction-market chatter.
  { audience: "any", make: () => `polymarket has it at ${pct()}% now` },
  { audience: "any", make: () => `just market bought YES at ${cents()}c` },
  { audience: "any", make: () => "odds flipped after that take" },
  { audience: "chat", make: () => "kalshi printing rn" },
  { audience: "any", make: () => `i'm up ${ri(12, 140)}% on this market lol` },
  { audience: "chat", make: () => "WHO IS BETTING NO LMAO" },
  { audience: "chat", make: () => "YES holders eating good tonight" },
  { audience: "chat", make: () => "limit orders getting ran through as he talks" },
  { audience: "any", make: () => `${pct()}% odds is free money and you all know it` },
  { audience: "any", make: () => `i had this at ${cents()}c yesterday smh` },
  { audience: "chat", make: () => `NO just hit ${cents()}c, somebody knows something` },
  { audience: "chat", make: () => "the line moved before he finished the sentence lol" },
  { audience: "chat", make: () => "resolution date is next friday btw for anyone asking" },
  // Crypto talk.
  { audience: "any", make: () => `sol back over ${solPrice()}` },
  { audience: "chat", make: () => "btc chopping" },
  { audience: "chat", make: () => "funding is cooked" },
  { audience: "chat", make: () => "perps are wild rn" },
  { audience: "chat", make: () => "eth looking heavy ngl" },
  { audience: "chat", make: () => `alts bleeding while sol holds ${solPrice()}, classic` },
  { audience: "chat", make: () => "open interest just spiked, somebody's positioned" },
  { audience: "chat", make: () => "stables rotating in, watch the next hour" },
  // Questions — feeds the "question" vibe tag.
  { audience: "chat", make: () => "what did ansem say about the eth trade?" },
  { audience: "any", make: () => "anyone got the polymarket link?" },
  { audience: "chat", make: () => "wait what market are they talking about?" },
  { audience: "chat", make: () => "who's the guest next week?" },
  { audience: "chat", make: () => "did i miss the sol take?" },
  { audience: "chat", make: () => "is this clipped anywhere? joined late" },
  { audience: "chat", make: () => "what odds did banks say he'd take?" },
  // Hype with emoji.
  { audience: "chat", make: () => "🚀🚀🚀" },
  { audience: "chat", make: () => "🔥🔥🔥🔥" },
  { audience: "chat", make: () => "💀💀" },
  { audience: "chat", make: () => "📈📈📈 UP ONLY" },
  { audience: "chat", make: () => "💰💰💰" },
  { audience: "chat", make: () => "🫧🫧 BUBBLE BOYS 🫧🫧" },
  { audience: "chat", make: () => "LFG 🚀🔥" },
  { audience: "any", make: () => `YES at ${cents()}c 📈 thank me later` },
  // Mild negativity — moves the vibe meter down.
  { audience: "chat", make: () => "nah that take is trash lol" },
  { audience: "chat", make: () => "down bad after that one" },
  { audience: "chat", make: () => "this segment is mid tbh" },
  { audience: "chat", make: () => "cope" },
  { audience: "chat", make: () => "he's gonna regret that one" },
  { audience: "chat", make: () => "fading this take instantly" },
  { audience: "chat", make: () => "absolute dog water take lmaooo" },
  { audience: "any", make: () => "worst odds read i've heard all week, fade it" },
  // Mild profanity (no slurs) — gives the toxicity filter something to blur.
  { audience: "chat", make: () => "holy shit he actually said it" },
  { audience: "chat", make: () => "this market is so fucking cooked lmao" },
  { audience: "any", make: () => "banks is a damn menace for that take" },
  // X posts — longer, lowercase CT style, take-flavored.
  { audience: "x", make: () => "banks just gave the most retail take of all time and it's still sharper than half of fintwit. the bar is on the floor" },
  { audience: "x", make: () => `ansem casually dropping alpha on a podcast while everyone argues about ${pct()}% odds. listen closer` },
  { audience: "x", make: () => "market bubble might be the only show that moves polymarket lines in real time. watching attention become liquidity live" },
  {
    audience: "x",
    make: () => {
      const a = cents();
      const b = Math.min(96, a + ri(4, 18));
      return `watching this ep and the YES line went from ${a}c to ${b}c mid-sentence. attention is liquidity, there's your thesis`;
    },
  },
  { audience: "x", make: () => "ansem on the eth trade: positioning matters more than narrative. printing that on a shirt" },
  { audience: "x", make: () => `live odds check: ${pct()}% and climbing. the bubble boys do it again` },
  { audience: "x", make: () => "hot take: prediction markets are the only honest media left and this podcast proves it weekly" },
  { audience: "x", make: () => `sol over ${solPrice()} while banks is literally talking about it live. timeline in shambles` },
  { audience: "x", make: () => "btc chopping, funding flat, best trade on the board right now is just listening to this episode" },
  { audience: "x", make: () => "not me opening polymarket mid-podcast to fade a faze banks take. it filled. no regrets" },
  { audience: "x", make: () => "this is the episode where banks finally gets liquidity. screenshot this post" },
  { audience: "x", make: () => "ct will dunk on banks all day then quietly copy his positioning. seen it three times this month" },
  { audience: "x", make: () => `if you're not cross-referencing podcast takes against live order books you're trading blind. YES at ${cents()}c says hi` },
  { audience: "x", make: () => "the bull case for this show is simple: two guys who actually have skin in the game saying the quiet part out loud" },
] as const;

// ─── Platform weighting ──────────────────────────────────────────────────────

const PLATFORM_WEIGHTS: Record<PlatformId, number> = {
  twitch: 0.45,
  kick: 0.35,
  x: 0.2,
};

const NEUTRAL_VIBE = { score: 0, tags: [], toxic: false } as const;

const RECENT_TEMPLATE_WINDOW = 10;

// ─── Connector ───────────────────────────────────────────────────────────────

export class DemoConnector implements Connector {
  private readonly platforms: PlatformId[];
  private readonly events: ConnectorEvents;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private counter = 0;
  /** Indices into TEMPLATES emitted recently — avoid repeats. */
  private recentTemplates: number[] = [];
  /** Remaining messages in the current burst (a "moment" happened). */
  private burstRemaining = 0;

  constructor(platforms: PlatformId[], events: ConnectorEvents) {
    // De-dupe while preserving order; only ever emit on platforms we were given.
    this.platforms = [...new Set(platforms)];
    this.events = events;
  }

  start(): void {
    if (this.running) return; // idempotent — never double-schedule
    if (this.platforms.length === 0) return;
    this.running = true;
    this.schedule(ri(200, 700)); // first message lands quickly
  }

  stop(): void {
    this.running = false;
    this.burstRemaining = 0;
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  // ── internals ──────────────────────────────────────────────────────────────

  private schedule(delayMs: number): void {
    if (!this.running) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.tick();
    }, delayMs);
  }

  private tick(): void {
    if (!this.running) return; // stop() raced the timer — emit nothing
    this.emitOne();
    if (!this.running) return; // callback may have stopped us synchronously

    let gap: number;
    if (this.burstRemaining > 0) {
      this.burstRemaining -= 1;
      gap = ri(90, 320); // mid-burst: rapid-fire
    } else if (Math.random() < 0.12) {
      // A moment just happened — 3-6 messages total land in quick succession.
      this.burstRemaining = ri(2, 5);
      gap = ri(90, 320);
    } else {
      gap = ri(350, 1500); // normal jittered cadence
    }
    this.schedule(gap);
  }

  private emitOne(): void {
    const platform = this.pickPlatform();
    const persona = this.pickPersona(platform);
    const text = this.pickText(platform);

    this.counter += 1;
    const msg: ChatMessage = {
      id: `demo-${this.counter}`,
      platform,
      username: persona.handle,
      displayName: persona.displayName,
      text,
      color: persona.color,
      badges: [...persona.badges],
      timestamp: Date.now(),
      isDemo: true,
      vibe: { ...NEUTRAL_VIBE, tags: [] }, // enriched centrally by useChat
    };
    this.events.onMessage(msg);
  }

  private pickPlatform(): PlatformId {
    let total = 0;
    for (const p of this.platforms) total += PLATFORM_WEIGHTS[p];
    let r = Math.random() * total;
    for (const p of this.platforms) {
      r -= PLATFORM_WEIGHTS[p];
      if (r <= 0) return p;
    }
    return this.platforms[this.platforms.length - 1] ?? "twitch";
  }

  private pickPersona(platform: PlatformId): Persona {
    const pool = PERSONAS.filter((p) => p.platform === platform);
    return pool.length > 0 ? pick(pool) : pick(PERSONAS);
  }

  private pickText(platform: PlatformId): string {
    const wanted: Audience = platform === "x" ? "x" : "chat";
    const eligible: number[] = [];
    for (let i = 0; i < TEMPLATES.length; i += 1) {
      const t = TEMPLATES[i];
      if (t !== undefined && (t.audience === wanted || t.audience === "any")) {
        eligible.push(i);
      }
    }
    // Prefer templates not used in the last N emissions.
    const fresh = eligible.filter((i) => !this.recentTemplates.includes(i));
    const idx = pick(fresh.length > 0 ? fresh : eligible);

    this.recentTemplates.push(idx);
    if (this.recentTemplates.length > RECENT_TEMPLATE_WINDOW) {
      this.recentTemplates = this.recentTemplates.slice(-RECENT_TEMPLATE_WINDOW);
    }

    const template = TEMPLATES[idx];
    return template !== undefined ? template.make() : "W TAKE";
  }
}
