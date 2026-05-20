import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/defs/db_schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
});
