import { DepositTerms, depositValueMinor } from "./deposit";
import { FxRates, toIdrMinor } from "./money";

// Phase 0 valuation:
//   MANUAL  → account value = sum of transaction amounts (the balance).
//   FORMULA → deposit accrual from the account's deposit terms.
//   MARKET  → cash balance + positions at cost basis. (Live pricing is Phase 1;
//             until then cost basis is the honest stand-in.)

export interface AccountValuationInput {
  valuationMode: "MANUAL" | "FORMULA" | "MARKET";
  currency: string;
  /** Sum of transactions.amountMinor for this account. */
  balanceMinor: bigint;
  /** FORMULA accounts only. */
  depositTerms?: DepositTerms;
  /** MARKET accounts only: cost bases of held positions, in account currency. */
  positionCostBasesMinor?: bigint[];
}

/** Account value in its native currency, minor units. */
export function accountValueMinor(
  input: AccountValuationInput,
  asOf: Date,
): bigint {
  switch (input.valuationMode) {
    case "MANUAL":
      return input.balanceMinor;
    case "FORMULA": {
      if (!input.depositTerms) {
        throw new Error("FORMULA account is missing deposit terms");
      }
      return depositValueMinor(input.depositTerms, asOf);
    }
    case "MARKET": {
      const positions = (input.positionCostBasesMinor ?? []).reduce(
        (sum, c) => sum + c,
        0n,
      );
      return input.balanceMinor + positions;
    }
  }
}

/** Total net worth in IDR minor units (= rupiah) across accounts. */
export function netWorthIdrMinor(
  accounts: AccountValuationInput[],
  fx: FxRates,
  asOf: Date,
): bigint {
  return accounts.reduce(
    (sum, a) => sum + toIdrMinor(accountValueMinor(a, asOf), a.currency, fx),
    0n,
  );
}
