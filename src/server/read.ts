import { asc, desc, eq, sql } from "drizzle-orm";
import { classifyFreshness, Freshness } from "@/core/freshness";
import { convertMinor, FxRates, toIdrMinor } from "@/core/money";
import { positionMarketValueMinor } from "@/core/positions";
import { accountValueMinor } from "@/core/valuation";
import { db } from "@/db";
import {
  accounts,
  fxRates,
  instruments,
  netWorthSnapshots,
  portfolios,
  positions,
  priceCache,
  transactions,
} from "@/db/schema";
import { INDICATIVE_FX } from "./fx";

export type AccountRow = typeof accounts.$inferSelect;

/** Live rates from the FX job, over the indicative fallback. */
export async function getFxRates(): Promise<FxRates> {
  const rows = await db.select().from(fxRates);
  const fx = { ...INDICATIVE_FX };
  for (const r of rows) fx[r.currency] = Number(r.rateIdr);
  return fx;
}

// ---------------------------------------------------------------------------
// Holdings (positions + cached prices)
// ---------------------------------------------------------------------------

export interface Holding {
  positionId: string;
  accountId: string;
  symbol: string;
  market: string;
  kind: string;
  quantity: number;
  /** In the position's (account's) currency. */
  costBasisMinor: bigint;
  currency: string;
  price: number | null;
  priceCurrency: string | null;
  previousClose: number | null;
  asOf: Date | null;
  freshness: Freshness;
  valueIdrMinor: bigint;
  costBasisIdrMinor: bigint;
}

export async function getHoldings(
  userId: string,
  fx: FxRates,
): Promise<Holding[]> {
  const rows = await db
    .select({
      positionId: positions.id,
      accountId: positions.accountId,
      symbol: instruments.symbol,
      market: instruments.market,
      kind: instruments.kind,
      quantity: positions.quantity,
      costBasisMinor: positions.costBasisMinor,
      currency: positions.currency,
      price: priceCache.price,
      priceCurrency: priceCache.currency,
      previousClose: priceCache.previousClose,
      asOf: priceCache.asOf,
    })
    .from(positions)
    .innerJoin(instruments, eq(positions.instrumentId, instruments.id))
    .leftJoin(priceCache, eq(priceCache.instrumentId, instruments.id))
    .where(sql`${positions.userId} = ${userId} and ${positions.quantity} > 0`);

  const now = new Date();
  return rows.map((r) => {
    const quantity = Number(r.quantity);
    const price = r.price !== null ? Number(r.price) : null;
    const costBasisIdrMinor = toIdrMinor(r.costBasisMinor, r.currency, fx);
    // No price yet → value at cost, marked STALE.
    const valueIdrMinor =
      price !== null && r.priceCurrency
        ? toIdrMinor(
            positionMarketValueMinor(quantity, price, r.priceCurrency),
            r.priceCurrency,
            fx,
          )
        : costBasisIdrMinor;
    return {
      positionId: r.positionId,
      accountId: r.accountId,
      symbol: r.symbol,
      market: r.market,
      kind: r.kind,
      quantity,
      costBasisMinor: r.costBasisMinor,
      currency: r.currency,
      price,
      priceCurrency: r.priceCurrency,
      previousClose: r.previousClose !== null ? Number(r.previousClose) : null,
      asOf: r.asOf,
      freshness: r.asOf ? classifyFreshness(r.asOf, now) : "STALE",
      valueIdrMinor,
      costBasisIdrMinor,
    };
  });
}

// ---------------------------------------------------------------------------
// Accounts with values
// ---------------------------------------------------------------------------

export interface AccountWithValue extends AccountRow {
  balanceMinor: bigint;
  /** Native-currency value, minor units. */
  valueMinor: bigint;
  /** Value converted to IDR minor units (rupiah). */
  valueIdrMinor: bigint;
}

