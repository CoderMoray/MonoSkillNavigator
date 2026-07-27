DELETE FROM "skill_ratings" AS newer
USING "skill_ratings" AS older
WHERE newer."id" <> older."id"
  AND newer."skill_slug" = older."skill_slug"
  AND lower(newer."user_name") = lower(older."user_name")
  AND newer."created_at" > older."created_at";

DROP INDEX IF EXISTS "skill_ratings_skill_slug_version_user_name_unique";

CREATE UNIQUE INDEX IF NOT EXISTS "skill_ratings_skill_slug_user_name_unique"
  ON "skill_ratings" ("skill_slug", lower("user_name"));
