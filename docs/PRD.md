# PRD — Personal Portfolio & Finance Tracker (working title: "Kanto")

**Owner:** Dewangga Indera
**Status:** Draft v0.1
**Last updated:** 2026-07-23

---

## 1. Summary

A self-hostable web + mobile app that tracks a person's **entire net worth** across
heterogeneous holdings — savings, time deposits, bank/e-wallet accounts, IDX & US
stocks, crypto, and arbitrary user-defined asset types — and rolls everything up into
a single **IDR** figure. Two pillars:

1. **Flexible portfolio tracking.** Users create portfolios of any *type*; the UI and
   the data captured adapt to that type (a stock portfolio asks for tickers & lots; a
   deposit asks for principal, rate, and maturity).
2. **Fast spending capture.** Logging an expense must take seconds, from anywhere —
   the friction of capture is the #1 reason personal-finance apps get abandoned.

The hard part — and the technical crux — is **market data for Indonesian stocks**.
We accept near-real-time (delayed ~15–20 min) data from free sources, with
end-of-day close as the guaranteed fallback.

---

## 2. Goals & non-goals

### Goals
- Single **IDR net-worth** number, updated as prices refresh, with history over time.
- Support **any asset type** via a small set of composable primitives — not a
  hard-coded list.
- **Near-real-time IDX & US stock prices** from free sources, degrading gracefully to
  EOD close.
- **Sub-5-second expense capture** on mobile via multiple fast paths.
- Small **multi-user** deployment (family/friends): private logins, per-user data.

### Non-goals (v1)
- Not a trading/brokerage platform — no order execution.
- Not tax filing / accounting-grade double-entry ledger.
- Not budgeting envelopes/forecasting (candidate for v2).
- Not a public SaaS — no billing, no marketing site, no unbounded scaling.
- No bank account aggregation via Open Banking (Indonesia lacks broad availability;
  revisit later).

---

## 3. Users

| Persona | Needs |
|---|---|
| **Primary owner (you)** | Full net-worth view across IDX/US stocks, crypto, deposits, cash; fast daily expense logging; historical trend. |
| **Family/friend member** | Their own isolated portfolios & expenses under their own login; same features, no visibility into others' data. |

Scale assumption: **< 20 users, < 100k transactions total.** Design for correctness
and clarity, not for horizontal scale.

---

## 4. Core concepts & data model

The flexibility comes from modeling everything as **Accounts** holding **Positions**,
with a **Transaction** log and a **Valuation** engine — rather than a fixed taxonomy.

### 4.1 Entities

- **User** — owner of everything below; data is strictly partitioned per user.
- **Portfolio** — a named grouping (e.g. "Retirement", "Trading", "Emergency fund").
  Purely organizational; a user can have many.
- **Account** — a container with a **type** that determines its behavior & fields:
  - `CASH` — bank account, e-wallet (GoPay/OVO), physical cash. Value = balance.
  - `SAVINGS` — like cash, optional interest rate for projection.
  - `DEPOSIT` (deposito) — principal, annual rate, start & maturity date; value accrues.
  - `SECURITIES` — brokerage account holding stock **Positions** (IDX and/or US).
  - `CRYPTO` — wallet/exchange holding crypto **Positions**.
  - `CUSTOM` — user-defined; user chooses valuation mode (see 4.3).
- **Instrument** — a priceable thing: `{ symbol, market, currency, kind }`
  e.g. `BBCA.JK / IDX / IDR / equity`, `AAPL / NASDAQ / USD / equity`,
  `bitcoin / crypto / — / crypto`. Shared across users (a price cache, not user data).
- **Position** — a holding of an Instrument inside an Account:
  quantity (lots for IDX = ×100 shares), average cost, currency.
- **Transaction** — the event log. Types: `BUY`, `SELL`, `DEPOSIT`, `WITHDRAW`,
  `INTEREST`, `DIVIDEND`, `FEE`, `TRANSFER`, `EXPENSE`, `INCOME`, `ADJUSTMENT`,
  `PRICE_SNAPSHOT`. Transactions are the source of truth; balances/positions are
  derived (or cached-and-reconciled).
- **Category** / **Merchant** — for expense/income classification and fast re-entry.

### 4.2 Why a transaction log
Balances and positions are *derived* from transactions. This keeps "any asset type"
tractable: a new type just needs (a) which transaction types it accepts and (b) a
valuation rule. It also gives net-worth history for free.

### 4.3 Valuation modes (how an Account/Position becomes an IDR number)
- **Manual** — user sets/updates the value (cash, custom collectibles).
- **Formula** — computed (deposit: principal × accrued interest to date).
- **Market** — quantity × latest price from the data layer (stocks, crypto).
- All non-IDR values pass through the **FX layer** → converted to IDR at the current
  USD/IDR (or relevant) rate for the rollup; native currency is retained for display.

---

## 5. Features

Priorities: **P0** = MVP, **P1** = fast-follow, **P2** = later.

### 5.1 Portfolio & account management — P0
- Create/edit/delete portfolios and accounts; pick account type; type-specific form.
- Manual balance entry & history for cash/savings.
- Deposit calculator: principal, rate, tenor → projected value & maturity payout.
- Custom account type with user-chosen valuation mode.

