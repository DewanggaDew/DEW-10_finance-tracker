export interface Quote {
  price: number;
  currency: string;
  previousClose?: number;
  /** USD leg for crypto (priced primarily in IDR). */
  priceUsd?: number;
  asOf: Date;
  source: string;
}

export const FETCH_TIMEOUT_MS = 10_000;

export const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
