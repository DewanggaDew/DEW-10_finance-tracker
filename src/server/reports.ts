import { and, eq, inArray, sql } from "drizzle-orm";
import { toIdrMinor } from "@/core/money";
import { db } from "@/db";
import { categories, transactions } from "@/db/schema";
import { getFxRates } from "./read";

export interface MonthlyReport {
  /** YYYY-MM (WIB calendar). */
  month: string;
  incomeIdrMinor: bigint;
  expenseIdrMinor: bigint;
  byCategory: { name: string; idrMinor: bigint }[];
}

export async function getMonthlyReport(
  userId: string,
  month: string,
): Promise<MonthlyReport> {
  const fx = await getFxRates();
  const rows = await db
    .select({
      type: transactions.type,
      amountMinor: transactions.amountMinor,
      currency: transactions.currency,
      categoryName: categories.name,
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(
      and(
        eq(transactions.userId, userId),
        inArray(transactions.type, ["EXPENSE", "INCOME"]),
        sql`to_char(${transactions.occurredAt} at time zone 'Asia/Jakarta', 'YYYY-MM') = ${month}`,
      ),
    );

  let incomeIdrMinor = 0n;
  let expenseIdrMinor = 0n;
  const byCategory = new Map<string, bigint>();
  for (const r of rows) {
    const idr = toIdrMinor(r.amountMinor, r.currency, fx);
    if (r.type === "INCOME") {
      incomeIdrMinor += idr;
    } else {
      const magnitude = -idr; // expenses are stored negative
      expenseIdrMinor += magnitude;
      const name = r.categoryName ?? "Uncategorized";
      byCategory.set(name, (byCategory.get(name) ?? 0n) + magnitude);
    }
  }

  return {
    month,
    incomeIdrMinor,
    expenseIdrMinor,
    byCategory: [...byCategory.entries()]
      .map(([name, idrMinor]) => ({ name, idrMinor }))
      .sort((a, b) => (b.idrMinor > a.idrMinor ? 1 : -1)),
  };
}