### 5.2 Stocks (IDX + US) — P0
- Add positions by ticker (autocomplete against instrument list).
- Record BUY/SELL lots; auto-compute avg cost, unrealized/realized P/L.
- Show latest price, day change, position value in native currency and IDR.
- **Data freshness badge** on every price: `LIVE~` (delayed), `EOD`, or `STALE`.
- Dividends log (manual entry P0; auto-detect P2).

### 5.3 Crypto — P0
- Add coins by CoinGecko id (autocomplete).
- Positions priced **directly in IDR** via CoinGecko (also store USD).
- Same P/L treatment as stocks.

### 5.4 Net-worth dashboard — P0
- Total net worth in IDR, big number, with today's Δ and % change.
- Breakdown by portfolio, by account type, by asset class (donut/bar).
- **Net-worth-over-time** chart (from daily snapshots).
- Per-holding table with sort/filter and freshness badges.

### 5.5 Fast spending capture — P0 (the differentiator; see §7)
- **Quick-add sheet**: amount → category → (optional) note, 2 taps + typing.
- **Recent/frequent** merchants & categories surfaced first (learns from history).
- **Home-screen widget / PWA share target** for one-tap open-to-amount.
- **Chat-bot capture** (Telegram/WhatsApp): send `50k kopi` → logged & confirmed. (P1)
- **Receipt OCR** (photo → amount/merchant guess). (P2)
- Offline-capable: queue entries, sync when online.

### 5.6 Multi-user & auth — P0
- Email/password (or magic link) login; per-user data isolation enforced server-side.
- No cross-user visibility. Admin can create/disable users.

### 5.7 Reports & insight — P1
- Monthly spending by category; income vs. expense; savings rate.
- Portfolio allocation vs. target; simple XIRR/return per portfolio.
- Export CSV.

---

## 6. Market-data architecture (the crux) — P0

**Design stance:** treat free sources as *unreliable dependencies*. Always cache,
always have a fallback, never block the UI on a live fetch.

### 6.1 Validated free source stack (keyless, tested 2026-07-23)

| Asset class | Primary source | Notes |
|---|---|---|
| **IDX equities** | Yahoo Finance chart API — ticker + `.JK` (e.g. `BBCA.JK`) | Returns IDR, `regularMarketPrice`, day high/low, prev close. Delayed ~15–20 min. Unofficial → may break. |
| **US equities** | Yahoo Finance chart API (plain ticker) | Same shape, USD. |
| **Crypto** | CoinGecko `/simple/price?vs_currencies=idr,usd` | Prices **directly in IDR** — no FX needed. Free tier rate-limited (~30 calls/min). |
| **FX USD/IDR** | Yahoo `IDR=X` | Backups: CoinGecko, frankfurter.app (ECB). |

**Fallbacks / redundancy (documented, wired as needed):**
- IDX EOD close from Yahoo daily range (guaranteed fallback = last close).
- Secondary IDX option: Google Sheets `GOOGLEFINANCE("IDX:BBCA")` bridge, or a paid
  API (goapi.io) if free sources degrade — pluggable provider interface.

### 6.2 Freshness policy
- Fetch is **server-side, scheduled & cached** — never client-direct (avoids CORS,
  rate limits, and leaking that we scrape).
- Refresh cadence:
  - IDX during JKT market hours (Mon–Fri 09:00–16:00 WIB): every ~15 min.
  - Crypto: every ~5 min (24/7).
  - FX: every ~60 min.
  - Outside hours: hold last close, mark `EOD`.
- Each cached price carries `{ price, currency, asOf, source, staleness }`.
- Staleness thresholds → badge: fresh → `LIVE~`, > market-close → `EOD`,
  > 24h or fetch failing → `STALE`.

### 6.3 Provider abstraction
A `PriceProvider` interface (`getQuote(instrument)`, `getHistory`) with concrete
Yahoo / CoinGecko implementations, so a source can be swapped or a paid provider
added without touching the valuation engine. **This is the single most important
piece of architectural insurance** given the fragility of free data.

### 6.4 Daily snapshot job
A nightly (post-close) job writes a `PRICE_SNAPSHOT` + net-worth snapshot per user →
powers the net-worth-over-time chart and makes history immune to source outages.

---

## 7. Fast spending capture — UX detail — P0

The design principle: **capture first, categorize later.** Never block logging an
amount on filling everything out.

Ranked fast paths (build in this order):

1. **Quick-add sheet (mobile web/PWA).** Big numpad, amount focused on open. One tap
   picks category from a *frequency-sorted* chip row. Save. ~3s. Note optional.
2. **PWA share target + home-screen icon.** Add-to-home-screen; icon opens straight to
   the quick-add sheet. Android supports share-target so text can be shared in.
3. **Telegram/WhatsApp bot (P1).** Natural-ish: `50k kopi indomaret` →
   parses amount (`50k`→50 000), guesses category from merchant, replies to confirm.
   WhatsApp is near-universal in Indonesia → lowest-friction capture channel.
