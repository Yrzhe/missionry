import type { EdgeSparkDb } from "../defs/runtime";

export type SandboxTier = "mission" | "private";
export type SandboxState = "none" | "starting" | "running" | "paused" | "resuming" | "killed" | "error";

export type SandboxRef = {
  sandboxId: string;
  tier: SandboxTier;
  ownerInstanceId?: string;
  state: SandboxState;
  e2bSandboxId?: string;
  lastActivityAt?: string;
  activeSince?: string;
  burnRateCentsPerMinute: number;
  environmentVersionId: string;
  injectedCredentialIds: string[];
  injectedVariableKeys: string[];
  environmentAccessMode: "inherit" | "restricted" | "blocked";
};

export type MissionStateJson = {
  turnQueue: Array<Record<string, unknown>>;
  sharedSandbox: SandboxRef;
  privateSandboxes: Record<string, SandboxRef>;
  snapshots: {
    sharedLatestR2Key?: string;
    privateLatestR2Keys: Record<string, string>;
    lastSnapshotAt?: string;
    lastRestoreAt?: string;
  };
  issues: {
    total: number;
    completed: number;
    open: number;
    reopened: number;
    addedAfterDone: number;
  };
  costGuardrailStatus: "ok" | "near_daily_cap" | "daily_cap_hit" | "global_cap_hit";
};

export type MissionRow = {
  id: string;
  title: string;
  objective: string;
  status: string;
  ownerType: string;
  ownerUserId: string | null;
  ownerAgentId: string | null;
  ownerInstanceId: string | null;
  version: number;
  stateJson: MissionStateJson;
  missionSpendCents: number;
  llmSpendCents: number;
  sandboxSpendCents: number;
  burnRateCentsPerMinute: number;
  dailyBudgetCents: number;
  createdAt: string;
  updatedAt: string;
};

export type CostRecord = {
  missionId: string;
  clientActionId?: string;
  agentId?: string;
  instanceId?: string;
  model?: string;
  promptTokens?: number;
  completionTokens?: number;
  costCents: number;
  sandboxId?: string;
  sandboxSeconds?: number;
  eventType: "cost_event" | "sandbox_burn" | "mission_spend_updated";
};

export type AuditRecord = {
  missionId?: string;
  subjectType: string;
  subjectId: string;
  actor: { type: "agent" | "user" | "system"; id: string };
  action: string;
  clientActionId?: string;
  diffSummary: string;
  payloadRef?: { r2Key: string; sha256?: string };
  reversible?: boolean;
  rollbackAvailable?: boolean;
};

const emptySandbox = (tier: SandboxTier, ownerInstanceId?: string): SandboxRef => ({
  sandboxId: tier === "mission" ? "mission:none" : `agent:none:${ownerInstanceId ?? "unknown"}`,
  tier,
  ownerInstanceId,
  state: "none",
  burnRateCentsPerMinute: 0,
  environmentVersionId: "env_v0",
  injectedCredentialIds: [],
  injectedVariableKeys: [],
  environmentAccessMode: "inherit",
});

export function defaultMissionState(): MissionStateJson {
  return {
    turnQueue: [],
    sharedSandbox: emptySandbox("mission"),
    privateSandboxes: {},
    snapshots: { privateLatestR2Keys: {} },
    issues: { total: 0, completed: 0, open: 0, reopened: 0, addedAfterDone: 0 },
    costGuardrailStatus: "ok",
  };
}

function parseMission(row: Record<string, unknown>): MissionRow {
  return {
    id: String(row.id),
    title: String(row.title),
    objective: String(row.objective),
    status: String(row.status),
    ownerType: String(row.owner_type),
    ownerUserId: row.owner_user_id ? String(row.owner_user_id) : null,
    ownerAgentId: row.owner_agent_id ? String(row.owner_agent_id) : null,
    ownerInstanceId: row.owner_instance_id ? String(row.owner_instance_id) : null,
    version: Number(row.version),
    stateJson: JSON.parse(String(row.state_json)) as MissionStateJson,
    missionSpendCents: Number(row.mission_spend_cents),
    llmSpendCents: Number(row.llm_spend_cents),
    sandboxSpendCents: Number(row.sandbox_spend_cents),
    burnRateCentsPerMinute: Number(row.burn_rate_cents_per_minute),
    dailyBudgetCents: Number(row.daily_budget_cents),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export async function getMission(db: EdgeSparkDb, missionId: string): Promise<MissionRow> {
  const row = await db.prepare("select * from missions where id = ?").bind(missionId).first();
  if (!row) throw new Error("error.mission.not_found");
  return parseMission(row);
}

export async function updateMission(
  db: EdgeSparkDb,
  missionId: string,
  mutate: (current: MissionRow) => MissionRow,
): Promise<MissionRow> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const current = await getMission(db, missionId);
    const next = mutate(structuredClone(current));
    next.updatedAt = new Date().toISOString();
    const result = await db
      .prepare(
        `update missions
         set state_json = ?, mission_spend_cents = ?, llm_spend_cents = ?,
             sandbox_spend_cents = ?, burn_rate_cents_per_minute = ?,
             daily_budget_cents = ?, version = version + 1, updated_at = ?
         where id = ? and version = ?`,
      )
      .bind(
        JSON.stringify(next.stateJson),
        next.missionSpendCents,
        next.llmSpendCents,
        next.sandboxSpendCents,
        next.burnRateCentsPerMinute,
        next.dailyBudgetCents,
        next.updatedAt,
        missionId,
        current.version,
      )
      .run();
    if (result.meta.changes > 0) return getMission(db, missionId);
  }
  throw new Error("error.mission.version_conflict");
}

