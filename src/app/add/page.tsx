import { and, eq, gt, sql } from "drizzle-orm";
import Link from "next/link";
import { parseCapture } from "@/core/capture";
import { db } from "@/db";
import { accounts, categories, transactions } from "@/db/schema";
import { requireUserId } from "@/server/session";
import { QuickAddSheet } from "./quick-add-sheet";

export default async function AddPage({
  searchParams,
}: {
  searchParams: Promise<{ text?: string; title?: string }>;
}) {
  const userId = await requireUserId();
  const { text, title } = await searchParams;

  const [spendable, cats] = await Promise.all([
    db
      .select({
        id: accounts.id,
        name: accounts.name,
        currency: accounts.currency,
      })
      .from(accounts)
      .where(
        and(eq(accounts.userId, userId), eq(accounts.valuationMode, "MANUAL")),
      )
      .orderBy(accounts.createdAt),
    db
      .select({
        id: categories.id,
        name: categories.name,
        uses: sql<number>`count(${transactions.id})::int`,
      })
      .from(categories)
      .leftJoin(
        transactions,
        and(
          eq(transactions.categoryId, categories.id),
          gt(transactions.occurredAt, sql`now() - interval '90 days'`),
        ),
      )
      .where(
        and(eq(categories.userId, userId), eq(categories.kind, "EXPENSE")),
      )
      .groupBy(categories.id)
      .orderBy(sql`count(${transactions.id}) desc`, categories.name),
  ]);

  // PWA share target: "50k kopi" shared into the app prefills the sheet
  const prefill = parseCapture(text ?? title ?? "") ?? undefined;

  if (spendable.length === 0) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="font-heading text-2xl font-bold">No spendable account yet</p>
        <p className="text-sm text-muted-foreground">
          Create a cash or savings account first.
        </p>
        <Link href="/portfolios" className="text-sm underline underline-offset-4">
          Go to portfolios
        </Link>
      </main>
    );
  }

  return (
    <QuickAddSheet accounts={spendable} categories={cats} prefill={prefill} />
  );
}
