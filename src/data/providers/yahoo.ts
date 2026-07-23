import { BROWSER_UA, FETCH_TIMEOUT_MS, Quote } from "./types";

// Yahoo Finance chart API — unofficial, validated 2026-07-23 (PRD Appendix A).
// Covers IDX equities (SYMBOL.JK), US equities, and FX (IDR=X).

export function yahooSymbol(symbol: string, market: string): string {
  return market === "IDX" ? `${symbol}.JK` : symbol;
}

/** Parse the chart response. Exported separately so it can be unit-tested
 *  against fixtures without network access. */
export function parseYahooChart(json: unknown): Quote {
  const result = (
    json as {
      chart?: { result?: Array<{ meta?: Record<string, unknown> }> };
    }
  )?.chart?.result?.[0];
  const meta = result?.meta;
  const price = meta?.regularMarketPrice;
  const currency = meta?.currency;
  const time = meta?.regularMarketTime;
  if (typeof price !== "number" || typeof currency !== "string") {
    throw new Error("Yahoo chart response missing price data");
  }
  const previousClose =
    typeof meta?.chartPreviousClose === "number"
      ? meta.chartPreviousClose
      : undefined;
  return {
    price,
    currency,
    previousClose,
    asOf: typeof time === "number" ? new Date(time * 1000) : new Date(),
    source: "yahoo",
  };
}

export async function getYahooQuote(
  symbol: string,
  market: string,
): Promise<Quote> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    yahooSymbol(symbol, market),
  )}?interval=1d&range=1d`;
  const res = await fetch(url, {
    headers: { "user-agent": BROWSER_UA },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Yahoo ${symbol}: HTTP ${res.status}`);
  return parseYahooChart(await res.json());
}

/** USD/IDR mid-market rate via Yahoo's IDR=X. */
export async function getUsdIdrRate(): Promise<Quote> {
  return getYahooQuote("IDR=X", "FX");
}
