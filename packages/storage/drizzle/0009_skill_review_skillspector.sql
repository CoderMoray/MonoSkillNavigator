ALTER TABLE "skill_reviews" ADD COLUMN IF NOT EXISTS "skillspector_provider" text;
ALTER TABLE "skill_reviews" ADD COLUMN IF NOT EXISTS "skillspector_risk_score" integer;
ALTER TABLE "skill_reviews" ADD COLUMN IF NOT EXISTS "skillspector_risk_severity" text;
ALTER TABLE "skill_reviews" ADD COLUMN IF NOT EXISTS "skillspector_recommendation" text;
ALTER TABLE "skill_reviews" ADD COLUMN IF NOT EXISTS "skillspector_scan_mode" text;
