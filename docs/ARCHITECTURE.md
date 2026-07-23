# Architecture Plan — Portfolio & Finance Tracker

**Owner:** Dewangga Indera
**Status:** Draft v0.1
**Last updated:** 2026-07-23
**Companion doc:** [`PRD.md`](./PRD.md)

---

## 0. Guiding principles

1. **Never block the UI on a live external fetch.** Prices come from a server-side
   cache that a background job keeps warm (see PRD §6). The request path only ever
   reads local data.
2. **Transaction log is the source of truth.** Balances, positions, and net worth are
   derived and cacheable; they can always be rebuilt.
3. **Own the design layer.** Prefer copy-paste-into-repo component systems over heavy
   runtime dependencies — full control of aesthetics, no lock-in, zero bundle bloat.
4. **Self-hostable, small-scale correct.** Optimize for one developer's velocity and a
   single-box deploy, not for horizontal scale.
5. **Provider abstraction at every fragile boundary** (price sources, FX, bots).

---

## 1. Design system & UI library survey

The user explicitly asked for a survey of modern design libraries best suited to this
kind of app. A finance/portfolio tracker has three distinct UI surfaces, and the best
answer uses **a small composed stack**, not one monolith:

- **App shell & forms** — nav, sidebars, dialogs, inputs, the quick-add sheet.
- **Data-dense dashboard** — KPI cards, allocation donuts, net-worth trend lines.
- **Big tables** — holdings and transaction grids, sortable/filterable, possibly
  virtualized.
- **Price/stock charts** — candlestick / OHLC time series (a specialized need).

### 1.1 Survey of candidates

| Library | Model | Strengths | Weaknesses | Fit here |
|---|---|---|---|---|
| **shadcn/ui** | Copy-paste (own the code), Tailwind + Radix | Total design control, zero runtime lock-in, huge ecosystem, ~1.5M wk downloads, best-in-class aesthetics for modern SaaS | You assemble it; not "batteries-included" | ★★★★★ app shell, forms, dialogs |
| **Tremor** | Copy-paste, Tailwind + Radix + Recharts | Purpose-built for **dashboards**: KPI cards, sparklines, area/bar/donut charts, deltas. **Same foundation as shadcn → composes cleanly** | Chart set is deliberately limited (no candlestick) | ★★★★★ dashboard & KPI/charts |
| **TanStack Table** | Headless (logic only, you style with shadcn) | Best-in-class for complex grids: sorting, filtering, virtualization for 10k+ rows | Headless → more wiring | ★★★★★ holdings/transactions grids |
| **Mantine** | Batteries-included component lib + hooks | 100+ components, excellent forms/hooks, great TS, SSR | Its own styling engine (less Tailwind-native); a whole-app commitment | ★★★★ strong *alternative* to shadcn+Tremor if you'd rather not assemble |
| **MUI (Material UI)** | Runtime component lib | Mature, enormous, MUI X has finance-grade data grid & charts | "Material" look reads dated/generic; heavier bundle; theming fights you | ★★★ works, but weaker on the "modern aesthetic" goal |
| **Chakra UI v3** | Runtime component lib | Ergonomic, good a11y, themeable | Less momentum than shadcn/Mantine in 2026 | ★★★ |
| **HeroUI / Park UI / Radix Themes** | Newer Tailwind/Radix systems | Modern look, growing | Smaller ecosystems, fewer dashboard-specific pieces | ★★★ nice-to-watch |
| **Ant Design** | Runtime, enterprise | Richest data/table/finance components out of the box | Opinionated enterprise aesthetic; large; harder to make feel "premium/modern" | ★★★ great data density, weaker vibe |

### 1.2 Specialized: price/stock charts

Tremor's charts are great for *portfolio* visuals (trends, allocations) but not for
**candlestick/OHLC**. For real stock charts:

- **TradingView `lightweight-charts`** — the de-facto standard for financial
  candlestick/area charts; tiny (~45KB), fast, canvas-based. **Recommended** for the
  per-stock detail view.
