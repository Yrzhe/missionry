import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { AuthConfig } from "@sidecar/adapters/auth-config/types";

export const es_system__auth_config = sqliteTable("es_system__auth_config", {
  key: text("key").primaryKey(),
  data: text("data", { mode: "json" }).$type<AuthConfig>().default({} as AuthConfig),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});
