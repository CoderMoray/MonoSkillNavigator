import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const platformSchemaMigrations = pgTable("platform_schema_migrations", {
  name: text("name").primaryKey(),
  appliedAt: timestamp("applied_at", { withTimezone: true }).notNull().defaultNow(),
});
