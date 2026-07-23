// Thin Telegram Bot API client. When TELEGRAM_BOT_TOKEN is unset the bot is
// simply not configured: webhook updates are still processed (useful in tests)
// but replies become no-ops.

export function telegramConfigured(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN);
}

export async function sendTelegramMessage(
  chatId: string,
  text: string,
): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (e) {
    console.error("[telegram] sendMessage failed:", e);
  }
}
