"use client";

import { useState } from "react";
import { createAccount } from "@/server/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const selectClass =
  "border-input h-9 w-full rounded-md border bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring";

const ACCOUNT_TYPES = [
  ["CASH", "Cash / e-wallet"],
  ["SAVINGS", "Savings"],
  ["DEPOSIT", "Time deposit (deposito)"],
  ["SECURITIES", "Brokerage (stocks)"],
  ["CRYPTO", "Crypto"],
  ["CUSTOM", "Custom"],
] as const;

export function AccountForm({
  portfolios,
}: {
  portfolios: { id: string; name: string }[];
}) {
  const [type, setType] = useState<string>("CASH");
  const isDeposit = type === "DEPOSIT";

  return (
    <form action={createAccount} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="portfolioId">Portfolio</Label>
          <select id="portfolioId" name="portfolioId" className={selectClass} required>
            {portfolios.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="name">Name</Label>
          <Input id="name" name="name" placeholder="BCA main" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="type">Type</Label>
          <select
            id="type"
            name="type"
            className={selectClass}
            value={type}
            onChange={(e) => setType(e.target.value)}
          >
            {ACCOUNT_TYPES.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="currency">Currency</Label>
          <select id="currency" name="currency" className={selectClass}>
            <option value="IDR">IDR</option>
            <option value="USD">USD</option>
          </select>
        </div>
        {!isDeposit && (
          <div className="space-y-2">
            <Label htmlFor="openingBalance">Opening balance (optional)</Label>
            <Input
              id="openingBalance"
              name="openingBalance"
              type="number"
              step="any"
              min="0"
              placeholder="0"
            />
          </div>
        )}
      </div>

      {isDeposit && (
        <div className="grid grid-cols-2 gap-4 rounded-md border p-4">
          <div className="space-y-2">
            <Label htmlFor="depositPrincipal">Principal</Label>
            <Input
              id="depositPrincipal"
              name="depositPrincipal"
              type="number"
              step="any"
              min="0"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="depositRatePct">Rate (% p.a.)</Label>
            <Input
              id="depositRatePct"
              name="depositRatePct"
              type="number"
              step="0.01"
              min="0"
              placeholder="5.50"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="depositStart">Start date</Label>
            <Input id="depositStart" name="depositStart" type="date" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="depositMaturity">Maturity date</Label>
            <Input
              id="depositMaturity"
              name="depositMaturity"
              type="date"
              required
            />
          </div>
        </div>
      )}

      <Button type="submit">Add account</Button>
    </form>
  );
}
