import Link from "next/link";
import { formatIDR, formatMoney, toMinor } from "@/core/money";
import { refreshPricesNow } from "@/server/actions";
import {
  getAccountsWithValues,
  getFxRates,
  getHoldings,
  getNetWorthHistory,
  getPricesFetchedAt,
} from "@/server/read";
import { requireUserId } from "@/server/session";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { FreshnessBadge } from "@/components/freshness-badge";
import { NetWorthChart } from "./net-worth-chart";

const TYPE_LABELS: Record<string, string> = {
  CASH: "Cash",
  SAVINGS: "Savings",
  DEPOSIT: "Deposits",
  SECURITIES: "Stocks",
  CRYPTO: "Crypto",
  CUSTOM: "Other",
};

export default async function DashboardPage() {
  const userId = await requireUserId();
  const fx = await getFxRates();
  const [accounts, holdings, history, pricesAt] = await Promise.all([
    getAccountsWithValues(userId),
    getHoldings(userId, fx),
    getNetWorthHistory(userId),
    getPricesFetchedAt(),
  ]);

  const netWorth = accounts.reduce((sum, a) => sum + a.valueIdrMinor, 0n);
  const byType = new Map<string, bigint>();
  for (const a of accounts) {
    byType.set(a.type, (byType.get(a.type) ?? 0n) + a.valueIdrMinor);
  }
  const chartData = history.map((h) => ({
    date: h.date,
    value: Number(h.totalIdrMinor),
  }));

  return (
    <div className="space-y-14">
      {/* Hero */}
      <section>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="label-caps">Net worth</p>
            <p className="mt-3 font-heading text-5xl font-bold tracking-tight tabular-nums md:text-6xl">
              {formatIDR(netWorth)}
            </p>
            <p className="mt-3 text-xs text-muted-foreground">
              USD/IDR {fx.USD.toLocaleString("id-ID")}
              {pricesAt &&
                ` · prices as of ${pricesAt.toLocaleTimeString("en-GB", {
                  hour: "2-digit",
                  minute: "2-digit",
                  timeZone: "Asia/Jakarta",
                })} WIB`}
            </p>
          </div>
          <form action={refreshPricesNow}>
            <Button
              variant="ghost"
              size="sm"
              type="submit"
              className="text-muted-foreground hover:text-foreground"
            >
              ↻ Refresh
            </Button>
          </form>
        </div>
        {chartData.length >= 2 ? (
          <div className="mt-8">
            <NetWorthChart data={chartData} />
          </div>
        ) : (
          <p className="mt-6 border-t border-border/70 pt-4 text-xs text-muted-foreground">
            The net-worth trend appears here once daily snapshots accumulate.
          </p>
        )}
      </section>

      {/* Allocation strip */}
      {byType.size > 0 && (
        <section className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border md:grid-cols-3 lg:grid-cols-6">
          {[...byType.entries()].map(([type, value]) => (
            <div key={type} className="bg-background px-5 py-4">
              <p className="label-caps">{TYPE_LABELS[type] ?? type}</p>
              <p className="mt-2 font-heading text-lg font-bold tabular-nums">
                {formatIDR(value)}
              </p>
            </div>
          ))}
        </section>
      )}

      {/* Holdings */}
      {holdings.length > 0 && (
        <section>
          <p className="label-caps mb-4">Holdings</p>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Symbol</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead className="text-right">Day</TableHead>
                <TableHead className="text-right">Value (IDR)</TableHead>
                <TableHead className="text-right">Unrealized P/L</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {holdings.map((h) => {
                const pl = h.valueIdrMinor - h.costBasisIdrMinor;
                const dayPct =
                  h.price !== null && h.previousClose
                    ? ((h.price - h.previousClose) / h.previousClose) * 100
                    : null;
                return (
                  <TableRow key={h.positionId}>
                    <TableCell>
                      <span className="font-medium">{h.symbol}</span>{" "}
                      <Badge variant="outline" className="ml-1 text-[10px]">
                        {h.market}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {h.quantity.toLocaleString("en-US", {
                        maximumFractionDigits: 8,
                      })}
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
                    <TableCell
                      className={`text-right tabular-nums ${
                        dayPct === null
                          ? "text-muted-foreground"
                          : dayPct < 0
                            ? "text-destructive"
                            : "text-emerald-600 dark:text-emerald-400"
                      }`}
                    >
                      {dayPct === null
                        ? "—"
                        : `${dayPct >= 0 ? "+" : ""}${dayPct.toFixed(2)}%`}
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
        </section>
      )}

      {/* Accounts */}
      <section>
        <p className="label-caps mb-4">Accounts</p>
        {accounts.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No accounts yet.{" "}
            <Link href="/portfolios" className="underline underline-offset-4">
              Create a portfolio and add one.
            </Link>
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Account</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Value</TableHead>
                <TableHead className="text-right">Value (IDR)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {accounts.map((a) => (
                <TableRow key={a.id}>
                  <TableCell>
                    <Link
                      href={`/accounts/${a.id}`}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {a.name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{TYPE_LABELS[a.type]}</Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatMoney(a.valueMinor, a.currency)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatIDR(a.valueIdrMinor)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </div>
  );
}
