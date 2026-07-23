import {
  refreshAll,
  refreshCryptoPrices,
  refreshEquityPrices,
  refreshFxRates,
  snapshotExistsForToday,
  writeDailySnapshots,
} from "./refresh";

// In-process scheduler (Architecture §2 Option A) — started once from
// instrumentation.ts when the Node server boots. Cadences per PRD §6.2.

const MINUTE = 60_000;

declare global {
  var __kantoScheduler: boolean | undefined;
}

function safe(name: string, fn: () => Promise<unknown>) {
  return () =>
    fn().catch((e) => console.error(`[scheduler] ${name} failed:`, e));
}

async function maybeSnapshot() {
  // Post-close: after 16:30 WIB (09:30 UTC), once per WIB day.
  const utcHour = new Date().getUTCHours() + new Date().getUTCMinutes() / 60;
  const wibHour = (utcHour + 7) % 24;
  if (wibHour >= 16.5 && !(await snapshotExistsForToday())) {
    const n = await writeDailySnapshots();
    console.log(`[scheduler] wrote ${n} net-worth snapshot(s)`);
  }
}

export function startScheduler() {
  if (globalThis.__kantoScheduler) return;
  globalThis.__kantoScheduler = true;

  setInterval(safe("crypto", refreshCryptoPrices), 5 * MINUTE);
  setInterval(safe("equities", refreshEquityPrices), 15 * MINUTE);
  setInterval(safe("fx", refreshFxRates), 60 * MINUTE);
  setInterval(safe("snapshot", maybeSnapshot), 10 * MINUTE);

  // Warm the cache on boot.
  setTimeout(safe("initial refresh", refreshAll), 5_000);
  console.log("[scheduler] started (crypto 5m, equities 15m, fx 60m)");
}
