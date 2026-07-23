// Money is stored as bigint "minor units" plus an ISO currency code.
// Exponents are fixed here, not ISO-4217's: IDR uses 0 (whole rupiah — sen are
// unused in practice), everything else defaults to 2.

const CURRENCY_EXPONENT: Record<string, number> = {
  IDR: 0,
  USD: 2,
};

export function currencyExponent(currency: string): number {
  return CURRENCY_EXPONENT[currency] ?? 2;
}

export function toMinor(amount: number, currency: string): bigint {
  return BigInt(Math.round(amount * 10 ** currencyExponent(currency)));
}

export function fromMinor(minor: bigint, currency: string): number {
  return Number(minor) / 10 ** currencyExponent(currency);
}

/** IDR per 1 unit of major currency, e.g. { USD: 16350 }. IDR itself is implicit. */
export type FxRates = Record<string, number>;

/** Convert an amount in any supported currency to IDR minor units (= rupiah). */
export function toIdrMinor(
  minor: bigint,
  currency: string,
  fx: FxRates,
): bigint {
  if (currency === "IDR") return minor;
  const rate = fx[currency];
  if (rate === undefined) {
    throw new Error(`No FX rate for ${currency}`);
  }
  return BigInt(Math.round(fromMinor(minor, currency) * rate));
}

/** Convert between currencies via the IDR rates (IDR is the hub). */
export function convertMinor(
  minor: bigint,
  from: string,
  to: string,
  fx: FxRates,
): bigint {
  if (from === to) return minor;
  const idr = toIdrMinor(minor, from, fx);
  if (to === "IDR") return idr;
  const rate = fx[to];
  if (rate === undefined) {
    throw new Error(`No FX rate for ${to}`);
  }
  return toMinor(Number(idr) / rate, to);
}

export function formatIDR(minor: bigint): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Number(minor));
}

export function formatMoney(minor: bigint, currency: string): string {
  const exp = currencyExponent(currency);
  return new Intl.NumberFormat(currency === "IDR" ? "id-ID" : "en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: exp,
    maximumFractionDigits: exp,
  }).format(fromMinor(minor, currency));
}
