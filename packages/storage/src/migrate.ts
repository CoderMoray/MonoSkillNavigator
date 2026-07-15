import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import type { Pool } from "pg";
import * as schema from "./schema";

export async function runMigrations(pool: Pool): Promise<void> {
  const db = drizzle(pool, { schema });
  await migrate(db, {
    migrationsFolder: "packages/storage/drizzle",
    migrationsTable: "__drizzle_migrations",
  });
}
