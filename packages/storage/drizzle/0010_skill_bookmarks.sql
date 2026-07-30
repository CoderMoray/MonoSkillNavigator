CREATE TABLE IF NOT EXISTS "skill_bookmarks" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "platform_users"("id") ON DELETE CASCADE,
  "skill_slug" text NOT NULL REFERENCES "skills"("slug") ON DELETE CASCADE,
  "created_at" timestamptz NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "skill_bookmarks_user_id_skill_slug_unique"
  ON "skill_bookmarks" ("user_id", "skill_slug");

CREATE INDEX IF NOT EXISTS "skill_bookmarks_user_id_idx"
  ON "skill_bookmarks" ("user_id");
