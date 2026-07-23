ALTER TABLE "users" ADD COLUMN "telegram_chat_id" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "telegram_link_code" text;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_telegram_chat_id_unique" UNIQUE("telegram_chat_id");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_telegram_link_code_unique" UNIQUE("telegram_link_code");