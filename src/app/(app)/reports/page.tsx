import Link from "next/link";
import { wibDateString } from "@/core/market-hours";
import { formatIDR } from "@/core/money";
import { getAccountsWithValues } from "@/server/read";
import { getMonthlyReport } from "@/server/reports";
import { requireUserId } from "@/server/session";

const TYPE_LABELS: Record<string, string> = {
  CASH: "Cash",
  SAVINGS: "Savings",
  DEPOSIT: "Deposits",
  SECURITIES: "Stocks",
  CRYPTO: "Crypto",
  CUSTOM: "Other",
};

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 7);
}

function monthTitle(month: string): string {
  return new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const userId = await requireUserId();
  const currentMonth = wibDateString(new Date()).slice(0, 7);
  const { month: raw } = await searchParams;
  const month = /^\d{4}-\d{2}$/.test(raw ?? "") ? raw! : currentMonth;

  const [report, accounts] = await Promise.all([
    getMonthlyReport(userId, month),
    getAccountsWithValues(userId),
  ]);

  const net = report.incomeIdrMinor - report.expenseIdrMinor;
  const savingsRate =
    report.incomeIdrMinor > 0n
      ? (Number(net) / Number(report.incomeIdrMinor)) * 100
      : null;
  const maxCategory = report.byCategory[0]?.idrMinor ?? 1n;

  const totalIdr = accounts.reduce((s, a) => s + a.valueIdrMinor, 0n);
  const byType = new Map<string, bigint>();
  for (const a of accounts) {
    byType.set(a.type, (byType.get(a.type) ?? 0n) + a.valueIdrMinor);
  }

  return (
    <div className="space-y-14">
      <section>
        <div className="flex items-end justify-between">
          <div>
            <p className="label-caps">Reports</p>
            <h1 className="mt-2 font-heading text-3xl font-bold tracking-tight">
              {monthTitle(month)}
            </h1>
          </div>
          <div className="flex items-center gap-1 text-sm">
            <Link
              href={`/reports?month=${shiftMonth(month, -1)}`}
              className="rounded-md px-2 py-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              ←
            </Link>
            {month !== currentMonth && (
              <Link
                href="/reports"
                className="rounded-md px-2 py-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                today
              </Link>
            )}
            {month < currentMonth && (
              <Link
                href={`/reports?month=${shiftMonth(month, 1)}`}
                className="rounded-md px-2 py-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                →
              </Link>
            )}
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border md:grid-cols-4">
          <div className="bg-background px-5 py-4">
            <p className="label-caps">Income</p>
            <p className="mt-2 font-heading text-lg font-bold tabular-nums">
              {formatIDR(report.incomeIdrMinor)}
            </p>
          </div>
          <div className="bg-background px-5 py-4">
            <p className="label-caps">Spending</p>
            <p className="mt-2 font-heading text-lg font-bold tabular-nums">
              {formatIDR(report.expenseIdrMinor)}
            </p>
          </div>
          <div className="bg-background px-5 py-4">
            <p className="label-caps">Net</p>
            <p
              className={`mt-2 font-heading text-lg font-bold tabular-nums ${
                net < 0n ? "text-destructive" : ""
              }`}
            >
              {net >= 0n ? "+" : ""}
              {formatIDR(net)}
            </p>
          </div>
          <div className="bg-background px-5 py-4">
            <p className="label-caps">Savings rate</p>
            <p className="mt-2 font-heading text-lg font-bold tabular-nums">
              {savingsRate === null ? "—" : `${savingsRate.toFixed(0)}%`}
            </p>
          </div>
        </div>
      </section>

      <section>
        <p className="label-caps mb-4">Spending by category</p>
        {report.byCategory.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No expenses recorded this month.
          </p>
        ) : (
          <div className="space-y-3">
            {report.byCategory.map((c) => (
              <div key={c.name}>
                <div className="flex items-baseline justify-between text-sm">
                  <span>{c.name}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {formatIDR(c.idrMinor)}
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-secondary">
                  <div
                    className="h-full rounded-full bg-[var(--chart-1)]"
                    style={{
                      width: `${Math.max(2, (Number(c.idrMinor) / Number(maxCategory)) * 100)}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <p className="label-caps mb-4">Allocation</p>
        {totalIdr <= 0n ? (
          <p className="text-sm text-muted-foreground">No assets yet.</p>
        ) : (
          <div className="space-y-2">
            {[...byType.entries()]
              .sort((a, b) => (b[1] > a[1] ? 1 : -1))
              .map(([type, value]) => (
                <div
                  key={type}
                  className="flex items-baseline justify-between border-b border-border/60 pb-2 text-sm"
                >
                  <span>{TYPE_LABELS[type] ?? type}</span>
                  <span className="tabular-nums">
                    <span className="mr-3 text-muted-foreground">
                      {((Number(value) / Number(totalIdr)) * 100).toFixed(1)}%
                    </span>
                    {formatIDR(value)}
                  </span>
                </div>
              ))}
          </div>
        )}
      </section>

      <section>
        <p className="label-caps mb-4">Export</p>
        <a
          href="/api/export/transactions"
          download
          className="inline-flex h-8 items-center rounded-md border border-input bg-transparent px-3 text-sm shadow-xs transition-colors hover:bg-secondary"
        >
          Download transactions (CSV)
        </a>
      </section>
    </div>
  );
}