export async function recordCost(db: EdgeSparkDb, event: CostRecord): Promise<MissionRow> {
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  await db
    .prepare(
      `insert into mission_spend
       (id, mission_id, client_action_id, agent_id, instance_id, model, prompt_tokens,
        completion_tokens, cost_cents, sandbox_id, sandbox_seconds, event_type, created_at)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      event.missionId,
      event.clientActionId ?? null,
      event.agentId ?? null,
      event.instanceId ?? null,
      event.model ?? null,
      event.promptTokens ?? null,
      event.completionTokens ?? null,
      event.costCents,
      event.sandboxId ?? null,
      event.sandboxSeconds ?? null,
      event.eventType,
      createdAt,
    )
    .run();

  return updateMission(db, event.missionId, (mission) => {
    mission.missionSpendCents += event.costCents;
    if (event.eventType === "sandbox_burn") mission.sandboxSpendCents += event.costCents;
    if (event.eventType === "cost_event") mission.llmSpendCents += event.costCents;
    mission.burnRateCentsPerMinute =
      mission.stateJson.sharedSandbox.state === "running" ? mission.stateJson.sharedSandbox.burnRateCentsPerMinute : 0;
    mission.burnRateCentsPerMinute += Object.values(mission.stateJson.privateSandboxes)
      .filter((ref) => ref.state === "running")
      .reduce((sum, ref) => sum + ref.burnRateCentsPerMinute, 0);
    if (mission.dailyBudgetCents > 0 && mission.missionSpendCents >= mission.dailyBudgetCents) {
      mission.stateJson.costGuardrailStatus = "daily_cap_hit";
    }
    return mission;
  });
}

export async function recordAudit(db: EdgeSparkDb, event: AuditRecord): Promise<string> {
  const id = crypto.randomUUID();
  const eventId = `evt_${id}`;
  await db
    .prepare(
      `insert into audit_events
       (id, event_id, mission_id, subject_type, subject_id, actor_json, action,
        client_action_id, diff_summary, payload_ref_json, reversible, rollback_available, created_at)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      eventId,
      event.missionId ?? null,
      event.subjectType,
      event.subjectId,
      JSON.stringify(event.actor),
      event.action,
      event.clientActionId ?? null,
      event.diffSummary,
      event.payloadRef ? JSON.stringify(event.payloadRef) : null,
      event.reversible ? 1 : 0,
      event.rollbackAvailable ? 1 : 0,
      new Date().toISOString(),
    )
    .run();
  return eventId;
}

export async function listIdleSandboxes(db: EdgeSparkDb, idleMs: number, now = Date.now()) {
  const result = await db.prepare("select * from missions where state_json like '%running%'").all();
  const rows = (result.results ?? []).map(parseMission);
  const idle: Array<{ mission: MissionRow; ref: SandboxRef; target: "mission" | "private"; instanceId?: string }> = [];
  for (const mission of rows) {
    const shared = mission.stateJson.sharedSandbox;
    if (shared.state === "running" && shared.lastActivityAt && now - Date.parse(shared.lastActivityAt) >= idleMs) {
      idle.push({ mission, ref: shared, target: "mission" });
    }
    for (const [instanceId, ref] of Object.entries(mission.stateJson.privateSandboxes)) {
      if (ref.state === "running" && ref.lastActivityAt && now - Date.parse(ref.lastActivityAt) >= idleMs) {
        idle.push({ mission, ref, target: "private", instanceId });
      }
    }
  }
  return idle;
}