- **Recharts** (bundled with Tremor) — fine for line/area/bar everywhere else.
- *Advanced/custom:* `visx` or `nivo` if we ever need bespoke visualizations.

### 1.3 Recommendation

> **shadcn/ui + Tremor + TanStack Table + TradingView lightweight-charts**, all on
> **Tailwind CSS**.

Rationale: one styling language (Tailwind), one design foundation (Radix), all
copy-paste/own-the-code so aesthetics are fully ours and the bundle stays lean — while
each surface (shell / dashboard / grids / stock charts) uses the tool built for it.
**Mantine is the fallback** if you'd prefer a batteries-included single library over
composing — decide this before Phase 0.

Add: **Tailwind** + **Framer Motion** (micro-interactions for the capture flow),
**lucide-react** (icons), **next-themes** (dark mode — table-stakes for a finance app).

---

## 2. Application architecture — options

Three viable shapes, in increasing operational cost. Each must satisfy the crux: a
**long-running background job** for price refresh + snapshots (serverless cron is too
constrained for a 15-min market-hours loop, rate-limit backoff, and bot webhooks).

### Option A — Next.js full-stack monolith  *(recommended)*
```
Next.js (App Router)
  ├─ RSC + client components        → web dashboard + PWA (mobile capture)
  ├─ Route handlers (/api/*)        → REST/RPC for the client
  ├─ Server Actions                 → mutations (add txn, log expense)
  └─ Worker process (same repo)     → node-cron/BullMQ price refresh + snapshots + bot
PostgreSQL  (Prisma/Drizzle ORM)
```
- **Pros:** one repo, one language, one deploy; RSC gives fast first paint of
  cached data; simplest for a solo dev; runs as a single Node container on a home
  server or a VPS.
- **Cons:** the background worker wants a **long-running host** (not pure serverless).
  Solved by self-hosting the Node server, or Vercel + a separate small worker
  (Railway/Fly/render) that shares the DB.
- **Best when:** self-hosted or single-VPS deploy — which matches the PRD.

### Option B — Decoupled frontend + dedicated backend API
```
Next.js (PWA frontend)  ──HTTP/SSE──▶  API service (NestJS/Fastify, or FastAPI/Go)
                                          ├─ domain/services
                                          ├─ scheduler & workers (prices, bots)
                                          └─ Postgres + Redis
```
- **Pros:** clean separation; the backend is a natural home for schedulers, the bot,
  heavier jobs; easy to add a native mobile app later against the same API; can pick
  a stronger job/runtime (e.g. Go for the price pipeline).
- **Cons:** two codebases, two deploys, more ops and auth plumbing; overkill for
  <20 users.
- **Best when:** you expect native apps, more users, or want the backend in a
  different language.

### Option C — Minimalist single-container self-host
```
SvelteKit or Next.js  +  SQLite  +  in-process cron   →  one Docker image
```
- **Pros:** dead-simple to run on a Raspberry Pi / home NAS; tiny footprint; backups
  are one file.
- **Cons:** SQLite limits concurrency (fine at this scale); fewer managed-hosting
  options; scaling later means a migration.
- **Best when:** strictly personal, run-it-and-forget-it home server.

### Recommendation
**Option A**, deployed as a **single Node container** (Next.js server + an in-process
or sidecar worker) with **PostgreSQL**. It gives modern RSC performance and PWA from
one codebase, keeps ops to one box, and the `PriceProvider`/worker abstraction leaves a
clean seam to peel the backend out to Option B later if native apps arrive. If you want
the absolute lightest touch on a home server, fall back to **Option C with Postgres**
(not SQLite) so concurrency and future growth aren't boxed in.

---

## 3. Recommended architecture (Option A) — layered view

