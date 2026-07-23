import { toMinor } from "./money";

// Average-cost method (PRD Q2 default). Quantities are JS numbers (fractional
// for crypto); money stays bigint minor units.

export interface PositionState {
  quantity: number;
  costBasisMinor: bigint;
}

export function applyBuy(
  position: PositionState,
  quantity: number,
  totalCostMinor: bigint,
): PositionState {
  return {
    quantity: position.quantity + quantity,
    costBasisMinor: position.costBasisMinor + totalCostMinor,
  };
}

export interface SellResult {
  position: PositionState;
  /** Proceeds minus the average cost of the sold quantity. */
  realizedPlMinor: bigint;
}

export function applySell(
  position: PositionState,
  quantity: number,
  proceedsMinor: bigint,
): SellResult {
  if (quantity > position.quantity) {
    throw new Error(
      `Cannot sell ${quantity}: only ${position.quantity} held`,
    );
  }
  const costOfSold = BigInt(
    Math.round(Number(position.costBasisMinor) * (quantity / position.quantity)),
  );
  return {
    position: {
      quantity: position.quantity - quantity,
      costBasisMinor: position.costBasisMinor - costOfSold,
    },
    realizedPlMinor: proceedsMinor - costOfSold,
  };
}

/** Market value of a holding: quantity × unit price, in the price's currency. */
export function positionMarketValueMinor(
  quantity: number,
  price: number,
  priceCurrency: string,
): bigint {
  return toMinor(quantity * price, priceCurrency);
}
