import { eq, sql } from "drizzle-orm";
import { isIdxMarketHours, wibDateString } from "@/core/market-hours";
import { getCoinGeckoQuotes } from "@/data/providers/coingecko";
import { Quote } from "@/data/providers/types";
import { getUsdIdrRate, getYahooQuote } from "@/data/providers/yahoo";
import { db } from "@/db";
import {
  fxRates,
  instruments,
  netWorthSnapshots,
  positions,
  priceCache,
  users,
} from "@/db/schema";
import { computeNetWorthIdrMinor } from "@/server/read";

// Design stance (PRD §6): providers are unreliable dependencies. Every fetch
// failure is swallowed after logging — the cache keeps its last value and the
// UI degrades to EOD/STALE badges. Nothing here ever throws into a request.

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function upsertQuote(instrumentId: string, quote: Quote) {
  const values = {
    instrumentId,
    price: String(quote.price),
    currency: quote.currency,
    previousClose:
      quote.previousClose !== undefined ? String(quote.previousClose) : null,
    priceUsd: quote.priceUsd !== undefined ? String(quote.priceUsd) : null,
    asOf: quote.asOf,
    source: quote.source,
    fetchedAt: new Date(),
  };
  await db
    .insert(priceCache)
    .values(values)
    .onConflictDoUpdate({ target: priceCache.instrumentId, set: values });
}

/** Distinct instruments actually held by any user (never the whole market). */
async function heldInstruments(kind: "equity" | "crypto") {
  return db
    .selectDistinct({
      id: instruments.id,
      symbol: instruments.symbol,
      market: instruments.market,
    })
    .from(positions)
    .innerJoin(instruments, eq(positions.instrumentId, instruments.id))
    .where(sql`${instruments.kind} = ${kind} and ${positions.quantity} > 0`);
}

export async function refreshEquityPrices(): Promise<{ ok: number; failed: number }> {
  const held = await heldInstruments("equity");
  const idxOpen = isIdxMarketHours(new Date());
  let ok = 0;
  let failed = 0;
  for (const inst of held) {
    // Outside JKT market hours the cached IDX close is already correct.
    if (inst.market === "IDX" && !idxOpen) continue;
    try {
      await upsertQuote(inst.id, await getYahooQuote(inst.symbol, inst.market));
      ok++;
    } catch (e) {
      failed++;
      console.error(`[prices] yahoo ${inst.symbol} failed:`, e);
    }
    await delay(300); // be polite to the free source
  }
  return { ok, failed };
}

export async function refreshCryptoPrices(): Promise<{ ok: number; failed: number }> {
  const held = await heldInstruments("crypto");
  if (held.length === 0) return { ok: 0, failed: 0 };
  try {
    const quotes = await getCoinGeckoQuotes(held.map((h) => h.symbol));
    let ok = 0;
    for (const inst of held) {
      const quote = quotes.get(inst.symbol);
      if (quote) {
        await upsertQuote(inst.id, quote);
        ok++;
      }
    }
    return { ok, failed: held.length - ok };
  } catch (e) {
    console.error("[prices] coingecko batch failed:", e);
    return { ok: 0, failed: held.length };
  }
}

export async function refreshFxRates(): Promise<boolean> {
  try {
    const quote = await getUsdIdrRate();
    const values = {
      currency: "USD",
      rateIdr: String(quote.price),
      asOf: quote.asOf,
      source: quote.source,
    };
    await db
      .insert(fxRates)
      .values(values)
      .onConflictDoUpdate({ target: fxRates.currency, set: values });
    return true;
  } catch (e) {
    console.error("[prices] FX refresh failed:", e);
    return false;
  }
}

export async function refreshAll() {
  const fx = await refreshFxRates();
  const crypto = await refreshCryptoPrices();
  const equities = await refreshEquityPrices();
  return { fx, crypto, equities };
}

/** One net-worth snapshot per user per WIB day. Idempotent. */
export async function writeDailySnapshots(): Promise<number> {
  const today = wibDateString(new Date());
  const allUsers = await db.select({ id: users.id }).from(users);
  let written = 0;
  for (const user of allUsers) {
    try {
      const totalIdrMinor = await computeNetWorthIdrMinor(user.id);
      await db
        .insert(netWorthSnapshots)
        .values({ userId: user.id, date: today, totalIdrMinor })
        .onConflictDoUpdate({
          target: [netWorthSnapshots.userId, netWorthSnapshots.date],
          set: { totalIdrMinor },
        });
      written++;
    } catch (e) {
      console.error(`[snapshot] user ${user.id} failed:`, e);
    }
  }
  return written;
}

export async function snapshotExistsForToday(): Promise<boolean> {
  const today = wibDateString(new Date());
  const [row] = await db
    .select({ id: netWorthSnapshots.id })
    .from(netWorthSnapshots)
    .where(eq(netWorthSnapshots.date, today))
    .limit(1);
  return row !== undefined;
}
