import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Pool } from "pg";

function findMigrationsDir(): string {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const dir = path.resolve(__dirname, "..", "drizzle");
  if (!existsSync(dir)) throw new Error(`Migrations dir not found: ${dir}`);
  return dir;
}

export async function runMigrations(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("select pg_advisory_xact_lock(81024002::bigint)");

    // Track which migrations have been applied
    await client.query(`
      create table if not exists _migrations (
        name text primary key,
        applied_at timestamptz not null default now()
      )
    `);

    const migrationsDir = findMigrationsDir();
    const files = readdirSync(migrationsDir)
      .filter((f) => f.endsWith(".sql"))
      .sort();

    for (const file of files) {
      const { rows } = await client.query(
        "select name from _migrations where name = $1",
        [file]
      );
      if (rows.length > 0) continue; // Already applied

      const filePath = path.join(migrationsDir, file);
      const sql = readFileSync(filePath, "utf8");
      await client.query(sql);
      await client.query(
        "insert into _migrations (name) values ($1)",
        [file]
      );
    }

    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
