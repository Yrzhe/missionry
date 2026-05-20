// EdgeSpark barrel — re-exports all repo-authored defs.
// EdgeSpark resolves `@defs` to this file when building the worker.

import * as schema from "./db_schema";

export * from "./db_schema";
export * from "./db_relations";
export * from "./storage_schema";
export * from "./runtime";

// EdgeSpark's internal runtime imports `drizzleSchema` — provide a single
// object combining all tables so Drizzle can reflect them.
export const drizzleSchema = {
  missions: schema.missions,
  agents: schema.agents,
  agentInstances: schema.agentInstances,
  workCards: schema.workCards,
  sandboxRuntime: schema.sandboxRuntime,
  auditEvents: schema.auditEvents,
  budgetSettings: schema.budgetSettings,
  missionSpend: schema.missionSpend,
  growthCandidates: schema.growthCandidates,
  usersProfile: schema.usersProfile,
  whitelistEntries: schema.whitelistEntries,
};
