CREATE TABLE "auth_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "auth_sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "platform_users" (
	"id" text PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" text DEFAULT 'user' NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "platform_users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "skill_contributors" (
	"id" text PRIMARY KEY NOT NULL,
	"skill_slug" text NOT NULL,
	"user_id" text,
	"username" text,
	"name" text NOT NULL,
	"role" text NOT NULL,
	"added_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skill_issues" (
	"id" text PRIMARY KEY NOT NULL,
	"skill_slug" text NOT NULL,
	"type" text NOT NULL,
	"status" text NOT NULL,
	"severity" text NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"created_by" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skill_ratings" (
	"id" text PRIMARY KEY NOT NULL,
	"skill_slug" text NOT NULL,
	"version" text,
	"user_name" text NOT NULL,
	"score" smallint NOT NULL,
	"comment" text,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skill_evaluation_report_findings" (
	"skill_slug" text NOT NULL,
	"version" text NOT NULL,
	"position" integer NOT NULL,
	"finding_id" text NOT NULL,
	"task_name" text,
	"severity" text NOT NULL,
	"message" text NOT NULL,
	"recommendation" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skill_evaluation_task_findings" (
	"skill_slug" text NOT NULL,
	"version" text NOT NULL,
	"task_position" integer NOT NULL,
	"position" integer NOT NULL,
	"finding_id" text NOT NULL,
	"task_name" text,
	"severity" text NOT NULL,
	"message" text NOT NULL,
	"recommendation" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skill_evaluation_tasks" (
	"skill_slug" text NOT NULL,
	"version" text NOT NULL,
	"task_position" integer NOT NULL,
	"name" text NOT NULL,
	"score" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skill_evaluations" (
	"skill_slug" text NOT NULL,
	"version" text NOT NULL,
	"evaluation_id" text NOT NULL,
	"provider" text NOT NULL,
	"status" text NOT NULL,
	"score" integer NOT NULL,
	"tasks_total" integer NOT NULL,
	"tasks_passed" integer NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_schema_migrations" (
	"name" text PRIMARY KEY NOT NULL,
	"applied_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skill_review_findings" (
	"skill_slug" text NOT NULL,
	"version" text NOT NULL,
	"position" integer NOT NULL,
	"finding_id" text NOT NULL,
	"category" text NOT NULL,
	"severity" text NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"path" text,
	"evidence" text,
	"recommendation" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skill_reviews" (
	"skill_slug" text NOT NULL,
	"version" text NOT NULL,
	"review_id" text NOT NULL,
	"report_version" text NOT NULL,
	"content_hash" text NOT NULL,
	"verdict" text NOT NULL,
	"quality_score" integer NOT NULL,
	"security_score" integer NOT NULL,
	"privacy_score" integer NOT NULL,
	"functional_score" integer NOT NULL,
	"overall_score" integer NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skill_version_files" (
	"skill_slug" text NOT NULL,
	"version" text NOT NULL,
	"path" text NOT NULL,
	"content" text NOT NULL,
	"size" integer NOT NULL,
	"sha256" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skill_version_manifest_properties" (
	"skill_slug" text NOT NULL,
	"version" text NOT NULL,
	"property_key" text NOT NULL,
	"value_kind" text NOT NULL,
	"value_text" text
);
--> statement-breakpoint
CREATE TABLE "skill_version_tags" (
	"skill_slug" text NOT NULL,
	"version" text NOT NULL,
	"position" integer NOT NULL,
	"tag" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skill_versions" (
	"skill_slug" text NOT NULL,
	"version" text NOT NULL,
	"manifest_name" text NOT NULL,
	"manifest_description" text NOT NULL,
	"manifest_version" text,
	"manifest_author" text,
	"manifest_license" text,
	"tags_defined" boolean DEFAULT false NOT NULL,
	"supported_agents" text[] DEFAULT '{}' NOT NULL,
	"supported_agents_defined" boolean DEFAULT false NOT NULL,
	"allowed_tools" text[] DEFAULT '{}' NOT NULL,
	"allowed_tools_defined" boolean DEFAULT false NOT NULL,
	"allowed_tools_is_scalar" boolean DEFAULT false NOT NULL,
	"disallowed_tools" text[] DEFAULT '{}' NOT NULL,
	"disallowed_tools_defined" boolean DEFAULT false NOT NULL,
	"disallowed_tools_is_scalar" boolean DEFAULT false NOT NULL,
	"categories" text[] DEFAULT '{}' NOT NULL,
	"topics" text[] DEFAULT '{}' NOT NULL,
	"release_tags" text[] DEFAULT '{}' NOT NULL,
	"content_hash" text NOT NULL,
	"readme" text NOT NULL,
	"snapshot_created_at" timestamp with time zone NOT NULL,
	"status" text NOT NULL,
	"downloads" integer DEFAULT 0 NOT NULL,
	"artifact_provider" text,
	"artifact_bucket" text,
	"artifact_object_key" text,
	"artifact_content_hash" text,
	"artifact_size" bigint,
	"artifact_stored_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skills" (
	"slug" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"owner_user_id" text,
	"latest_version" text NOT NULL,
	"average_rating" numeric(3, 1) DEFAULT '0' NOT NULL,
	"rating_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_platform_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."platform_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_contributors" ADD CONSTRAINT "skill_contributors_skill_slug_skills_slug_fk" FOREIGN KEY ("skill_slug") REFERENCES "public"."skills"("slug") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_issues" ADD CONSTRAINT "skill_issues_skill_slug_skills_slug_fk" FOREIGN KEY ("skill_slug") REFERENCES "public"."skills"("slug") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_ratings" ADD CONSTRAINT "skill_ratings_skill_slug_skills_slug_fk" FOREIGN KEY ("skill_slug") REFERENCES "public"."skills"("slug") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_versions" ADD CONSTRAINT "skill_versions_skill_slug_skills_slug_fk" FOREIGN KEY ("skill_slug") REFERENCES "public"."skills"("slug") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "skill_contributors_user_id_idx" ON "skill_contributors" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "skill_contributors_username_idx" ON "skill_contributors" USING btree (lower("username"));--> statement-breakpoint
CREATE UNIQUE INDEX "skill_evaluation_report_findings_pkey" ON "skill_evaluation_report_findings" USING btree ("skill_slug","version","position");--> statement-breakpoint
CREATE UNIQUE INDEX "skill_evaluation_task_findings_pkey" ON "skill_evaluation_task_findings" USING btree ("skill_slug","version","task_position","position");--> statement-breakpoint
CREATE UNIQUE INDEX "skill_evaluation_tasks_pkey" ON "skill_evaluation_tasks" USING btree ("skill_slug","version","task_position");--> statement-breakpoint
CREATE UNIQUE INDEX "skill_evaluations_pkey" ON "skill_evaluations" USING btree ("skill_slug","version");--> statement-breakpoint
CREATE UNIQUE INDEX "skill_review_findings_pkey" ON "skill_review_findings" USING btree ("skill_slug","version","position");--> statement-breakpoint
CREATE UNIQUE INDEX "skill_reviews_pkey" ON "skill_reviews" USING btree ("skill_slug","version");--> statement-breakpoint
CREATE UNIQUE INDEX "skill_version_files_pkey" ON "skill_version_files" USING btree ("skill_slug","version","path");--> statement-breakpoint
CREATE UNIQUE INDEX "skill_version_manifest_properties_pkey" ON "skill_version_manifest_properties" USING btree ("skill_slug","version","property_key");--> statement-breakpoint
CREATE UNIQUE INDEX "skill_version_tags_pkey" ON "skill_version_tags" USING btree ("skill_slug","version","position");--> statement-breakpoint
CREATE INDEX "skill_version_tags_tag_idx" ON "skill_version_tags" USING btree ("tag");--> statement-breakpoint
CREATE UNIQUE INDEX "skill_versions_pkey" ON "skill_versions" USING btree ("skill_slug","version");--> statement-breakpoint
CREATE INDEX "skill_versions_status_updated_at_idx" ON "skill_versions" USING btree ("status","updated_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "skill_versions_content_hash_idx" ON "skill_versions" USING btree ("content_hash");--> statement-breakpoint
CREATE INDEX "skills_updated_at_idx" ON "skills" USING btree ("updated_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "skills_owner_user_id_idx" ON "skills" USING btree ("owner_user_id");--> statement-breakpoint
ALTER TABLE "skills" ADD CONSTRAINT "skills_rating_count_check" CHECK ("rating_count" >= 0);--> statement-breakpoint
ALTER TABLE "skill_versions" ADD CONSTRAINT "skill_versions_downloads_check" CHECK ("downloads" >= 0);--> statement-breakpoint
ALTER TABLE "skill_version_files" ADD CONSTRAINT "skill_version_files_size_check" CHECK ("size" >= 0);--> statement-breakpoint
ALTER TABLE "skill_ratings" ADD CONSTRAINT "skill_ratings_score_check" CHECK ("score" BETWEEN 1 AND 5);