import { pgTable, text, smallint, timestamp, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { skills } from "./skills";

export const skillContributors = pgTable("skill_contributors", {
  id: text("id").primaryKey(),
  skillSlug: text("skill_slug").notNull().references(() => skills.slug, { onDelete: "cascade" }),
  userId: text("user_id"),
  username: text("username"),
  name: text("name").notNull(),
  role: text("role").notNull(),
  addedAt: timestamp("added_at", { withTimezone: true }).notNull(),
}, (table) => [
  index("skill_contributors_user_id_idx").on(table.userId),
  index("skill_contributors_username_idx").on(sql`lower(${table.username})`),
]);

export const skillIssues = pgTable("skill_issues", {
  id: text("id").primaryKey(),
  skillSlug: text("skill_slug").notNull().references(() => skills.slug, { onDelete: "cascade" }),
  type: text("type").notNull(),
  status: text("status").notNull(),
  severity: text("severity").notNull(),
  title: text("title").notNull(),
  body: text("body"),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});

export const skillRatings = pgTable("skill_ratings", {
  id: text("id").primaryKey(),
  skillSlug: text("skill_slug").notNull().references(() => skills.slug, { onDelete: "cascade" }),
  version: text("version"),
  userName: text("user_name").notNull(),
  score: smallint("score").notNull(),
  comment: text("comment"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});
