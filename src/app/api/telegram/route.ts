import { and, desc, eq, isNotNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { parseCapture } from "@/core/capture";
import { formatMoney, toMinor } from "@/core/money";
import { db } from "@/db";
import { accounts, categories, transactions, users } from "@/db/schema";
import { sendTelegramMessage } from "@/integrations/telegram";

// Telegram webhook (PRD §7 path 3): "50k kopi" → parsed, categorized, logged
// against the linked user's most recent spending account, then confirmed.
// Linking: generate a code in /settings, send `/link CODE` to the bot.

const ok = () => NextResponse.json({ ok: true });

/** Category name token match first, then most-frequent category among past
 *  expenses whose notes share a word with this one. */
async function guessCategoryId(
  userId: string,
  note: string | undefined,
): Promise<string | null> {
  if (!note) return null;
  const tokens = note.toLowerCase().split(/\s+/);

  const cats = await db
    .select({ id: categories.id, name: categories.name })
    .from(categories)
    .where(and(eq(categories.userId, userId), eq(categories.kind, "EXPENSE")));
  const byName = cats.find((c) => tokens.includes(c.name.toLowerCase()));
  if (byName) return byName.id;

  const past = await db
    .select({ note: transactions.note, categoryId: transactions.categoryId })
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, userId),
        eq(transactions.type, "EXPENSE"),
        isNotNull(transactions.categoryId),
        isNotNull(transactions.note),
      ),
    )
    .orderBy(desc(transactions.occurredAt))
    .limit(500);

  const counts = new Map<string, number>();
  for (const p of past) {
    const pastTokens = p.note!.toLowerCase().split(/\s+/);
    if (tokens.some((t) => pastTokens.includes(t))) {
      counts.set(p.categoryId!, (counts.get(p.categoryId!) ?? 0) + 1);
    }
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [id, count] of counts) {
    if (count > bestCount) [best, bestCount] = [id, count];
  }
  return best;
}

/** The account the user most recently spent from (MANUAL accounts only),
 *  falling back to their first cash-like account. */
async function captureAccount(userId: string) {
  const [recent] = await db
    .select({ accountId: transactions.accountId })
    .from(transactions)
    .innerJoin(accounts, eq(transactions.accountId, accounts.id))
    .where(
      and(
        eq(transactions.userId, userId),
        eq(transactions.type, "EXPENSE"),
        eq(accounts.valuationMode, "MANUAL"),
      ),
    )
    .orderBy(desc(transactions.createdAt))
    .limit(1);
  if (recent) {
    const [account] = await db
      .select()
      .from(accounts)
      .where(eq(accounts.id, recent.accountId));
    if (account) return account;
  }
  const [first] = await db
    .select()
    .from(accounts)
    .where(
      and(eq(accounts.userId, userId), eq(accounts.valuationMode, "MANUAL")),
    )
    .orderBy(accounts.createdAt)
    .limit(1);
  return first;
}

export async function POST(req: Request) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (secret && req.headers.get("x-telegram-bot-api-secret-token") !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const update = await req.json().catch(() => null);
  const message = update?.message;
  const chatId = message?.chat?.id ? String(message.chat.id) : null;
  const text: string | undefined = message?.text?.trim();
  if (!chatId || !text) return ok();

  if (text.startsWith("/start")) {
    await sendTelegramMessage(
      chatId,
      "Kanto expense capture.\n\nLink your account: open Kanto → Settings → generate a link code, then send:\n/link CODE\n\nAfter that just send expenses like: 50k kopi",
    );
    return ok();
  }

  if (text.startsWith("/link")) {
    const code = text.split(/\s+/)[1]?.toUpperCase();
    const [user] = code
      ? await db.select().from(users).where(eq(users.telegramLinkCode, code))
      : [];
    if (!user) {
      await sendTelegramMessage(
        chatId,
        "Invalid or expired code. Generate a new one in Kanto → Settings.",
      );
      return ok();
    }
    await db
      .update(users)
      .set({ telegramChatId: chatId, telegramLinkCode: null })
      .where(eq(users.id, user.id));
    await sendTelegramMessage(
      chatId,
      `Linked to ${user.email}. Send expenses like: 50k kopi`,
    );
    return ok();
  }

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.telegramChatId, chatId));
  if (!user || user.disabledAt) {
    await sendTelegramMessage(
      chatId,
      "This chat isn't linked yet. Send /start for instructions.",
    );
    return ok();
  }

  const parsed = parseCapture(text);
  if (!parsed) {
    await sendTelegramMessage(
      chatId,
      `Couldn't find an amount in "${text}". Try: 50k kopi`,
    );
    return ok();
  }

  const account = await captureAccount(user.id);
  if (!account) {
    await sendTelegramMessage(
      chatId,
      "No spendable account yet — create a cash account in Kanto first.",
    );
    return ok();
  }

  const categoryId = await guessCategoryId(user.id, parsed.note);
  const amountMinor = toMinor(parsed.amountMajor, account.currency);
  await db.insert(transactions).values({
    userId: user.id,
    accountId: account.id,
    type: "EXPENSE",
    amountMinor: -amountMinor,
    currency: account.currency,
    categoryId,
    note: parsed.note,
    occurredAt: new Date(),
  });

  let categoryName: string | null = null;
  if (categoryId) {
    const [cat] = await db
      .select({ name: categories.name })
      .from(categories)
      .where(eq(categories.id, categoryId));
    categoryName = cat?.name ?? null;
  }
  await sendTelegramMessage(
    chatId,
    `Logged ${formatMoney(amountMinor, account.currency)}${
      parsed.note ? ` — ${parsed.note}` : ""
    }${categoryName ? ` → ${categoryName}` : ""} (${account.name})`,
  );
  return ok();
}
