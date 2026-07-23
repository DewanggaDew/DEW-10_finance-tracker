// Freshness contract surfaced on every price (PRD §6.2):
//   LIVE~ — fresh (delayed ~15–20 min is expected for free sources)
//   EOD   — holding the last close
//   STALE — older than 24h or the source is failing

export type Freshness = "LIVE~" | "EOD" | "STALE";

const LIVE_MAX_MS = 30 * 60 * 1000;
const EOD_MAX_MS = 24 * 60 * 60 * 1000;

export function classifyFreshness(asOf: Date, now: Date): Freshness {
  const age = now.getTime() - asOf.getTime();
  if (age <= LIVE_MAX_MS) return "LIVE~";
  if (age <= EOD_MAX_MS) return "EOD";
  return "STALE";
}
