// IDX trades Mon–Fri 09:00–16:00 WIB (UTC+7, no DST).

const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

export function isIdxMarketHours(now: Date): boolean {
  const wib = new Date(now.getTime() + WIB_OFFSET_MS);
  const day = wib.getUTCDay();
  if (day === 0 || day === 6) return false;
  const hour = wib.getUTCHours();
  return hour >= 9 && hour < 16;
}

/** Calendar date in WIB as YYYY-MM-DD — used to key daily snapshots. */
export function wibDateString(now: Date): string {
  return new Date(now.getTime() + WIB_OFFSET_MS).toISOString().slice(0, 10);
}
