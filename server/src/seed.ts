import { ensureAgentFiles, ensureAgentInstanceFiles } from "./agents/files";
import type { EdgeSparkRuntime } from "./defs/runtime";
import { defaultMissionState } from "./state/missionState";

const now = () => new Date().toISOString();

export async function ensureSchema(db: D1Database) {
  const statements = [
    `create table if not exists missions (
      id text primary key, title text not null, objective text not null, status text not null,
      owner_type text not null, owner_user_id text, owner_agent_id text, owner_instance_id text,
      version integer not null default 0, state_json text not null,
      mission_spend_cents integer not null default 0, llm_spend_cents integer not null default 0,
      sandbox_spend_cents integer not null default 0, burn_rate_cents_per_minute real not null default 0,
      daily_budget_cents integer not null default 500, created_at text not null, updated_at text not null
    )`,
    `create table if not exists agents (
      id text primary key, slug text not null unique, display_name text not null, avatar_json text not null,
      global_identity_json text not null, equipped_skill_ids_json text not null, r2_prefix text not null,
      audit_head_id text, created_at text not null, updated_at text not null
    )`,
    `create table if not exists agent_instances (
      id text primary key, mission_id text not null, agent_id text not null, role text not null,
      display_alias text, work_state_json text not null, isolation_json text not null,
      equipped_skill_overrides_json text not null, r2_prefix text not null, created_at text not null, updated_at text not null
    )`,
    `create table if not exists work_cards (
      id text primary key, mission_id text not null, title text not null, description text,
      pm_instance_id text, assignee_instance_id text, status text not null, priority text not null,
      sandbox_affinity_json text not null, dependencies_json text not null, issue_ids_json text not null,
      cost_json text not null, created_at text not null, updated_at text not null
    )`,
    `create table if not exists audit_events (
      id text primary key, event_id text not null unique, mission_id text, subject_type text not null,
      subject_id text not null, actor_json text not null, action text not null, client_action_id text,
      diff_summary text not null, payload_ref_json text, reversible integer not null default 0,
      rollback_available integer not null default 0, created_at text not null
    )`,
    `create table if not exists budget_settings (
      id text primary key, daily_budget_cents integer not null, global_cap_cents integer not null,
      currency text not null default 'USD', reset_at text not null, updated_at text not null
    )`,
    `create table if not exists mission_spend (
      id text primary key, mission_id text not null, client_action_id text, agent_id text, instance_id text,
      model text, prompt_tokens integer, completion_tokens integer, cost_cents integer not null,
      sandbox_id text, sandbox_seconds real, event_type text not null, created_at text not null
    )`,
    `create table if not exists growth_candidates (
      id text primary key, type text not null, title text not null, rationale text not null,
      evidence_event_ids_json text not null, source_mission_ids_json text not null, scope text not null,
      status text not null, estimated_future_cost_hint text, created_at text not null, enabled_at text, enabled_by text
    )`,
    "create index if not exists idx_agent_instances_mission on agent_instances(mission_id)",
    "create index if not exists idx_work_cards_mission on work_cards(mission_id)",
    "create index if not exists idx_mission_spend_mission on mission_spend(mission_id, created_at)",
  ];
  for (const sql of statements) await db.prepare(sql).run();
}

export async function seedDemo(runtime: EdgeSparkRuntime, requestedMissionId?: string) {
  await ensureSchema(runtime.db);
  const missionId = requestedMissionId ?? `mis_${crypto.randomUUID().slice(0, 8)}`;
  const agentA = "agt_forge";
  const agentB = "agt_pixel";
  const instanceA = `ins_${missionId}_forge`;
  const instanceB = `ins_${missionId}_pixel`;
  const timestamp = now();

  await ensureAgentFiles(runtime.storage, agentA, "Forge");
  await ensureAgentFiles(runtime.storage, agentB, "Pixel");
  await ensureAgentInstanceFiles(runtime.storage, missionId, instanceA);
  await ensureAgentInstanceFiles(runtime.storage, missionId, instanceB);

  for (const [id, slug, name] of [
    [agentA, "forge", "Forge"],
    [agentB, "pixel", "Pixel"],
  ]) {
    await runtime.db
      .prepare(
        `insert or ignore into agents
         (id, slug, display_name, avatar_json, global_identity_json, equipped_skill_ids_json, r2_prefix, created_at, updated_at)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        slug,
        name,
        JSON.stringify({ avatarSource: "random", avatarSeed: id }),
        JSON.stringify({ displayName: name, role: "demo agent", version: "v1" }),
        JSON.stringify(["demo-sandbox"]),
        `agents/${id}/`,
        timestamp,
        timestamp,
      )
      .run();
  }

  const state = defaultMissionState();
  state.issues = { total: 2, completed: 0, open: 2, reopened: 0, addedAfterDone: 0 };

  await runtime.db
    .prepare(
      `insert or ignore into missions
       (id, title, objective, status, owner_type, owner_agent_id, owner_instance_id, state_json,
        daily_budget_cents, created_at, updated_at)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      missionId,
      `Phase 1 demo ${missionId}`,
      "Prove EdgeSpark + E2B lazy dual-sandbox isolation",
      "active",
      "agent",
      agentA,
      instanceA,
      JSON.stringify(state),
      500,
      timestamp,
      timestamp,
    )
    .run();

  for (const [id, agentId, role, alias] of [
    [instanceA, agentA, "owner", "Forge"],
    [instanceB, agentB, "member", "Pixel"],
  ]) {
    await runtime.db
      .prepare(
        `insert or ignore into agent_instances
         (id, mission_id, agent_id, role, display_alias, work_state_json, isolation_json,
          equipped_skill_overrides_json, r2_prefix, created_at, updated_at)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        missionId,
        agentId,
        role,
        alias,
        JSON.stringify({ status: "idle" }),
        JSON.stringify({ defaultPolicy: "deny_cross_project", allowedReadGrantIds: [] }),
        JSON.stringify({ addSkillIds: [], removeSkillIds: [], effectiveSkillIds: ["demo-sandbox"] }),
        `missions/${missionId}/agent-instances/${id}/`,
        timestamp,
        timestamp,
      )
      .run();
  }

  await createDemoWorkCard(runtime, missionId, "wc_shared", instanceA, "mission", "Shared Tier 1 command and file");
  await createDemoWorkCard(runtime, missionId, "wc_private", instanceA, "private", "Private Tier 2 escalation");
  return { missionId, agents: [agentA, agentB], instances: [instanceA, instanceB] };
}

export async function createDemoWorkCard(
  runtime: EdgeSparkRuntime,
  missionId: string,
  workCardId: string,
  assigneeInstanceId: string,
  tier: "mission" | "private" | "tier0",
  title: string,
) {
  const timestamp = now();
  await runtime.db
    .prepare(
      `insert or ignore into work_cards
       (id, mission_id, title, pm_instance_id, assignee_instance_id, status, priority,
        sandbox_affinity_json, dependencies_json, issue_ids_json, cost_json, created_at, updated_at)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      workCardId,
      missionId,
      title,
      assigneeInstanceId,
      assigneeInstanceId,
      "ready",
      "high",
      JSON.stringify({ tier, reason: "Phase 1 demo" }),
      JSON.stringify([]),
      JSON.stringify([]),
      JSON.stringify({ spentCents: 0 }),
      timestamp,
      timestamp,
    )
    .run();
}
