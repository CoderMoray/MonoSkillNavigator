ALTER TABLE "skills" ADD COLUMN IF NOT EXISTS "deleted_at" timestamptz;

CREATE INDEX IF NOT EXISTS "skills_deleted_at_idx"
  ON "skills" ("deleted_at")
  WHERE "deleted_at" IS NOT NULL;
