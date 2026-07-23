import { describe, expect, it } from "vitest";
import { classifyFreshness } from "./freshness";
import { isIdxMarketHours, wibDateString } from "./market-hours";
import {
  applyBuy,
  applySell,
  positionMarketValueMinor,
} from "./positions";

describe("freshness", () => {
  const now = new Date("2026-07-23T12:00:00Z");
  it("fresh price is LIVE~", () => {
    expect(classifyFreshness(new Date("2026-07-23T11:45:00Z"), now)).toBe("LIVE~");
  });
  it("hours-old price is EOD", () => {
    expect(classifyFreshness(new Date("2026-07-23T04:00:00Z"), now)).toBe("EOD");
  });
  it(">24h price is STALE", () => {
    expect(classifyFreshness(new Date("2026-07-21T12:00:00Z"), now)).toBe("STALE");
  });
});

describe("average-cost positions", () => {
  it("accumulates cost basis on buys", () => {
    let pos = { quantity: 0, costBasisMinor: 0n };
    pos = applyBuy(pos, 100, 620_000n); // 1 lot BBCA @ 6200
    pos = applyBuy(pos, 100, 640_000n); // 1 lot @ 6400
    expect(pos.quantity).toBe(200);
    expect(pos.costBasisMinor).toBe(1_260_000n); // avg 6300
  });

  it("sells at average cost and reports realized P/L", () => {
    const pos = { quantity: 200, costBasisMinor: 1_260_000n };
    // sell 100 shares for 660,000 (6600/share, avg cost 6300)
    const { position, realizedPlMinor } = applySell(pos, 100, 660_000n);
    expect(position.quantity).toBe(100);
    expect(position.costBasisMinor).toBe(630_000n);
    expect(realizedPlMinor).toBe(30_000n);
  });

  it("rejects overselling", () => {
    expect(() =>
      applySell({ quantity: 1, costBasisMinor: 100n }, 2, 300n),
    ).toThrow();
  });

  it("handles fractional crypto quantities", () => {
    const value = positionMarketValueMinor(0.5, 1_177_743_321, "IDR");
    expect(value).toBe(588_871_661n); // rounded

    let pos = { quantity: 0, costBasisMinor: 0n };
    pos = applyBuy(pos, 0.25, 300_000_000n);
    const { realizedPlMinor } = applySell(pos, 0.1, 130_000_000n);
    expect(realizedPlMinor).toBe(10_000_000n); // cost of 0.1 = 120,000,000
  });
});

describe("IDX market hours (WIB)", () => {
  it("open Wednesday 10:00 WIB (03:00 UTC)", () => {
    expect(isIdxMarketHours(new Date("2026-07-22T03:00:00Z"))).toBe(true);
  });
  it("closed Wednesday 17:00 WIB", () => {
    expect(isIdxMarketHours(new Date("2026-07-22T10:00:00Z"))).toBe(false);
  });
  it("closed Sunday", () => {
    expect(isIdxMarketHours(new Date("2026-07-19T03:00:00Z"))).toBe(false);
  });
  it("WIB date rolls over at 17:00 UTC", () => {
    expect(wibDateString(new Date("2026-07-22T16:59:00Z"))).toBe("2026-07-22");
    expect(wibDateString(new Date("2026-07-22T17:01:00Z"))).toBe("2026-07-23");
  });
});
