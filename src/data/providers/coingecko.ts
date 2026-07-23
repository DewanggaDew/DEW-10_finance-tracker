import { FETCH_TIMEOUT_MS, Quote } from "./types";

// CoinGecko free tier — prices directly in IDR (no FX hop), ~30 calls/min,
// so quotes are always fetched in one batched call.

type SimplePriceResponse = Record<
  string,
  { idr?: number; usd?: number; last_updated_at?: number }
>;

export function parseCoinGeckoPrices(
  json: SimplePriceResponse,
): Map<string, Quote> {
  const quotes = new Map<string, Quote>();
  for (const [id, data] of Object.entries(json)) {
    if (typeof data?.idr !== "number") continue;
    quotes.set(id, {
      price: data.idr,
      currency: "IDR",
      priceUsd: data.usd,
      asOf: data.last_updated_at
        ? new Date(data.last_updated_at * 1000)
        : new Date(),
      source: "coingecko",
    });
  }
  return quotes;
}

/** Batched quote fetch by CoinGecko ids (e.g. "bitcoin", "ethereum"). */
export async function getCoinGeckoQuotes(
  ids: string[],
): Promise<Map<string, Quote>> {
  if (ids.length === 0) return new Map();
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(
    ids.join(","),
  )}&vs_currencies=idr,usd&include_last_updated_at=true`;
  const res = await fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`CoinGecko: HTTP ${res.status}`);
  return parseCoinGeckoPrices(await res.json());
}
