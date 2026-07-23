// Deposito accrual: simple interest, actual/365, gross of the 20% Indonesian
// withholding tax (PRD Q3 default — show gross, note tax in the UI).

export interface DepositTerms {
  principalMinor: bigint;
  annualRateBps: number; // 550 = 5.50% p.a.
  startDate: Date;
  maturityDate: Date;
}

const MS_PER_DAY = 86_400_000;

/** Value of the deposit at `asOf`: principal + interest accrued so far.
 *  Accrual is clamped to [startDate, maturityDate]. */
export function depositValueMinor(terms: DepositTerms, asOf: Date): bigint {
  const start = terms.startDate.getTime();
  const end = Math.min(asOf.getTime(), terms.maturityDate.getTime());
  const days = Math.max(0, Math.floor((end - start) / MS_PER_DAY));
  const interest =
    (Number(terms.principalMinor) * (terms.annualRateBps / 10_000) * days) / 365;
  return terms.principalMinor + BigInt(Math.round(interest));
}

/** Total payout at maturity (principal + full-tenor interest), gross. */
export function depositMaturityValueMinor(terms: DepositTerms): bigint {
  return depositValueMinor(terms, terms.maturityDate);
}
