import { FxRates } from "@/core/money";

// Phase 0 stopgap: indicative, manually-maintained rate. Replaced by the live
// FX provider (Yahoo IDR=X, cached server-side) in Phase 1.
export const INDICATIVE_FX: FxRates = {
  USD: 16_300,
};
