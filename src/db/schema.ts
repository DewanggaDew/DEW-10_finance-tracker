import {
  bigint,
  boolean,
  char,
  date,
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const accountType = pgEnum("account_type", [
  "CASH",
  "SAVINGS",
  "DEPOSIT",
  "SECURITIES",
  "CRYPTO",
  "CUSTOM",
]);

export const valuationMode = pgEnum("valuation_mode", [
  "MANUAL",
  "FORMULA",
  "MARKET",
]);

export const transactionType = pgEnum("transaction_type", [
  "BUY",
  "SELL",
  "DEPOSIT",
  "WITHDRAW",
  "INTEREST",
  "DIVIDEND",
  "FEE",
  "TRANSFER",
  "EXPENSE",
  "INCOME",
  "ADJUSTMENT",
  "PRICE_SNAPSHOT",
]);

export const categoryKind = pgEnum("category_kind", ["EXPENSE", "INCOME"]);

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  isAdmin: boolean("is_admin").notNull().default(false),
  disabledAt: timestamp("disabled_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const portfolios = pgTable("portfolios", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const accounts = pgTable("accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  portfolioId: uuid("portfolio_id")
    .notNull()
    .references(() => portfolios.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  type: accountType("type").notNull(),
  valuationMode: valuationMode("valuation_mode").notNull(),
  currency: char("currency", { length: 3 }).notNull().default("IDR"),
  // DEPOSIT (deposito) parameters — null for other account types
  depositPrincipalMinor: bigint("deposit_principal_minor", { mode: "bigint" }),
  depositAnnualRateBps: integer("deposit_annual_rate_bps"),
  depositStartDate: date("deposit_start_date"),
  depositMaturityDate: date("deposit_maturity_date"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// Priceable things (shared price catalog, not user data). Phase 0 only defines
// the table so positions/transactions can reference it; pricing comes in Phase 1.
export const instruments = pgTable(
  "instruments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    symbol: text("symbol").notNull(),
    market: text("market").notNull(), // IDX | NASDAQ | NYSE | crypto | ...
    currency: char("currency", { length: 3 }).notNull(),
    kind: text("kind").notNull(), // equity | crypto | ...
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("instruments_symbol_market_idx").on(t.symbol, t.market)],
);

// Cached holding per (account, instrument), derived from transactions.
export const positions = pgTable(
  "positions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    instrumentId: uuid("instrument_id")
      .notNull()
      .references(() => instruments.id),
    // numeric to support fractional crypto quantities; IDX lots are whole shares
    quantity: numeric("quantity", { precision: 38, scale: 18 }).notNull(),
    // total cost basis in minor units of `currency` (average-cost method)
    costBasisMinor: bigint("cost_basis_minor", { mode: "bigint" }).notNull(),
    currency: char("currency", { length: 3 }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("positions_account_instrument_idx").on(
      t.accountId,
      t.instrumentId,
    ),
  ],
);

export const categories = pgTable(
  "categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    kind: categoryKind("kind").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("categories_user_name_kind_idx").on(t.userId, t.name, t.kind)],
);

// Latest quote per instrument, kept warm by the background refresh job.
// The request path only ever reads this table — never a live provider.
export const priceCache = pgTable("price_cache", {
  instrumentId: uuid("instrument_id")
    .primaryKey()
    .references(() => instruments.id, { onDelete: "cascade" }),
  price: numeric("price", { precision: 38, scale: 18 }).notNull(),
  currency: char("currency", { length: 3 }).notNull(),
  previousClose: numeric("previous_close", { precision: 38, scale: 18 }),
  // Crypto quotes come in IDR; the USD leg is kept alongside (PRD §5.3)
  priceUsd: numeric("price_usd", { precision: 38, scale: 18 }),
  asOf: timestamp("as_of", { withTimezone: true }).notNull(),
  source: text("source").notNull(),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull(),
});

// IDR per 1 unit of foreign currency, refreshed hourly.
export const fxRates = pgTable("fx_rates", {
  currency: char("currency", { length: 3 }).primaryKey(),
  rateIdr: numeric("rate_idr", { precision: 20, scale: 6 }).notNull(),
  asOf: timestamp("as_of", { withTimezone: true }).notNull(),
  source: text("source").notNull(),
});

// One row per user per day — powers the net-worth-over-time chart and makes
// history immune to price-source outages.
export const netWorthSnapshots = pgTable(
  "net_worth_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    totalIdrMinor: bigint("total_idr_minor", { mode: "bigint" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("net_worth_snapshots_user_date_idx").on(t.userId, t.date)],
);

// The source of truth. Balances and positions are derived from this log.
export const transactions = pgTable("transactions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  accountId: uuid("account_id")
    .notNull()
    .references(() => accounts.id, { onDelete: "cascade" }),
  type: transactionType("type").notNull(),
  // Signed effect on the account balance, in minor units of `currency`.
  // DEPOSIT/INCOME/INTEREST/DIVIDEND/SELL are positive; WITHDRAW/EXPENSE/FEE/BUY
  // are negative; ADJUSTMENT may be either.
  amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
  currency: char("currency", { length: 3 }).notNull(),
  // BUY/SELL only
  instrumentId: uuid("instrument_id").references(() => instruments.id),
  quantity: numeric("quantity", { precision: 38, scale: 18 }),
  // EXPENSE/INCOME classification
  categoryId: uuid("category_id").references(() => categories.id, {
    onDelete: "set null",
  }),
  merchant: text("merchant"),
  note: text("note"),
  // Links the two legs of a TRANSFER
  transferGroupId: uuid("transfer_group_id"),
  // Idempotency key from the offline capture queue — a retried sync of the
  // same entry must not double-log the expense
  clientId: uuid("client_id").unique(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
