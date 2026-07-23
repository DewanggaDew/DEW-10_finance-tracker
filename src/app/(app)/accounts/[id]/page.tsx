import { notFound } from "next/navigation";
import { depositMaturityValueMinor } from "@/core/deposit";
import { formatIDR, formatMoney, toMinor } from "@/core/money";
import { addTransaction, recordTrade, setBalance } from "@/server/actions";
import { FreshnessBadge } from "@/components/freshness-badge";
import { getAccountDetail } from "@/server/read";
import { requireUserId } from "@/server/session";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const selectClass =
  "border-input h-9 w-full rounded-md border bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring";

const TXN_TYPES = [
  ["EXPENSE", "Expense"],
  ["INCOME", "Income"],
  ["DEPOSIT", "Deposit in"],
  ["WITHDRAW", "Withdraw"],
  ["INTEREST", "Interest"],
  ["FEE", "Fee"],
] as const;

export default async function AccountPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const userId = await requireUserId();
  const { id } = await params;
  const detail = await getAccountDetail(userId, id);
  if (!detail) notFound();
  const { account, txns, valueMinor, holdings } = detail;
  const isMarket = account.valuationMode === "MARKET";

  const depositTerms =
    account.depositPrincipalMinor != null
      ? {
          principalMinor: account.depositPrincipalMinor,
          annualRateBps: account.depositAnnualRateBps!,
          startDate: new Date(account.depositStartDate!),
          maturityDate: new Date(account.depositMaturityDate!),
        }
      : null;

  return (
    <div className="space-y-10">
      <section>
        <p className="label-caps">
          {account.type} · {account.currency}
        </p>
        <h1 className="mt-2 font-heading text-3xl font-bold tracking-tight">
          {account.name}
        </h1>
        <p className="mt-4 font-heading text-4xl font-bold tracking-tight tabular-nums">
          {formatMoney(valueMinor, account.currency)}
        </p>
        {depositTerms && (
          <div className="mt-5 grid grid-cols-2 gap-x-8 gap-y-1 border-t border-border/70 pt-4 text-sm text-muted-foreground md:grid-cols-4">
            <span>
              Principal:{" "}
              {formatMoney(depositTerms.principalMinor, account.currency)}
            </span>
            <span>Rate: {(depositTerms.annualRateBps / 100).toFixed(2)}% p.a.</span>
            <span>Matures: {account.depositMaturityDate}</span>
            <span>
              Payout at maturity:{" "}
              {formatMoney(depositMaturityValueMinor(depositTerms), account.currency)}{" "}
              (gross, before 20% tax)
            </span>
          </div>
        )}
      </section>

      {isMarket && (
        <Card>
          <CardHeader>
            <CardTitle>Positions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {holdings.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No positions yet — record a first buy below.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Symbol</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Avg cost</TableHead>
                    <TableHead className="text-right">Price</TableHead>
                    <TableHead className="text-right">Value (IDR)</TableHead>
                    <TableHead className="text-right">Unrealized P/L</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {holdings.map((h) => {
                    const pl = h.valueIdrMinor - h.costBasisIdrMinor;
                    const avgCost = BigInt(
                      Math.round(Number(h.costBasisMinor) / h.quantity),
                    );
                    return (
                      <TableRow key={h.positionId}>
                        <TableCell className="font-medium">{h.symbol}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {h.quantity.toLocaleString("en-US", {
                            maximumFractionDigits: 8,
                          })}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatMoney(avgCost, h.currency)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {h.price !== null && h.priceCurrency ? (
                            <span className="inline-flex items-center gap-1.5">
                              <FreshnessBadge freshness={h.freshness} />
                              {formatMoney(
                                toMinor(h.price, h.priceCurrency),
                                h.priceCurrency,
                              )}
                            </span>
                          ) : (
                            <FreshnessBadge freshness="STALE" />
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatIDR(h.valueIdrMinor)}
                        </TableCell>
                        <TableCell
                          className={`text-right tabular-nums ${
                            pl < 0n
                              ? "text-destructive"
                              : "text-emerald-600 dark:text-emerald-400"
                          }`}
                        >
                          {pl >= 0n ? "+" : ""}
                          {formatIDR(pl)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}

            <form
              action={recordTrade}
              className="grid grid-cols-2 gap-4 border-t pt-4 md:grid-cols-6"
            >
              <input type="hidden" name="accountId" value={account.id} />
              <div className="space-y-2">
                <Label htmlFor="side">Side</Label>
                <select id="side" name="side" className={selectClass}>
                  <option value="BUY">Buy</option>
                  <option value="SELL">Sell</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="market">Market</Label>
                <select
                  id="market"
                  name="market"
                  className={selectClass}
                  defaultValue={account.type === "CRYPTO" ? "crypto" : "IDX"}
                >
                  <option value="IDX">IDX</option>
                  <option value="US">US</option>
                  <option value="crypto">Crypto</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="symbol">Symbol / id</Label>
                <Input
                  id="symbol"
                  name="symbol"
                  placeholder="BBCA · AAPL · bitcoin"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="quantity">Quantity</Label>
                <Input
                  id="quantity"
                  name="quantity"
                  type="number"
                  step="any"
                  min="0"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="total">Total ({account.currency})</Label>
                <Input
                  id="total"
                  name="total"
                  type="number"
                  step="any"
                  min="0"
                  required
                />
              </div>
              <div className="flex items-end">
                <Button type="submit" className="w-full">
                  Record
                </Button>
              </div>
            </form>
            <p className="text-xs text-muted-foreground">
              New symbols are validated against Yahoo Finance / CoinGecko. IDX
              quantities are shares (1 lot = 100).
            </p>
          </CardContent>
        </Card>
      )}

      {account.valuationMode !== "FORMULA" && (
        <Card>
          <CardHeader>
            <CardTitle>Add transaction</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <form action={addTransaction} className="grid grid-cols-2 gap-4 md:grid-cols-5">
              <input type="hidden" name="accountId" value={account.id} />
              <div className="space-y-2">
                <Label htmlFor="type">Type</Label>
                <select id="type" name="type" className={selectClass}>
                  {TXN_TYPES.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="amount">Amount ({account.currency})</Label>
                <Input id="amount" name="amount" type="number" step="any" min="0" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="occurredAt">Date</Label>
                <Input id="occurredAt" name="occurredAt" type="datetime-local" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="note">Note</Label>
                <Input id="note" name="note" placeholder="optional" />
              </div>
              <div className="flex items-end">
                <Button type="submit" className="w-full">
                  Add
                </Button>
              </div>
            </form>

            {account.valuationMode === "MANUAL" && (
              <form action={setBalance} className="flex items-end gap-2">
                <input type="hidden" name="accountId" value={account.id} />
                <div className="space-y-2">
                  <Label htmlFor="balance">
                    Set balance directly ({account.currency})
                  </Label>
                  <Input id="balance" name="balance" type="number" step="any" required />
                </div>
                <Button variant="outline" type="submit">
                  Set balance
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Transactions</CardTitle>
        </CardHeader>
        <CardContent>
          {txns.length === 0 ? (
            <p className="text-sm text-muted-foreground">No transactions yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Note</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {txns.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="whitespace-nowrap">
                      {t.occurredAt.toISOString().slice(0, 10)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{t.type}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {t.note}
                    </TableCell>
                    <TableCell
                      className={`text-right tabular-nums ${
                        t.amountMinor < 0n ? "text-destructive" : ""
                      }`}
                    >
                      {formatMoney(t.amountMinor, t.currency)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
