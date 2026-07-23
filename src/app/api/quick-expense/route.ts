import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { toMinor } from "@/core/money";
import { db } from "@/db";
import { accounts, categories, transactions } from "@/db/schema";

// JSON endpoint (not a server action) so the offline queue can replay entries
// with plain fetch. clientId makes retries idempotent.

const bodySchema = z.object({
  clientId: z.uuid(),
  accountId: z.uuid(),
  amount: z.number().positive(),
  categoryId: z.uuid().optional(),
  categoryName: z.string().min(1).max(40).optional(),
  note: z.string().max(200).optional(),
  occurredAt: z.iso.datetime().optional(),
});

export async function POST(req: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const input = parsed.data;

  const [account] = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.id, input.accountId), eq(accounts.userId, userId)));
  if (!account) {
    return NextResponse.json({ error: "account not found" }, { status: 404 });
  }

  let categoryId = input.categoryId ?? null;
  if (categoryId) {
    const [cat] = await db
      .select({ id: categories.id })
      .from(categories)
      .where(and(eq(categories.id, categoryId), eq(categories.userId, userId)));
    if (!cat) categoryId = null;
  } else if (input.categoryName) {
    const [existing] = await db
      .select({ id: categories.id })
      .from(categories)
      .where(
        and(
          eq(categories.userId, userId),
          eq(categories.name, input.categoryName),
          eq(categories.kind, "EXPENSE"),
        ),
      );
    if (existing) {
      categoryId = existing.id;
    } else {
      const [created] = await db
        .insert(categories)
        .values({ userId, name: input.categoryName, kind: "EXPENSE" })
        .returning({ id: categories.id });
      categoryId = created.id;
    }
  }

  const inserted = await db
    .insert(transactions)
    .values({
      userId,
      accountId: account.id,
      type: "EXPENSE",
      amountMinor: -toMinor(input.amount, account.currency),
      currency: account.currency,
      categoryId,
      note: input.note,
      clientId: input.clientId,
      occurredAt: input.occurredAt ? new Date(input.occurredAt) : new Date(),
    })
    .onConflictDoNothing({ target: transactions.clientId })
    .returning({ id: transactions.id });

  revalidatePath("/");
  revalidatePath(`/accounts/${account.id}`);
  return NextResponse.json({ ok: true, deduped: inserted.length === 0 });
}
