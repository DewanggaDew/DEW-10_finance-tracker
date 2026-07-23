// Registers the Telegram webhook for the capture bot.
// Usage: npx tsx scripts/set-telegram-webhook.ts https://your-public-host
import "dotenv/config";

async function main() {
  const base = process.argv[2];
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!base || !token) {
    console.error(
      "Usage: npx tsx scripts/set-telegram-webhook.ts <https://public-base-url>\n" +
        "Requires TELEGRAM_BOT_TOKEN in .env",
    );
    process.exit(1);
  }
  const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      url: `${base.replace(/\/$/, "")}/api/telegram`,
      secret_token: process.env.TELEGRAM_WEBHOOK_SECRET || undefined,
      allowed_updates: ["message"],
    }),
  });
  console.log(await res.json());
}

main();
