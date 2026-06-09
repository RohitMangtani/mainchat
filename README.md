# Mainchat

**Every chat. One feed.**

A unified real-time chat + live stream dashboard, built from scratch. Twitch, Kick, and X merge into one continuous feed next to your embedded live streams — no tab switching, ever. Built for Market Bubble (FaZe Banks + Ansem, Thursdays 1PM PT), configurable for any creator in under a minute.

## What it does

- **One unified feed** — Twitch IRC, Kick chat, and X posts stream into a single scrollable feed in real time, each message permanently tagged with its source platform. Handles hundreds of messages per minute without breaking a sweat (batched 120ms ingest, capped render window).
- **Hover anything** — usernames, messages, viewer counts: an instant tooltip tells you exactly which platform it came from, with context.
- **Streams on the same screen** — embedded Twitch + Kick players with one-click Split / Solo / Picture-in-Picture modes.
- **Vibe engine (local AI)** — live crowd sentiment meter ("euphoric → rugging"), prediction-market bet detection (gold `BET` chips), hype highlighting, trending keywords, top chatters, and a toxicity shield that blurs the gutter (click to reveal). All computed locally — zero API calls, zero latency.
- **Elite dark/gold UI** — draggable chat width, auto-scroll with pause + catch-up pill, per-platform feed filters, live viewer counts, marquee ticker.
- **Yours in one click** — "Load Market Bubble Defaults" pre-wires the show's channels. Or type any Twitch channel, Kick channel, and X search. Settings persist on the device.

## Quick start

```bash
npm install
npm run dev
```

Open http://localhost:3000. It boots in **Market Bubble Mode** automatically. Streams quiet right now? Settings → **Demo mode** simulates the crowd (every simulated message is tagged `DEMO`).

## Market Bubble Mode

Click the gear → **Load Market Bubble Defaults**. That's it. Twitch `fazebanks`, Kick `fazebanks`, and an X live search for the show are pre-wired. To run your own show instead, type your channels and your brand name — everything applies live and persists.

## Optional credentials (all features degrade gracefully without them)

| Env var | Unlocks | Without it |
|---|---|---|
| `X_BEARER_TOKEN` | Live X posts in the feed (recent-search polling) | X lane shows "not configured", everything else works |
| `TWITCH_CLIENT_ID` + `TWITCH_CLIENT_SECRET` | Official Helix API for viewer counts | Falls back to a public read API automatically |

Set them in `.env.local` (or Vercel → Project → Environment Variables).

## How the real-time works

- **Twitch** — anonymous read-only IRC over WebSocket, straight from your browser. No keys, native latency.
- **Kick** — Kick's chat rides Pusher; the browser subscribes directly to the public chat socket. Channel lookup goes browser-direct (server fallback included).
- **X** — a thin server route polls recent search every 25s and the feed merges results (needs `X_BEARER_TOKEN`).

No chat backend, no third-party aggregator, no SaaS. The deployed app is static + three tiny API routes.

## Stack

Next.js 16 (App Router) · TypeScript strict · Tailwind v4 · zero runtime dependencies beyond React.

```
lib/connectors/   twitch.ts kick.ts x.ts demo.ts   ← one class per source, same interface
lib/vibe.ts       local sentiment/bet/toxicity engine
lib/useChat.ts    orchestrator hook: lifecycles, batching, pause/hold
components/       Dashboard, StreamStage, ChatFeed, VibePanel, Ticker, ConfigPanel
app/api/          twitch/info · kick/channel · x/stream
```

## Deploy

```bash
vercel deploy --prod
```

Works on any domain out of the box (the Twitch embed's `parent` resolves at runtime).