4. **Recurring/template expenses.** One-tap "log my usual coffee."
5. **Receipt OCR (P2).** Photo → extract total & merchant → prefill sheet.
6. **Bank SMS/notification parsing (P2, opt-in, privacy-sensitive).** Many ID banks
   send transaction SMS/push; an on-device parser could auto-draft expenses. High
   value but fragile and sensitive — explicitly opt-in, deferred.

Supporting: offline queue with sync; smart defaults (last-used account, time-of-day
category hints); undo.

---

## 8. Non-functional requirements

- **Security/privacy:** per-user data isolation enforced in every query; passwords
  hashed (argon2/bcrypt); financial data is sensitive → HTTPS only, secrets in env,
  no third-party analytics on financial figures. Self-host friendly.
- **Reliability:** app must be fully usable with **zero live data** — degrade to last
  known/EOD prices; never show a blank or error where a stale number will do.
- **Performance:** dashboard < 1s on cached data; price fetches never block render.
- **Data portability:** CSV export; the transaction log is the exportable source of
  truth.
- **Auditability:** transactions are append-only where feasible; edits leave history.

---

## 9. Proposed tech stack (for discussion)

Optimized for one-developer velocity, "web + mobile both" from one codebase, and
easy self-hosting.

- **Frontend:** Next.js (React) — responsive web + installable **PWA** (covers both
  desktop dashboard and mobile capture from one codebase; native app deferred).
- **Backend:** Next.js API routes / Node (or a thin separate API). Scheduled jobs via
  cron/worker for price refresh & snapshots.
- **DB:** PostgreSQL (transaction log, positions, price cache). SQLite acceptable for
  single-box self-host.
- **Auth:** Auth.js (NextAuth) or Lucia — email/password + magic link.
- **Data layer:** `PriceProvider` abstraction over Yahoo & CoinGecko; server-side
  fetch + cache table.
- **Charts:** a lightweight React charting lib.
- **Bot (P1):** Telegram Bot API (simplest) first, then WhatsApp Cloud API.

> Native mobile (React Native/Flutter) is a **P2** upgrade once the PWA validates the
> capture UX. PWA gets us "web + mobile both" now at a fraction of the cost.

---

## 10. Roadmap / phasing

**Phase 0 — Foundations (MVP core data model)**
- User/auth, Portfolio/Account/Transaction/Position schema, manual valuation.
- Cash/savings/deposit accounts + net-worth rollup in IDR.
- Basic dashboard.

**Phase 1 — Market data**
- `PriceProvider` + Yahoo (IDX/US) + CoinGecko + FX; cache & freshness badges.
- Stock & crypto positions with live-ish valuation. Daily snapshot job.

**Phase 2 — Fast capture**
- Quick-add sheet + PWA install + frequency-sorted categories + offline queue.

**Phase 3 — Fast-follow (P1)**
- Telegram bot capture; reports (monthly spend, savings rate, allocation); CSV export.

**Later (P2)**
- Receipt OCR, WhatsApp bot, bank-notification parsing, native app, XIRR, budgets.

---

## 11. Success metrics
- **Capture friction:** median time to log an expense < 5s; % expenses logged same-day.
- **Data reliability:** % holdings with fresh-or-EOD (non-`STALE`) prices > 99%.
- **Coverage:** net worth reflects ≥ 95% of the user's real assets (self-reported).
- **Retention:** app opened ≥ 4×/week (proxy for the capture loop working).

---

## 12. Open questions & risks
- **R1 — Free data fragility (highest).** Yahoo/CoinGecko are unofficial/rate-limited
  and can break or throttle. *Mitigation:* provider abstraction, aggressive caching,
  EOD fallback, budget line for a paid IDX API if needed.
- **R2 — IDX ticker/coverage gaps.** Small caps, new listings, suspended stocks may be
  missing or stale on Yahoo. *Mitigation:* manual price override per instrument.
- **R3 — FX accuracy.** Free FX is mid-market, not the rate you'd transact at. Fine for
  net-worth display; note it's indicative.
- **R4 — Bot/OCR/SMS privacy.** Sensitive channels; keep opt-in and clearly scoped.
- **Q1 — IDX lots:** enforce 100-share lot rounding, or allow fractional? (Default: lot-based, warn on odd lots.)
- **Q2 — Realized P/L method:** average cost vs. FIFO? (Default: average cost for v1.)
- **Q3 — Deposit interest:** simple vs. compounding, tax withholding (20%) modeled? (Default: show gross, note tax.)
- **Q4 — Hosting:** where does this run (home server / VPS / Vercel + managed PG)?

---

## Appendix A — Validated API probes (2026-07-23)
- `GET query1.finance.yahoo.com/v8/finance/chart/BBCA.JK` → `currency: IDR`,
  `regularMarketPrice: 6275`, exchange `JKT`, tz `WIB`. ✅
- `GET api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=idr` →
  `{"bitcoin":{"idr":1177743321}}`. ✅
- `GET query1.finance.yahoo.com/v8/finance/chart/IDR=X` → currency `IDR`, live FX. ✅
