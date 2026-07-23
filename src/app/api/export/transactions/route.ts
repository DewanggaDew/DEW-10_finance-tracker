import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { toCsv } from "@/core/csv";
import { fromMinor } from "@/core/money";
import { db } from "@/db";
import { accounts, categories, instruments, transactions } from "@/db/schema";

// CSV export (PRD §8): the transaction log is the exportable source of truth.

export async function GET() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const rows = await db
    .select({
      occurredAt: transactions.occurredAt,
      account: accounts.name,
      type: transactions.type,
      amountMinor: transactions.amountMinor,
      currency: transactions.currency,
      category: categories.name,
      note: transactions.note,
      symbol: instruments.symbol,
      quantity: transactions.quantity,
    })
    .from(transactions)
    .innerJoin(accounts, eq(transactions.accountId, accounts.id))
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .leftJoin(instruments, eq(transactions.instrumentId, instruments.id))
    .where(eq(transactions.userId, userId))
    .orderBy(desc(transactions.occurredAt));

  const csv = toCsv(
    ["date", "account", "type", "amount", "currency", "category", "note", "symbol", "quantity"],
    rows.map((r) => [
      r.occurredAt.toISOString(),
      r.account,
      r.type,
      String(fromMinor(r.amountMinor, r.currency)),
      r.currency,
      r.category ?? "",
      r.note ?? "",
      r.symbol ?? "",
      r.quantity !== null ? String(Number(r.quantity)) : "",
    ]),
  );

  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="kanto-transactions.csv"',
    },
  });
}
