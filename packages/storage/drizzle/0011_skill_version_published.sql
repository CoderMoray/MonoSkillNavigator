ALTER TABLE "skill_versions" ADD COLUMN IF NOT EXISTS "published" boolean DEFAULT true NOT NULL;

CREATE INDEX IF NOT EXISTS "skill_versions_published_idx" ON "skill_versions" USING btree ("skill_slug", "published");
