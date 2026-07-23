"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { toMinor } from "@/core/money";
import { applyBuy, applySell } from "@/core/positions";
import { getCoinGeckoQuotes } from "@/data/providers/coingecko";
import { Quote } from "@/data/providers/types";
import { getYahooQuote } from "@/data/providers/yahoo";
import { db } from "@/db";
import {
  accounts,
  instruments,
  portfolios,
  positions,
  transactions,
} from "@/db/schema";
import { refreshAll, upsertQuote } from "@/jobs/refresh";
import { requireUserId } from "./session";

function field(formData: FormData, name: string): string | undefined {
  const v = formData.get(name);
  return typeof v === "string" && v.trim() !== "" ? v.trim() : undefined;
}

async function ownedAccount(userId: string, accountId: string) {
  const [account] = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.id, accountId), eq(accounts.userId, userId)));
  if (!account) throw new Error("Account not found");
  return account;
}

function revalidateAll(accountId?: string) {
  revalidatePath("/");
  revalidatePath("/portfolios");
  if (accountId) revalidatePath(`/accounts/${accountId}`);
}

// ---------------------------------------------------------------------------
// Portfolios
// ---------------------------------------------------------------------------

export async function createPortfolio(formData: FormData) {
  const userId = await requireUserId();
  const name = z.string().min(1).parse(field(formData, "name"));
  await db.insert(portfolios).values({ userId, name });
  revalidateAll();
}

export async function deletePortfolio(formData: FormData) {
  const userId = await requireUserId();
  const id = z.uuid().parse(field(formData, "id"));
  await db
    .delete(portfolios)
    .where(and(eq(portfolios.id, id), eq(portfolios.userId, userId)));
  revalidateAll();
}

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

const accountSchema = z.object({
  portfolioId: z.uuid(),
  name: z.string().min(1),
  type: z.enum(["CASH", "SAVINGS", "DEPOSIT", "SECURITIES", "CRYPTO", "CUSTOM"]),
  currency: z.enum(["IDR", "USD"]),
  openingBalance: z.coerce.number().optional(),
  depositPrincipal: z.coerce.number().positive().optional(),
  depositRatePct: z.coerce.number().positive().optional(),
  depositStart: z.iso.date().optional(),
  depositMaturity: z.iso.date().optional(),
});

const VALUATION_BY_TYPE = {
  CASH: "MANUAL",
  SAVINGS: "MANUAL",
  DEPOSIT: "FORMULA",
  SECURITIES: "MARKET",
  CRYPTO: "MARKET",
  CUSTOM: "MANUAL",
} as const;

export async function createAccount(formData: FormData) {
  const userId = await requireUserId();
  const input = accountSchema.parse({
    portfolioId: field(formData, "portfolioId"),
    name: field(formData, "name"),
    type: field(formData, "type"),
    currency: field(formData, "currency"),
    openingBalance: field(formData, "openingBalance"),
    depositPrincipal: field(formData, "depositPrincipal"),
    depositRatePct: field(formData, "depositRatePct"),
    depositStart: field(formData, "depositStart"),
    depositMaturity: field(formData, "depositMaturity"),
  });

  const [portfolio] = await db
    .select()
    .from(portfolios)
    .where(
      and(eq(portfolios.id, input.portfolioId), eq(portfolios.userId, userId)),
    );
  if (!portfolio) throw new Error("Portfolio not found");

  if (
    input.type === "DEPOSIT" &&
    (!input.depositPrincipal ||
      !input.depositRatePct ||
      !input.depositStart ||
      !input.depositMaturity)
  ) {
    throw new Error("Deposit accounts need principal, rate, start and maturity");
  }

  const [account] = await db
    .insert(accounts)
    .values({
      userId,
      portfolioId: input.portfolioId,
      name: input.name,
      type: input.type,
      valuationMode: VALUATION_BY_TYPE[input.type],
      currency: input.currency,
      depositPrincipalMinor:
        input.type === "DEPOSIT"
          ? toMinor(input.depositPrincipal!, input.currency)
          : null,
      depositAnnualRateBps:
        input.type === "DEPOSIT"
          ? Math.round(input.depositRatePct! * 100)
          : null,
      depositStartDate: input.type === "DEPOSIT" ? input.depositStart! : null,
      depositMaturityDate:
        input.type === "DEPOSIT" ? input.depositMaturity! : null,
    })
    .returning();

  if (input.openingBalance) {
    await db.insert(transactions).values({
      userId,
      accountId: account.id,
      type: "ADJUSTMENT",
      amountMinor: toMinor(input.openingBalance, input.currency),
      currency: input.currency,
      note: "Opening balance",
      occurredAt: new Date(),
    });
  }
  revalidateAll();
}

export async function deleteAccount(formData: FormData) {
  const userId = await requireUserId();
  const id = z.uuid().parse(field(formData, "id"));
  await db
    .delete(accounts)
    .where(and(eq(accounts.id, id), eq(accounts.userId, userId)));
  revalidateAll();
}

// ---------------------------------------------------------------------------
// Transactions
// ---------------------------------------------------------------------------

const NEGATIVE_TYPES = new Set(["WITHDRAW", "EXPENSE", "FEE"]);

const transactionSchema = z.object({
  accountId: z.uuid(),
  type: z.enum(["DEPOSIT", "WITHDRAW", "INCOME", "EXPENSE", "INTEREST", "FEE"]),
  amount: z.coerce.number().positive(),
  note: z.string().optional(),
  occurredAt: z.string().optional(),
});

