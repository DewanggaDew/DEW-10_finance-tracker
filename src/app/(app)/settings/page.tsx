import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { telegramConfigured } from "@/integrations/telegram";
import { generateTelegramCode, unlinkTelegram } from "@/server/actions";
import { requireUserId } from "@/server/session";
import { Button } from "@/components/ui/button";

export default async function SettingsPage() {
  const userId = await requireUserId();
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  const botUsername = process.env.TELEGRAM_BOT_USERNAME;

  return (
    <div className="space-y-14">
      <div>
        <p className="label-caps">Preferences</p>
        <h1 className="mt-2 font-heading text-3xl font-bold tracking-tight">
          Settings
        </h1>
      </div>

      <section className="max-w-lg">
        <p className="label-caps mb-4">Telegram capture</p>
        {!telegramConfigured() && (
          <p className="mb-4 text-sm text-muted-foreground">
            The bot isn&apos;t configured on this server yet — set{" "}
            <code className="rounded bg-secondary px-1">TELEGRAM_BOT_TOKEN</code>{" "}
            in .env and register the webhook (see README).
          </p>
        )}
        {user.telegramChatId ? (
          <div className="space-y-3">
            <p className="text-sm">
              Linked ✓ — send messages like{" "}
              <code className="rounded bg-secondary px-1">50k kopi</code> to log
              expenses.
            </p>
            <form action={unlinkTelegram}>
              <Button variant="outline" size="sm" type="submit">
                Unlink
              </Button>
            </form>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Log expenses by messaging{" "}
              {botUsername ? <strong>@{botUsername}</strong> : "the Kanto bot"} on
              Telegram.
            </p>
            {user.telegramLinkCode ? (
              <div className="rounded-lg border p-4">
                <p className="text-sm">
                  Send this to the bot{" "}
                  {botUsername && (
                    <>
                      (<strong>@{botUsername}</strong>)
                    </>
                  )}
                  :
                </p>
                <p className="mt-2 font-mono text-lg font-semibold tracking-widest">
                  /link {user.telegramLinkCode}
                </p>
              </div>
            ) : null}
            <form action={generateTelegramCode}>
              <Button variant="outline" size="sm" type="submit">
                {user.telegramLinkCode ? "Generate new code" : "Generate link code"}
              </Button>
            </form>
          </div>
        )}
      </section>
    </div>
  );
}
