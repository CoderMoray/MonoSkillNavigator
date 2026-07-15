import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./packages/storage/src/schema/*.ts",
  out: "./packages/storage/drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://skill_platform:skill_platform@127.0.0.1:15432/skill_platform",
  },
});
