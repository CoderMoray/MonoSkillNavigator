UPDATE "skill_review_findings"
SET "category" = 'quality'
WHERE "finding_id" IN (
  'description-trigger-missing',
  'tags-missing',
  'skill-md-too-long',
  'instructions-too-short'
);
--> statement-breakpoint
UPDATE "skill_review_findings"
SET "category" = 'reliability'
WHERE "category" = 'functional';
--> statement-breakpoint
ALTER TABLE "skill_reviews" ADD COLUMN "compliance_score" integer;
--> statement-breakpoint
UPDATE "skill_reviews" AS review
SET "compliance_score" = GREATEST(
  0,
  100 - COALESCE(
    (
      SELECT SUM(
        CASE finding."severity"
          WHEN 'critical' THEN 45
          WHEN 'high' THEN 25
          WHEN 'medium' THEN 10
          WHEN 'low' THEN 3
          ELSE 0
        END
      )
      FROM "skill_review_findings" AS finding
      WHERE finding."skill_slug" = review."skill_slug"
        AND finding."version" = review."version"
        AND finding."category" = 'compliance'
    ),
    0
  )
);
--> statement-breakpoint
UPDATE "skill_reviews" AS review
SET "quality_score" = GREATEST(
  0,
  100 - COALESCE(
    (
      SELECT SUM(
        CASE finding."severity"
          WHEN 'critical' THEN 45
          WHEN 'high' THEN 25
          WHEN 'medium' THEN 10
          WHEN 'low' THEN 3
          ELSE 0
        END
      )
      FROM "skill_review_findings" AS finding
      WHERE finding."skill_slug" = review."skill_slug"
        AND finding."version" = review."version"
        AND finding."category" = 'quality'
    ),
    0
  )
);
--> statement-breakpoint
ALTER TABLE "skill_reviews" ALTER COLUMN "compliance_score" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "skill_reviews" RENAME COLUMN "functional_score" TO "reliability_score";
--> statement-breakpoint
ALTER TABLE "skill_reviews" DROP COLUMN "overall_score";
