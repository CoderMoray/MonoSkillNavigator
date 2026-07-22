ALTER TABLE "skills" ADD COLUMN "published" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
CREATE INDEX "skills_published_updated_at_idx" ON "skills" USING btree ("published","updated_at" DESC NULLS LAST);
