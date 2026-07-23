import { describe, expect, it } from "vitest";
import { depositMaturityValueMinor, depositValueMinor } from "./deposit";
import { formatIDR, toIdrMinor, toMinor } from "./money";
import { accountValueMinor, netWorthIdrMinor } from "./valuation";

describe("money", () => {
  it("IDR has no minor subdivision", () => {
    expect(toMinor(50_000, "IDR")).toBe(50_000n);
  });

  it("USD uses cents", () => {
    expect(toMinor(10.5, "USD")).toBe(1050n);
  });

  it("converts USD minor to IDR minor via rate", () => {
    // $10.50 at 16,000 IDR/USD = 168,000 rupiah
    expect(toIdrMinor(1050n, "USD", { USD: 16_000 })).toBe(168_000n);
  });

  it("IDR passes through untouched", () => {
    expect(toIdrMinor(5_000n, "IDR", {})).toBe(5_000n);
  });

  it("throws on missing FX rate", () => {
    expect(() => toIdrMinor(100n, "EUR", {})).toThrow("No FX rate for EUR");
  });

  it("formats IDR", () => {
    expect(formatIDR(1_500_000n)).toContain("1.500.000");
  });
});

describe("deposit accrual", () => {
  const terms = {
    principalMinor: 100_000_000n, // Rp 100jt
    annualRateBps: 500, // 5% p.a.
    startDate: new Date("2026-01-01"),
    maturityDate: new Date("2027-01-01"),
  };

  it("accrues nothing before start", () => {
    expect(depositValueMinor(terms, new Date("2025-12-01"))).toBe(100_000_000n);
  });

  it("accrues simple interest actual/365", () => {
    // 73 days = 1/5 of a year → 1% of principal = 1,000,000
    expect(depositValueMinor(terms, new Date("2026-03-15"))).toBe(101_000_000n);
  });

  it("caps accrual at maturity", () => {
    const atMaturity = depositMaturityValueMinor(terms);
    expect(depositValueMinor(terms, new Date("2028-06-01"))).toBe(atMaturity);
    // full year 2026 = 365 days → exactly 5%
    expect(atMaturity).toBe(105_000_000n);
  });
});

describe("valuation & rollup", () => {
  const asOf = new Date("2026-03-15");

  it("MANUAL account is its balance", () => {
    expect(
      accountValueMinor(
        { valuationMode: "MANUAL", currency: "IDR", balanceMinor: 2_500_000n },
        asOf,
      ),
    ).toBe(2_500_000n);
  });

  it("MARKET account is cash + positions at cost", () => {
    expect(
      accountValueMinor(
        {
          valuationMode: "MARKET",
          currency: "USD",
          balanceMinor: 10_000n,
          positionCostBasesMinor: [50_000n, 25_000n],
        },
        asOf,
      ),
    ).toBe(85_000n);
  });

  it("rolls up mixed currencies into IDR", () => {
    const total = netWorthIdrMinor(
      [
        { valuationMode: "MANUAL", currency: "IDR", balanceMinor: 1_000_000n },
        // $100.00 at 16,000 → 1,600,000
        { valuationMode: "MANUAL", currency: "USD", balanceMinor: 10_000n },
        {
          valuationMode: "FORMULA",
          currency: "IDR",
          balanceMinor: 0n,
          depositTerms: {
            principalMinor: 100_000_000n,
            annualRateBps: 500,
            startDate: new Date("2026-01-01"),
            maturityDate: new Date("2027-01-01"),
          },
        },
      ],
      { USD: 16_000 },
      asOf,
    );
    expect(total).toBe(1_000_000n + 1_600_000n + 101_000_000n);
  });
});
