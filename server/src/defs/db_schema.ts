import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const missions = sqliteTable("missions", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  objective: text("objective").notNull(),
  status: text("status").notNull(),
  ownerType: text("owner_type").notNull(),
  ownerUserId: text("owner_user_id"),
  ownerAgentId: text("owner_agent_id"),
  ownerInstanceId: text("owner_instance_id"),
  version: integer("version").notNull().default(0),
  stateJson: text("state_json").notNull(),
  missionSpendCents: integer("mission_spend_cents").notNull().default(0),
  llmSpendCents: integer("llm_spend_cents").notNull().default(0),
  sandboxSpendCents: integer("sandbox_spend_cents").notNull().default(0),
  burnRateCentsPerMinute: real("burn_rate_cents_per_minute").notNull().default(0),
  dailyBudgetCents: integer("daily_budget_cents").notNull().default(500),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const agents = sqliteTable("agents", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  displayName: text("display_name").notNull(),
  avatarJson: text("avatar_json").notNull(),
  globalIdentityJson: text("global_identity_json").notNull(),
  equippedSkillIdsJson: text("equipped_skill_ids_json").notNull(),
  r2Prefix: text("r2_prefix").notNull(),
  auditHeadId: text("audit_head_id"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const agentInstances = sqliteTable("agent_instances", {
  id: text("id").primaryKey(),
  missionId: text("mission_id").notNull(),
  agentId: text("agent_id").notNull(),
  role: text("role").notNull(),
  displayAlias: text("display_alias"),
  workStateJson: text("work_state_json").notNull(),
  isolationJson: text("isolation_json").notNull(),
  equippedSkillOverridesJson: text("equipped_skill_overrides_json").notNull(),
  r2Prefix: text("r2_prefix").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const workCards = sqliteTable("work_cards", {
  id: text("id").primaryKey(),
  missionId: text("mission_id").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  pmInstanceId: text("pm_instance_id"),
  assigneeInstanceId: text("assignee_instance_id"),
  status: text("status").notNull(),
  priority: text("priority").notNull(),
  sandboxAffinityJson: text("sandbox_affinity_json").notNull(),
  dependenciesJson: text("dependencies_json").notNull(),
  issueIdsJson: text("issue_ids_json").notNull(),
  costJson: text("cost_json").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const auditEvents = sqliteTable("audit_events", {
  id: text("id").primaryKey(),
  eventId: text("event_id").notNull().unique(),
  missionId: text("mission_id"),
  subjectType: text("subject_type").notNull(),
  subjectId: text("subject_id").notNull(),
  actorJson: text("actor_json").notNull(),
  action: text("action").notNull(),
  clientActionId: text("client_action_id"),
  diffSummary: text("diff_summary").notNull(),
  payloadRefJson: text("payload_ref_json"),
  reversible: integer("reversible").notNull().default(0),
  rollbackAvailable: integer("rollback_available").notNull().default(0),
  createdAt: text("created_at").notNull(),
});

export const budgetSettings = sqliteTable("budget_settings", {
  id: text("id").primaryKey(),
  dailyBudgetCents: integer("daily_budget_cents").notNull(),
  globalCapCents: integer("global_cap_cents").notNull(),
  currency: text("currency").notNull().default("USD"),
  resetAt: text("reset_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const missionSpend = sqliteTable("mission_spend", {
  id: text("id").primaryKey(),
  missionId: text("mission_id").notNull(),
  clientActionId: text("client_action_id"),
  agentId: text("agent_id"),
  instanceId: text("instance_id"),
  model: text("model"),
  promptTokens: integer("prompt_tokens"),
  completionTokens: integer("completion_tokens"),
  costCents: integer("cost_cents").notNull(),
  sandboxId: text("sandbox_id"),
  sandboxSeconds: real("sandbox_seconds"),
  eventType: text("event_type").notNull(),
  createdAt: text("created_at").notNull(),
});

export const growthCandidates = sqliteTable("growth_candidates", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  title: text("title").notNull(),
  rationale: text("rationale").notNull(),
  evidenceEventIdsJson: text("evidence_event_ids_json").notNull(),
  sourceMissionIdsJson: text("source_mission_ids_json").notNull(),
  scope: text("scope").notNull(),
  status: text("status").notNull(),
  estimatedFutureCostHint: text("estimated_future_cost_hint"),
  createdAt: text("created_at").notNull(),
  enabledAt: text("enabled_at"),
  enabledBy: text("enabled_by"),
});

export const createIndexesSql = [
  "create index if not exists idx_agent_instances_mission on agent_instances(mission_id)",
  "create index if not exists idx_work_cards_mission on work_cards(mission_id)",
  "create index if not exists idx_audit_events_mission on audit_events(mission_id, created_at)",
  "create index if not exists idx_mission_spend_mission on mission_spend(mission_id, created_at)",
] as const;
