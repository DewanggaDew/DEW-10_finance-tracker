# Kanto — personal portfolio & finance tracker

Tracks your entire net worth in IDR across cash, savings, time deposits (deposito),
IDX & US stocks, and crypto. Self-hostable. See `docs/PRD.md` and
`docs/ARCHITECTURE.md` for the full plans.

## Stack

Next.js 16 (App Router) · TypeScript · Tailwind v4 + shadcn/ui · PostgreSQL +
Drizzle · Auth.js (credentials) · Recharts. Prices from Yahoo Finance (IDX/US/FX)
and CoinGecko (crypto, IDR-native) behind a `PriceProvider` seam, refreshed by an
in-process scheduler and cached in Postgres — the request path never fetches live.

## Getting started

```bash
docker compose up -d                # Postgres 17 on localhost:5433
cp .env.example .env                # then set a real AUTH_SECRET
npm install
npm run db:migrate                  # apply schema
npm run db:seed -- you@example.com yourpassword "Your Name"   # admin user (optional — /signup works too)
npm run dev                         # http://localhost:3000
```

## Scripts

| Command | What |
|---|---|
| `npm run dev` / `build` / `start` | Next.js app (prod server starts the price scheduler) |
| `npm test` | Vitest — pure domain layer (money, deposits, positions, freshness) |
| `npm run db:generate` / `db:migrate` | Drizzle migrations |
| `npm run db:seed -- <email> <pw> [name]` | Create admin / reset password |
| `npx tsx scripts/probe.ts` | Canary: verify Yahoo & CoinGecko still parse |
| `npx tsx scripts/set-telegram-webhook.ts <url>` | Register the Telegram bot webhook |

## Telegram capture (optional)

Create a bot with [@BotFather](https://t.me/BotFather), put its token in `.env`
(`TELEGRAM_BOT_TOKEN`, plus a random `TELEGRAM_WEBHOOK_SECRET`), register the
webhook against your public URL, then link your account from **Settings** in the
app. After that, `50k kopi` sent to the bot logs an expense and replies with a
confirmation.

## Layout

- `src/core/` — pure domain logic (no I/O): money/FX, deposit accrual,
  average-cost positions, valuation, freshness, market hours
- `src/data/providers/` — Yahoo & CoinGecko fetch + parse
- `src/jobs/` — price refresh + daily net-worth snapshots (started from
  `src/instrumentation.ts`)
- `src/server/` — auth guard, read queries, server actions (all user-scoped)
- `src/db/` — Drizzle schema; the transaction log is the source of truth
