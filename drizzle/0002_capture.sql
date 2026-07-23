ALTER TABLE "transactions" ADD COLUMN "client_id" uuid;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_client_id_unique" UNIQUE("client_id");