export async function addTransaction(formData: FormData) {
  const userId = await requireUserId();
  const input = transactionSchema.parse({
    accountId: field(formData, "accountId"),
    type: field(formData, "type"),
    amount: field(formData, "amount"),
    note: field(formData, "note"),
    occurredAt: field(formData, "occurredAt"),
  });
  const account = await ownedAccount(userId, input.accountId);

  const magnitude = toMinor(input.amount, account.currency);
  await db.insert(transactions).values({
    userId,
    accountId: account.id,
    type: input.type,
    amountMinor: NEGATIVE_TYPES.has(input.type) ? -magnitude : magnitude,
    currency: account.currency,
    note: input.note,
    occurredAt: input.occurredAt ? new Date(input.occurredAt) : new Date(),
  });
  revalidateAll(account.id);
}

// ---------------------------------------------------------------------------
// Trades (securities & crypto)
// ---------------------------------------------------------------------------

const tradeSchema = z.object({
  accountId: z.uuid(),
  side: z.enum(["BUY", "SELL"]),
  market: z.enum(["IDX", "US", "crypto"]),
  symbol: z.string().min(1),
  quantity: z.coerce.number().positive(),
  /** Total cost (BUY) or proceeds (SELL), in the account's currency. */
  total: z.coerce.number().positive(),
  occurredAt: z.string().optional(),
});

/** Find the instrument, or create it after validating the symbol against the
 *  price provider (which also warms the cache). */
async function resolveInstrument(symbol: string, market: string) {
  const [existing] = await db
    .select()
    .from(instruments)
    .where(
      and(eq(instruments.symbol, symbol), eq(instruments.market, market)),
    );
  if (existing) return existing;

  let quote: Quote | undefined;
  if (market === "crypto") {
    quote = (await getCoinGeckoQuotes([symbol])).get(symbol);
  } else {
    quote = await getYahooQuote(symbol, market).catch(() => undefined);
  }
  if (!quote) {
    throw new Error(
      `Could not find "${symbol}" on ${market === "crypto" ? "CoinGecko" : "Yahoo Finance"}`,
    );
  }

  const [created] = await db
    .insert(instruments)
    .values({
      symbol,
      market,
      currency: quote.currency,
      kind: market === "crypto" ? "crypto" : "equity",
    })
    .returning();
  await upsertQuote(created.id, quote);
  return created;
}

export async function recordTrade(formData: FormData) {
  const userId = await requireUserId();
  const input = tradeSchema.parse({
    accountId: field(formData, "accountId"),
    side: field(formData, "side"),
    market: field(formData, "market"),
    symbol: field(formData, "symbol"),
    quantity: field(formData, "quantity"),
    total: field(formData, "total"),
    occurredAt: field(formData, "occurredAt"),
  });
  const account = await ownedAccount(userId, input.accountId);
  if (account.valuationMode !== "MARKET") {
    throw new Error("Trades are only for securities/crypto accounts");
  }

  const symbol =
    input.market === "crypto"
      ? input.symbol.toLowerCase()
      : input.symbol.toUpperCase();
  const instrument = await resolveInstrument(symbol, input.market);
  const totalMinor = toMinor(input.total, account.currency);

  const [existing] = await db
    .select()
    .from(positions)
    .where(
      and(
        eq(positions.accountId, account.id),
        eq(positions.instrumentId, instrument.id),
      ),
    );
  const state = existing
    ? { quantity: Number(existing.quantity), costBasisMinor: existing.costBasisMinor }
    : { quantity: 0, costBasisMinor: 0n };

  const next =
    input.side === "BUY"
      ? applyBuy(state, input.quantity, totalMinor)
      : applySell(state, input.quantity, totalMinor).position;

  if (existing) {
    if (next.quantity === 0) {
      await db.delete(positions).where(eq(positions.id, existing.id));
    } else {
      await db
        .update(positions)
        .set({
          quantity: String(next.quantity),
          costBasisMinor: next.costBasisMinor,
          updatedAt: new Date(),
        })
        .where(eq(positions.id, existing.id));
    }
  } else {
    await db.insert(positions).values({
      userId,
      accountId: account.id,
      instrumentId: instrument.id,
      quantity: String(next.quantity),
      costBasisMinor: next.costBasisMinor,
      currency: account.currency,
    });
  }

  await db.insert(transactions).values({
    userId,
    accountId: account.id,
    type: input.side,
    amountMinor: input.side === "BUY" ? -totalMinor : totalMinor,
    currency: account.currency,
    instrumentId: instrument.id,
    quantity: String(input.quantity),
    occurredAt: input.occurredAt ? new Date(input.occurredAt) : new Date(),
  });
  revalidateAll(account.id);
}

/** Manual "refresh prices now" from the dashboard. */
export async function refreshPricesNow() {
  await requireUserId();
  await refreshAll();
  revalidatePath("/");
}

/** Manual balance entry: records an ADJUSTMENT for the delta so the
 *  transaction log stays the source of truth. */
export async function setBalance(formData: FormData) {
  const userId = await requireUserId();
  const accountId = z.uuid().parse(field(formData, "accountId"));
  const target = z.coerce.number().parse(field(formData, "balance"));
  const account = await ownedAccount(userId, accountId);

  const [{ sum }] = await db
    .select({
      sum: sql<string>`coalesce(sum(${transactions.amountMinor}), 0)`,
    })
    .from(transactions)
    .where(eq(transactions.accountId, accountId));

  const delta = toMinor(target, account.currency) - BigInt(sum);
  if (delta !== 0n) {
    await db.insert(transactions).values({
      userId,
      accountId,
      type: "ADJUSTMENT",
      amountMinor: delta,
      currency: account.currency,
      note: "Manual balance update",
      occurredAt: new Date(),
    });
  }
  revalidateAll(accountId);
}
