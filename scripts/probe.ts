// Canary for free-source breakage (Architecture §8): verifies each provider
// still fetches and parses. Usage: npx tsx scripts/probe.ts
import { getCoinGeckoQuotes } from "../src/data/providers/coingecko";
import { getUsdIdrRate, getYahooQuote } from "../src/data/providers/yahoo";

async function main() {
  const idx = await getYahooQuote("BBCA", "IDX");
  console.log(`IDX  BBCA.JK  ${idx.price} ${idx.currency}  asOf ${idx.asOf.toISOString()}`);

  const us = await getYahooQuote("AAPL", "US");
  console.log(`US   AAPL     ${us.price} ${us.currency}  asOf ${us.asOf.toISOString()}`);

  const fx = await getUsdIdrRate();
  console.log(`FX   USD/IDR  ${fx.price}  asOf ${fx.asOf.toISOString()}`);

  const crypto = await getCoinGeckoQuotes(["bitcoin"]);
  const btc = crypto.get("bitcoin");
  console.log(`CG   bitcoin  ${btc?.price} IDR / ${btc?.priceUsd} USD  asOf ${btc?.asOf.toISOString()}`);
}

main().catch((e) => {
  console.error("PROBE FAILED:", e);
  process.exit(1);
});