```
┌──────────────────────────────────────────────────────────────┐
│  CLIENT  (Next.js PWA — installable, offline-capable)          │
│  shadcn/ui · Tremor · TanStack Table · lightweight-charts      │
│  ┌───────────────┐  ┌────────────────┐  ┌──────────────────┐   │
│  │ Dashboard     │  │ Quick-add sheet │  │ Holdings / Txns  │   │
│  │ (net worth)   │  │ (offline queue) │  │ grids            │   │
│  └───────────────┘  └────────────────┘  └──────────────────┘   │
│        │ SWR/polling + SSE for live price ticks                 │
└────────┼───────────────────────────────────────────────────────┘
         ▼
┌──────────────────────────────────────────────────────────────┐
│  APP SERVER  (Next.js — route handlers + server actions)       │
│  ┌──────────────┐ ┌───────────────┐ ┌──────────────────────┐  │
│  │ Auth         │ │ Domain services│ │ Read models / queries│  │
│  │ (Auth.js)    │ │ (valuation,    │ │ (dashboard, grids)   │  │
│  │              │ │  P/L, FX, txn) │ │                      │  │
│  └──────────────┘ └───────────────┘ └──────────────────────┘  │
└────────┬───────────────────────────────┬──────────────────────┘
         ▼                                ▼
┌─────────────────────┐        ┌──────────────────────────────────┐
│  PostgreSQL          │        │  WORKER  (node-cron / BullMQ)      │
│  users, portfolios,  │◀──────▶│  ┌────────────────────────────┐   │
│  accounts, positions,│        │  │ Price refresh scheduler     │   │
│  transactions,       │        │  │  ├ IDX (market hrs, 15m)    │   │
│  price_cache,        │        │  │  ├ crypto (5m)              │   │
│  snapshots           │        │  │  └ FX (60m)                 │   │
└─────────────────────┘        │  │ Daily net-worth snapshot    │   │
                               │  │ Telegram/WA bot webhook (P1)│   │
                               │  └──────────┬─────────────────┘   │
                               └─────────────┼─────────────────────┘
                                             ▼
                        ┌─────────────────────────────────────────┐
                        │  PriceProvider abstraction (per source)  │
                        │  Yahoo(IDX/US) · CoinGecko · Yahoo FX     │
                        │  + retry/backoff + rate-limit + fallback  │
                        └─────────────────────────────────────────┘
```

---

## 4. Module breakdown

- **`core/domain`** — pure logic: valuation engine (Manual/Formula/Market), P/L
  (average-cost v1), FX conversion, deposit accrual. No I/O → unit-testable.
- **`core/transactions`** — append-only log; derives positions & balances; reconciles
  cached aggregates.
- **`data/providers`** — `PriceProvider` interface + Yahoo/CoinGecko/FX impls;
  normalizes to `{ price, currency, asOf, source, staleness }`.
- **`data/cache`** — `price_cache` table read/write; freshness classification.
- **`jobs`** — scheduler definitions, snapshot job, backoff/rate-limit policy.
- **`server/api`** — route handlers + server actions; auth guard injects `userId`
  into every query (tenant isolation).
- **`server/read`** — denormalized read queries for dashboard/grids (kept fast).
- **`ui`** — shadcn/Tremor components, feature screens, PWA shell, offline queue.
- **`integrations/bots`** (P1) — Telegram/WhatsApp webhook → expense parser.

---

## 5. Data flow — the price-refresh pipeline (crux)

1. Scheduler fires per asset class on its cadence (IDX only during JKT hours).
2. Worker batches the distinct instruments users actually hold (never the whole
   market) and calls the relevant `PriceProvider`.
3. Provider fetches with timeout + retry/backoff; on failure, **keeps the last cached
   value** and marks staleness — never throws into the UI.
4. Results upserted into `price_cache` with `asOf` + `source`.
5. Optional SSE broadcast of changed instruments → dashboards update live; otherwise
   the client's SWR poll (e.g. every 30–60s) picks up cache changes.
6. Post-close daily job writes `PRICE_SNAPSHOT` + per-user net-worth snapshot → powers
   the trend chart and makes history immune to source outages.

**Freshness contract** surfaced to UI on every price: `LIVE~` (fresh, delayed) ·
`EOD` (last close) · `STALE` (>24h / failing) — badge rendered next to every value.

---

## 6. Reactivity, offline & fast-capture architecture

