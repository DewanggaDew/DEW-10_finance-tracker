import { describe, expect, it } from "vitest";
import { parseCoinGeckoPrices } from "./coingecko";
import { parseYahooChart, yahooSymbol } from "./yahoo";

describe("yahoo parser", () => {
  const fixture = {
    chart: {
      result: [
        {
          meta: {
            currency: "IDR",
            symbol: "BBCA.JK",
            regularMarketPrice: 6275,
            chartPreviousClose: 6250,
            regularMarketTime: 1_753_246_800,
          },
        },
      ],
    },
  };

  it("parses price, currency, prev close, asOf", () => {
    const q = parseYahooChart(fixture);
    expect(q.price).toBe(6275);
    expect(q.currency).toBe("IDR");
    expect(q.previousClose).toBe(6250);
    expect(q.asOf).toEqual(new Date(1_753_246_800 * 1000));
    expect(q.source).toBe("yahoo");
  });

  it("throws on malformed response", () => {
    expect(() => parseYahooChart({ chart: { result: [] } })).toThrow();
    expect(() => parseYahooChart({})).toThrow();
  });

  it("maps IDX symbols to .JK", () => {
    expect(yahooSymbol("BBCA", "IDX")).toBe("BBCA.JK");
    expect(yahooSymbol("AAPL", "US")).toBe("AAPL");
  });
});

describe("coingecko parser", () => {
  it("parses IDR + USD legs", () => {
    const quotes = parseCoinGeckoPrices({
      bitcoin: { idr: 1_177_743_321, usd: 72_000, last_updated_at: 1_753_246_800 },
      ethereum: { idr: 60_000_000, usd: 3_700 },
    });
    const btc = quotes.get("bitcoin")!;
    expect(btc.price).toBe(1_177_743_321);
    expect(btc.currency).toBe("IDR");
    expect(btc.priceUsd).toBe(72_000);
    expect(btc.asOf).toEqual(new Date(1_753_246_800 * 1000));
    expect(quotes.get("ethereum")!.price).toBe(60_000_000);
  });

  it("skips entries without an IDR price", () => {
    const quotes = parseCoinGeckoPrices({ unknowncoin: {} });
    expect(quotes.size).toBe(0);
  });
});
