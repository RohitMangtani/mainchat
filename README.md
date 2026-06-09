# Mainchat

A unified real-time chat + live stream dashboard, built from scratch for **Market Bubble** (FaZe Banks + Ansem, Thursdays 1PM PT) — and configurable for any creator in under a minute. **Zero paid APIs, zero keys required.**

## What it does

- **One unified feed** — Twitch IRC, Kick chat, and X live-broadcast chat stream into a single scrollable feed in real time, each message permanently tagged with its source platform. Handles hundreds of messages per minute (batched 120ms ingest, capped render window).
- **Real emotes** — Twitch native emotes, Kick native emotes, and third-party 7TV / BTTV / FFZ sets render inline, exactly like native chat.
- **Keyless X chat** — point it at any @handle and it joins that account's live X broadcast chat using the same anonymous flow X's own web player uses. No API key, no cost. (A search query instead engages the official recent-search API if you add `X_BEARER_TOKEN`.)
- **Streams on the same screen** — embedded Twitch + Kick players with Split / Solo / PiP modes. Layout switches are pure CSS, so flipping views never reloads a stream or drops audio.
- **MARKET WATCH tape** — a working replica of the ticker band the show runs on-air: SPY · BTC · ETH · SOL · NVDA · TSLA · GOLD · HIMS plus the hosts' signature calls (HYPE, ZEC, WIF, BONK, DOGE, PUMP) and live Polymarket odds. Sources: Yahoo Finance + CoinGecko + Polymarket gamma — all free, all keyless, cached server-side.
- **Vibe engine (local AI)** — live crowd-sentiment meter ("euphoric → rugging"), a one-line chat pulse summary, top chatters, gold `BET` chips on prediction-market talk, hype detection, an audience-questions filter, and a toxicity shield that blurs the gutter (click to reveal). All computed locally — zero API calls.
- **OBS overlay** — add `/overlay?twitch=<ch>&kick=<ch>` as a transparent Browser Source and the unified feed runs on the broadcast itself.
- **Hover anything** — usernames, messages, viewer counts: an instant tooltip says exactly which platform it came from.
- **Show-accurate design** — letterpress serif chyrons, broadcast red for ON AIR, dual-city clocks, and the MARKET WATCH band, drawn from the show's actual brand and stream package.

## Quick start

```bash
npm install
npm run dev
```

Open http://localhost:3000. It boots in **Market Bubble Mode** automatically (Twitch + Kick `fazebanks`, X `@MarketBubble`). Streams quiet right now? Settings → **Demo mode** simulates the crowd (every simulated message is tagged `DEMO`).

## Market Bubble Mode

Click the gear → **Load Market Bubble Defaults**. To run any other show: type your Twitch channel, Kick channel, and an X @handle (or search query), plus your brand name. Everything applies live and persists on the device.

## Optional credentials (everything works without them)

| Env var | Unlocks | Without it |
|---|---|---|
| `X_BEARER_TOKEN` | X **search-query** streaming via the official recent-search API | @handle live-broadcast chat still works keyless |
| `TWITCH_CLIENT_ID` + `TWITCH_CLIENT_SECRET` | Official Helix API for viewer counts | Falls back to a public read API automatically |

## How the real-time works

- **Twitch** — anonymous read-only IRC over WebSocket, straight from the browser. Native latency, no keys.
- **Kick** — browser-direct channel lookup (Kick's API allows CORS; server fallback included), then their public Pusher chat socket.
- **X** — a server route resolves @handle → live broadcast → chat room (guest-token flow), then the browser joins the broadcast chat WebSocket. Anonymous feeds carry a ~3s platform-side delay; the lane idles politely and auto-joins when the account goes live.
- **Emotes** — 7TV/BTTV/FFZ channel + global sets fetched once and cached; native emotes ride each message.

No chat backend, no aggregator, no SaaS: a static client + five small API routes.

## Stack

Next.js 16 (App Router) · TypeScript strict · Tailwind v4 · zero runtime dependencies beyond React.

```
lib/connectors/   twitch · kick · x (search) · xlive (keyless broadcast) · demo
lib/emotes.ts     native + 7TV/BTTV/FFZ emote engine
lib/vibe.ts       local sentiment/bet/toxicity engine
lib/useChat.ts    orchestrator hook: lifecycles, batching, pause/hold
app/api/          tape · twitch/info · kick/channel · x/stream · x/live
app/overlay/      transparent OBS browser-source route
```

## Deploy

```bash
vercel deploy --prod
```

Works on any domain out of the box (the Twitch embed's `parent` resolves at runtime).
