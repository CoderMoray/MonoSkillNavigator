DROP INDEX IF EXISTS "skill_ratings_skill_slug_user_name_unique";

UPDATE "skill_ratings" AS rating
SET "version" = skill."latest_version"
FROM "skills" AS skill
WHERE rating."skill_slug" = skill."slug"
  AND rating."version" IS NULL;

UPDATE "skill_ratings"
SET "version" = 'unknown'
WHERE "version" IS NULL;

ALTER TABLE "skill_ratings"
  ALTER COLUMN "version" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "skill_ratings_skill_slug_version_user_name_unique"
  ON "skill_ratings" ("skill_slug", "version", lower("user_name"));
