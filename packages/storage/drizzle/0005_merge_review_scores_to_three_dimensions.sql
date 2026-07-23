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
        AND finding."category" IN ('compliance', 'quality')
    ),
    0
  )
);
--> statement-breakpoint
ALTER TABLE "skill_reviews" DROP COLUMN "compliance_score";
--> statement-breakpoint
ALTER TABLE "skill_reviews" DROP COLUMN "privacy_score";
