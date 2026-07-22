import { pgTable, text, integer, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { skillVersions } from "./skills";

export const skillReviews = pgTable("skill_reviews", {
  skillSlug: text("skill_slug").notNull(),
  version: text("version").notNull(),
  reviewId: text("review_id").notNull(),
  reportVersion: text("report_version").notNull(),
  contentHash: text("content_hash").notNull(),
  verdict: text("verdict").notNull(),
  complianceScore: integer("compliance_score").notNull(),
  qualityScore: integer("quality_score").notNull(),
  securityScore: integer("security_score").notNull(),
  privacyScore: integer("privacy_score").notNull(),
  reliabilityScore: integer("reliability_score").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
}, (table) => [
  uniqueIndex("skill_reviews_pkey").on(table.skillSlug, table.version),
]);

export const skillReviewFindings = pgTable("skill_review_findings", {
  skillSlug: text("skill_slug").notNull(),
  version: text("version").notNull(),
  position: integer("position").notNull(),
  findingId: text("finding_id").notNull(),
  category: text("category").notNull(),
  severity: text("severity").notNull(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  path: text("path"),
  evidence: text("evidence"),
  recommendation: text("recommendation").notNull(),
}, (table) => [
  uniqueIndex("skill_review_findings_pkey").on(table.skillSlug, table.version, table.position),
]);
