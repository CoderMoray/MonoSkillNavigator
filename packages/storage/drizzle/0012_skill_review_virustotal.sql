ALTER TABLE "skill_reviews" ADD COLUMN IF NOT EXISTS "virustotal_provider" text;
ALTER TABLE "skill_reviews" ADD COLUMN IF NOT EXISTS "virustotal_sha256" text;
ALTER TABLE "skill_reviews" ADD COLUMN IF NOT EXISTS "virustotal_status" text;
ALTER TABLE "skill_reviews" ADD COLUMN IF NOT EXISTS "virustotal_malicious" integer;
ALTER TABLE "skill_reviews" ADD COLUMN IF NOT EXISTS "virustotal_suspicious" integer;
ALTER TABLE "skill_reviews" ADD COLUMN IF NOT EXISTS "virustotal_harmless" integer;
ALTER TABLE "skill_reviews" ADD COLUMN IF NOT EXISTS "virustotal_undetected" integer;
ALTER TABLE "skill_reviews" ADD COLUMN IF NOT EXISTS "virustotal_analysis_url" text;