- **Live-ness:** start with **SWR polling** (simple, robust); upgrade hot views to
  **SSE** if desired. WebSockets are unnecessary at this scale.
- **PWA:** service worker caches the app shell; **offline queue** for expense capture —
  entries persist to IndexedDB and sync via background sync / on reconnect. This makes
  "log a coffee with no signal" work, which is essential for the capture loop.
- **Quick-add:** optimistic UI (entry appears instantly, reconciles on sync);
  frequency-sorted categories computed server-side, cached client-side.
- **Bot capture (P1):** webhook → parser (`"50k kopi"` → amount + category guess) →
  same domain service as the UI → confirmation reply.

---

## 7. Data & persistence

- **PostgreSQL** with **Drizzle** (lightweight, SQL-first, great TS) or **Prisma**
  (richer tooling). Pick one before Phase 0 — leaning **Drizzle** for control + speed.
- Money stored as **integer minor units** (or `NUMERIC`), never float. Currency code
  stored alongside every monetary value.
- Tenant isolation: every user-owned table has `user_id`; all queries scoped by it
  (enforced in `server/read` + a guard) — optionally Postgres RLS for defense-in-depth.
- **Redis optional** — only if BullMQ job queue or SSE fan-out grows; not needed at MVP
  (node-cron in-process is enough).

---

## 8. Deployment topology

| Approach | What runs | Notes |
|---|---|---|
| **Self-host (recommended)** | One Docker container: Next.js server + in-process worker; Postgres container alongside | Simplest single-box; home server or cheap VPS; the worker gets its long-running host for free. |
| **Vercel + external worker** | Next.js on Vercel; small always-on worker (Railway/Fly) sharing managed Postgres (Neon/Supabase) | Great DX for the web app, but splits the deploy because Vercel cron can't run the 15-min market loop cleanly. |
| **Home NAS minimalist (Option C)** | Single container, Postgres, in-process cron | Lowest footprint; keep Postgres (not SQLite) for headroom. |

CI: typecheck + unit tests on the pure domain layer + a smoke test that each
`PriceProvider` still parses (canary for free-source breakage).

---

## 9. Recommended stack — summary

| Layer | Choice | Why |
|---|---|---|
| Framework | **Next.js (App Router, PWA)** | web + mobile from one codebase; RSC perf |
| Language | **TypeScript** end-to-end | shared types client↔server |
| UI system | **shadcn/ui + Tremor + TanStack Table** on **Tailwind** | modern aesthetic, own-the-code, dashboard-ready |
| Stock charts | **TradingView lightweight-charts** | proper candlestick/OHLC |
| Motion/icons/theme | Framer Motion · lucide-react · next-themes | polish + dark mode |
| Auth | **Auth.js (NextAuth)** | email/password + magic link, per-user isolation |
| DB / ORM | **PostgreSQL + Drizzle** | correctness, SQL control, TS types |
| Jobs | **node-cron** (→ BullMQ if needed) | market-hours price loop + snapshots |
| Data providers | **Yahoo (IDX/US/FX) + CoinGecko** behind `PriceProvider` | validated free stack + swap seam |
| Deploy | **single Docker container + Postgres** | one-box self-host |

---

## 10. Performance tactics
- Serve dashboard from **read models / cached aggregates**, not on-the-fly recompute.
- **Never** fetch prices in the request path — read `price_cache` only.
- Batch provider calls to **held instruments**; coalesce duplicate symbols across users.
- Virtualize long grids (TanStack) ; paginate transactions.
- RSC + streaming for first paint; SWR for background freshness.
- Integer money math; precompute net-worth snapshots nightly.

---

## 11. Open questions
- **A1** — shadcn+Tremor composed stack **vs.** Mantine batteries-included? (Lean
  composed; confirm your preference.)
- **A2** — Drizzle vs. Prisma? (Lean Drizzle.)
- **A3** — Hosting target (home server / VPS / Vercel+worker)? Decides worker topology
  (this is the same Q4 from the PRD).
- **A4** — Do we need SSE live ticks in v1, or is polling enough? (Lean polling for MVP.)
```
