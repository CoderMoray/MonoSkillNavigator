import { pgTable, text, integer, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const skillEvaluations = pgTable("skill_evaluations", {
  skillSlug: text("skill_slug").notNull(),
  version: text("version").notNull(),
  evaluationId: text("evaluation_id").notNull(),
  provider: text("provider").notNull(),
  status: text("status").notNull(),
  score: integer("score").notNull(),
  tasksTotal: integer("tasks_total").notNull(),
  tasksPassed: integer("tasks_passed").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
}, (table) => [
  uniqueIndex("skill_evaluations_pkey").on(table.skillSlug, table.version),
]);

export const skillEvaluationReportFindings = pgTable("skill_evaluation_report_findings", {
  skillSlug: text("skill_slug").notNull(),
  version: text("version").notNull(),
  position: integer("position").notNull(),
  findingId: text("finding_id").notNull(),
  taskName: text("task_name"),
  severity: text("severity").notNull(),
  message: text("message").notNull(),
  recommendation: text("recommendation").notNull(),
}, (table) => [
  uniqueIndex("skill_evaluation_report_findings_pkey").on(table.skillSlug, table.version, table.position),
]);

export const skillEvaluationTasks = pgTable("skill_evaluation_tasks", {
  skillSlug: text("skill_slug").notNull(),
  version: text("version").notNull(),
  taskPosition: integer("task_position").notNull(),
  name: text("name").notNull(),
  score: integer("score").notNull(),
}, (table) => [
  uniqueIndex("skill_evaluation_tasks_pkey").on(table.skillSlug, table.version, table.taskPosition),
]);

export const skillEvaluationTaskFindings = pgTable("skill_evaluation_task_findings", {
  skillSlug: text("skill_slug").notNull(),
  version: text("version").notNull(),
  taskPosition: integer("task_position").notNull(),
  position: integer("position").notNull(),
  findingId: text("finding_id").notNull(),
  taskName: text("task_name"),
  severity: text("severity").notNull(),
  message: text("message").notNull(),
  recommendation: text("recommendation").notNull(),
}, (table) => [
  uniqueIndex("skill_evaluation_task_findings_pkey").on(table.skillSlug, table.version, table.taskPosition, table.position),
]);