export async function getAccountsWithValues(
  userId: string,
): Promise<AccountWithValue[]> {
  const fx = await getFxRates();
  const [accountRows, balanceRows, holdings] = await Promise.all([
    db.select().from(accounts).where(eq(accounts.userId, userId)),
    db
      .select({
        accountId: transactions.accountId,
        sum: sql<string>`coalesce(sum(${transactions.amountMinor}), 0)`,
      })
      .from(transactions)
      .where(eq(transactions.userId, userId))
      .groupBy(transactions.accountId),
    getHoldings(userId, fx),
  ]);

  const balances = new Map(balanceRows.map((b) => [b.accountId, BigInt(b.sum)]));
  const holdingsByAccount = new Map<string, bigint>();
  for (const h of holdings) {
    holdingsByAccount.set(
      h.accountId,
      (holdingsByAccount.get(h.accountId) ?? 0n) + h.valueIdrMinor,
    );
  }

  const asOf = new Date();
  return accountRows.map((a) => {
    const balanceMinor = balances.get(a.id) ?? 0n;
    let valueMinor: bigint;
    let valueIdrMinor: bigint;
    if (a.valuationMode === "MARKET") {
      valueIdrMinor =
        toIdrMinor(balanceMinor, a.currency, fx) +
        (holdingsByAccount.get(a.id) ?? 0n);
      valueMinor = convertMinor(valueIdrMinor, "IDR", a.currency, fx);
    } else {
      valueMinor = accountValueMinor(
        {
          valuationMode: a.valuationMode,
          currency: a.currency,
          balanceMinor,
          depositTerms:
            a.depositPrincipalMinor != null
              ? {
                  principalMinor: a.depositPrincipalMinor,
                  annualRateBps: a.depositAnnualRateBps!,
                  startDate: new Date(a.depositStartDate!),
                  maturityDate: new Date(a.depositMaturityDate!),
                }
              : undefined,
        },
        asOf,
      );
      valueIdrMinor = toIdrMinor(valueMinor, a.currency, fx);
    }
    return { ...a, balanceMinor, valueMinor, valueIdrMinor };
  });
}

/** Net worth in rupiah — used by the dashboard and the daily snapshot job. */
export async function computeNetWorthIdrMinor(userId: string): Promise<bigint> {
  const accountsWithValues = await getAccountsWithValues(userId);
  return accountsWithValues.reduce((sum, a) => sum + a.valueIdrMinor, 0n);
}

// ---------------------------------------------------------------------------
// Detail & misc reads
// ---------------------------------------------------------------------------

export async function getPortfolios(userId: string) {
  return db
    .select()
    .from(portfolios)
    .where(eq(portfolios.userId, userId))
    .orderBy(portfolios.createdAt);
}

export async function getAccountDetail(userId: string, accountId: string) {
  const [account] = await db
    .select()
    .from(accounts)
    .where(eq(accounts.id, accountId));
  if (!account || account.userId !== userId) return null;

  const fx = await getFxRates();
  const [txns, allHoldings, [{ sum }]] = await Promise.all([
    db
      .select()
      .from(transactions)
      .where(eq(transactions.accountId, accountId))
      .orderBy(desc(transactions.occurredAt))
      .limit(200),
    getHoldings(userId, fx),
    db
      .select({
        sum: sql<string>`coalesce(sum(${transactions.amountMinor}), 0)`,
      })
      .from(transactions)
      .where(eq(transactions.accountId, accountId)),
  ]);

  const balanceMinor = BigInt(sum);
  const holdings = allHoldings.filter((h) => h.accountId === accountId);

  let valueMinor: bigint;
  if (account.valuationMode === "MARKET") {
    const valueIdr =
      toIdrMinor(balanceMinor, account.currency, fx) +
      holdings.reduce((s, h) => s + h.valueIdrMinor, 0n);
    valueMinor = convertMinor(valueIdr, "IDR", account.currency, fx);
  } else {
    valueMinor = accountValueMinor(
      {
        valuationMode: account.valuationMode,
        currency: account.currency,
        balanceMinor,
        depositTerms:
          account.depositPrincipalMinor != null
            ? {
                principalMinor: account.depositPrincipalMinor,
                annualRateBps: account.depositAnnualRateBps!,
                startDate: new Date(account.depositStartDate!),
                maturityDate: new Date(account.depositMaturityDate!),
              }
            : undefined,
      },
      new Date(),
    );
  }

  return { account, txns, balanceMinor, valueMinor, holdings, fx };
}

export async function getNetWorthHistory(userId: string) {
  return db
    .select({
      date: netWorthSnapshots.date,
      totalIdrMinor: netWorthSnapshots.totalIdrMinor,
    })
    .from(netWorthSnapshots)
    .where(eq(netWorthSnapshots.userId, userId))
    .orderBy(asc(netWorthSnapshots.date))
    .limit(730);
}

/** Most recent successful price fetch — "prices as of" on the dashboard. */
export async function getPricesFetchedAt(): Promise<Date | null> {
  const [row] = await db
    .select({ max: sql<string | null>`max(${priceCache.fetchedAt})` })
    .from(priceCache);
  return row?.max ? new Date(row.max) : null;
}
