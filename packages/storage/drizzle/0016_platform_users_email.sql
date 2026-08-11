ALTER TABLE "platform_users" ADD COLUMN IF NOT EXISTS "email" text;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "platform_users_email_lower_key" ON "platform_users" (lower("email")) WHERE "email" IS NOT NULL;
