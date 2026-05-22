import { db } from "edgespark";
import { and, eq, inArray, lte, sql } from "drizzle-orm";
import { agents, auditEvents, missionSpend, missions, sandboxRuntime, usersProfile, workCards } from "../defs/db_schema";

export type SandboxTier = "mission" | "private";
export type SandboxState = "none" | "starting" | "running" | "paused" | "resuming" | "killed" | "error";

export type SandboxRef = {
  sandboxId: string;
  tier: SandboxTier;
  ownerInstanceId?: string;
  state: SandboxState;
  e2bSandboxId?: string;
  envdAccessToken?: string | null;
  envdHost?: string | null;
  lastActivityAt?: string;
  activeSince?: string;
  burnRateCentsPerMinute: number;
  environmentVersionId: string;
  injectedCredentialIds: string[];
  injectedVariableKeys: string[];
  environmentAccessMode: "inherit" | "restricted" | "blocked";
};

export type MissionStateJson = {
  /** Retired: work_cards is the authoritative FIFO queue. Kept optional for old rows. */
  turnQueue?: Array<Record<string, unknown>>;
  sharedSandbox: SandboxRef;
  privateSandboxes: Record<string, SandboxRef>;
  snapshots: {
    sharedLatestR2Key?: string;
    privateLatestR2Keys: Record<string, string>;
    sharedLatestE2B?: Record<string, unknown>;
    privateLatestE2BRefs?: Record<string, Record<string, unknown>>;
    lastSnapshotAt?: string;
    lastRestoreAt?: string;
  };
  environment?: {
    vars: Record<string, string>;
    credentialRefs?: string[];
    updatedAt?: string;
  };
  issues: { total: number; completed: number; open: number; reopened: number; addedAfterDone: number };
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
  payloadRef?: { r2Key: string; sha256?: string; previousBody?: string; authoredAgainstAuditHeadId?: string | null; rollbackOfEventId?: string };
  reversible?: boolean;
  rollbackAvailable?: boolean;
};

export type UserProfileRow = typeof usersProfile.$inferSelect;

const now = () => new Date().toISOString();
const DAY_MS = 24 * 60 * 60 * 1000;

const emptySandbox = (tier: SandboxTier, missionId: string, ownerInstanceId?: string): SandboxRef => ({
  sandboxId: tier === "mission" ? `mission:${missionId}` : `agent:${missionId}:${ownerInstanceId ?? "unknown"}`,
  tier,
  ownerInstanceId,
  state: "none",
  burnRateCentsPerMinute: 0,
  environmentVersionId: "env_v0",
  injectedCredentialIds: [],
  injectedVariableKeys: [],
  environmentAccessMode: "inherit",
});

export function defaultMissionState(missionId = "new"): MissionStateJson {
  return {
    sharedSandbox: emptySandbox("mission", missionId),
    privateSandboxes: {},
    snapshots: { privateLatestR2Keys: {} },
    environment: { vars: {}, credentialRefs: [] },
    issues: { total: 0, completed: 0, open: 0, reopened: 0, addedAfterDone: 0 },
    costGuardrailStatus: "ok",
  };
}

export function privateSandboxSlot(missionId: string, instanceId: string): SandboxRef {
  return emptySandbox("private", missionId, instanceId);
}

function parseMission(row: typeof missions.$inferSelect): MissionRow {
  const stateJson = JSON.parse(row.stateJson) as MissionStateJson;
  return { ...row, stateJson };
}

function missionBurnRate(state: MissionStateJson) {
  const shared = state.sharedSandbox.state === "running" ? state.sharedSandbox.burnRateCentsPerMinute : 0;
  return Object.values(state.privateSandboxes)
    .filter((ref) => ref.state === "running")
    .reduce((sum, ref) => sum + ref.burnRateCentsPerMinute, shared);
}

export async function getMission(missionId: string): Promise<MissionRow> {
  const [row] = await db.select().from(missions).where(eq(missions.id, missionId)).limit(1);
  if (!row) throw new Error("error.mission.not_found");
  return parseMission(row);
}

export async function updateMission(missionId: string, mutate: (current: MissionRow) => MissionRow): Promise<MissionRow> {
  const maxAttempts = 8;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const current = await getMission(missionId);
    const next = mutate(structuredClone(current));
    next.updatedAt = now();
    next.burnRateCentsPerMinute = missionBurnRate(next.stateJson);
    const rows = await db
      .update(missions)
      .set({
        title: next.title,
        objective: next.objective,
        status: next.status,
        stateJson: JSON.stringify(next.stateJson),
        burnRateCentsPerMinute: next.burnRateCentsPerMinute,
        dailyBudgetCents: next.dailyBudgetCents,
        version: current.version + 1,
        updatedAt: next.updatedAt,
      })
      .where(and(eq(missions.id, missionId), eq(missions.version, current.version)))
      .returning();
    if (rows.length > 0) return parseMission(rows[0]);
    await new Promise((resolve) => setTimeout(resolve, Math.min(100, 10 * 2 ** attempt)));
  }
  throw new Error("error.mission.version_conflict");
}

export function sandboxRefFromRuntime(row: typeof sandboxRuntime.$inferSelect): SandboxRef {
  return {
    sandboxId: row.sandboxId,
    tier: row.tier === "private" ? "private" : "mission",
    ownerInstanceId: row.instanceId ?? undefined,
    state: row.state as SandboxState,
    e2bSandboxId: row.e2bSandboxId ?? undefined,
    envdAccessToken: row.envdAccessToken ?? null,
    envdHost: row.envdHost ?? null,
    lastActivityAt: row.lastActivityAt ?? undefined,
    activeSince: row.activeSince ?? undefined,
    burnRateCentsPerMinute: row.burnRateCentsPerMinute,
    environmentVersionId: row.e2bSandboxId ? "env_v1" : "env_v0",
    injectedCredentialIds: [],
    injectedVariableKeys: ["MISSION_ID"],
    environmentAccessMode: "inherit",
  };
}

export async function getMissionWithRuntimeSandboxes(missionId: string): Promise<MissionRow> {
  const mission = await getMission(missionId);
  const rows = await db.select().from(sandboxRuntime).where(eq(sandboxRuntime.missionId, missionId));
  for (const row of rows) {
    const ref = sandboxRefFromRuntime(row);
    if (ref.tier === "mission") mission.stateJson.sharedSandbox = ref;
    else if (ref.ownerInstanceId) mission.stateJson.privateSandboxes[ref.ownerInstanceId] = ref;
  }
  mission.burnRateCentsPerMinute = missionBurnRate(mission.stateJson);
  return mission;
}

export async function updateMissionRuntimeSnapshot(missionId: string): Promise<MissionRow> {
  const mission = await getMissionWithRuntimeSandboxes(missionId);
  return updateMission(missionId, (current) => {
    current.stateJson.sharedSandbox = mission.stateJson.sharedSandbox;
    current.stateJson.privateSandboxes = mission.stateJson.privateSandboxes;
    return current;
  });
}

export async function recordCost(event: CostRecord): Promise<MissionRow> {
  const createdAt = now();
  const timestamp = now();
  await db.batch([
    db.insert(missionSpend).values({
      id: crypto.randomUUID(),
      missionId: event.missionId,
      clientActionId: event.clientActionId ?? null,
      agentId: event.agentId ?? null,
      instanceId: event.instanceId ?? null,
      model: event.model ?? null,
      promptTokens: event.promptTokens ?? null,
      completionTokens: event.completionTokens ?? null,
      costCents: event.costCents,
      sandboxId: event.sandboxId ?? null,
      sandboxSeconds: event.sandboxSeconds ?? null,
      eventType: event.eventType,
      createdAt,
    }),
    db
      .update(missions)
      .set({
        missionSpendCents: sql`${missions.missionSpendCents} + ${event.costCents}`,
        llmSpendCents: event.eventType === "cost_event" ? sql`${missions.llmSpendCents} + ${event.costCents}` : sql`${missions.llmSpendCents}`,
        sandboxSpendCents: event.eventType === "sandbox_burn" ? sql`${missions.sandboxSpendCents} + ${event.costCents}` : sql`${missions.sandboxSpendCents}`,
        updatedAt: timestamp,
      })
      .where(eq(missions.id, event.missionId)),
  ]);
  let missionAfterSpend = await getMission(event.missionId);
  if (missionAfterSpend.dailyBudgetCents > 0 && missionAfterSpend.missionSpendCents >= missionAfterSpend.dailyBudgetCents && missionAfterSpend.stateJson.costGuardrailStatus !== "daily_cap_hit") {
    missionAfterSpend = await updateMission(event.missionId, (mission) => {
      mission.stateJson.costGuardrailStatus = "daily_cap_hit";
      return mission;
    });
  }
  await addUserDailySpend(missionAfterSpend.ownerUserId ?? "system", event.costCents);
  return missionAfterSpend;
}

export async function assertUserBudgetForMission(missionId: string, estimatedCostCents: number) {
  const mission = await getMission(missionId);
  const userId = mission.ownerUserId ?? "system";
  const profile = await getOrCreateBudgetProfile(userId);
  if (profile.dailySpendCents + estimatedCostCents <= profile.dailyBudgetCents) return profile;
  await recordAudit({
    missionId,
    subjectType: "user",
    subjectId: userId,
    actor: { type: "system", id: "budget" },
    action: "daily_budget_cap_hit",
    diffSummary: `daily_spend_cents:${profile.dailySpendCents};estimated:${estimatedCostCents};cap:${profile.dailyBudgetCents}`,
  });
  throw new Error("error.user.daily_cap_hit");
}

export const BudgetService = {
  assertCanSpend: assertUserBudgetForMission,
};

export async function recordAudit(event: AuditRecord): Promise<string> {
  const id = crypto.randomUUID();
  const eventId = `evt_${id}`;
  await db.insert(auditEvents).values({
    id,
    eventId,
    missionId: event.missionId ?? null,
    subjectType: event.subjectType,
    subjectId: event.subjectId,
    actorJson: JSON.stringify(event.actor),
    action: event.action,
    clientActionId: event.clientActionId ?? null,
    diffSummary: event.diffSummary,
    payloadRefJson: event.payloadRef ? JSON.stringify(event.payloadRef) : null,
    reversible: event.reversible ? 1 : 0,
    rollbackAvailable: event.rollbackAvailable ? 1 : 0,
    createdAt: now(),
  });
  if (event.subjectType === "agent") {
    await db.update(agents).set({ auditHeadId: eventId, updatedAt: now() }).where(eq(agents.id, event.subjectId));
  }
  return eventId;
}

async function addUserDailySpend(userId: string, costCents: number) {
  await getOrCreateBudgetProfile(userId);
  await db
    .update(usersProfile)
    .set({
      dailySpendCents: sql`${usersProfile.dailySpendCents} + ${costCents}`,
      updatedAt: now(),
    })
    .where(eq(usersProfile.userId, userId));
}

async function getOrCreateBudgetProfile(userId: string): Promise<UserProfileRow> {
  const [existing] = await db.select().from(usersProfile).where(eq(usersProfile.userId, userId)).limit(1);
  if (existing) return resetDailyWindowIfNeeded(existing);
  const timestamp = now();
  const email = userId === "system" ? "system@missionry.local" : `${userId}@missionry.local`;
  await db.insert(usersProfile).values({
    userId,
    email,
    role: userId === "system" ? "admin" : "user",
    dailyBudgetCents: userId === "system" ? 999999 : 2000,
    dailySpendCents: 0,
    dailyWindowStartAt: timestamp,
    createdAt: timestamp,
    updatedAt: timestamp,
  }).onConflictDoNothing();
  const [created] = await db.select().from(usersProfile).where(eq(usersProfile.userId, userId)).limit(1);
  if (!created) throw new Error("error.user_profile.create_failed");
  return created;
}

async function resetDailyWindowIfNeeded(profile: UserProfileRow): Promise<UserProfileRow> {
  if (Date.now() - Date.parse(profile.dailyWindowStartAt) < DAY_MS) return profile;
  const timestamp = now();
  const [updated] = await db
    .update(usersProfile)
    .set({ dailySpendCents: 0, dailyWindowStartAt: timestamp, updatedAt: timestamp })
    .where(eq(usersProfile.userId, profile.userId))
    .returning();
  return updated ?? { ...profile, dailySpendCents: 0, dailyWindowStartAt: timestamp, updatedAt: timestamp };
}

export async function upsertSandboxRuntime(ref: SandboxRef, missionId: string) {
  const existing = await db.select().from(sandboxRuntime).where(eq(sandboxRuntime.sandboxId, ref.sandboxId)).limit(1);
  const values = {
    sandboxId: ref.sandboxId,
    missionId,
    instanceId: ref.ownerInstanceId ?? null,
    tier: ref.tier,
    state: ref.state,
    e2bSandboxId: ref.e2bSandboxId ?? null,
    envdAccessToken: ref.envdAccessToken ?? null,
    envdHost: ref.envdHost ?? null,
    lastActivityAt: ref.lastActivityAt ?? null,
    activeSince: ref.activeSince ?? null,
    burnRateCentsPerMinute: ref.burnRateCentsPerMinute,
    updatedAt: now(),
  };
  if (existing.length > 0) {
    await db.update(sandboxRuntime).set(values).where(eq(sandboxRuntime.sandboxId, ref.sandboxId));
  } else {
    await db.insert(sandboxRuntime).values(values);
  }
}

export async function updateSandboxRuntimeOnly(ref: SandboxRef, missionId: string) {
  await upsertSandboxRuntime(ref, missionId);
}

export async function reserveMissionSandboxSlot(missionId: string) {
  await upsertSandboxRuntime(emptySandbox("mission", missionId), missionId);
}

export async function reservePrivateSandboxSlot(missionId: string, instanceId: string) {
  await upsertSandboxRuntime(privateSandboxSlot(missionId, instanceId), missionId);
}

export async function listIdleSandboxes(idleMs: number, timestamp = Date.now()) {
  const cutoff = new Date(timestamp - idleMs).toISOString();
  const rows = await db
    .select()
    .from(sandboxRuntime)
    .where(and(eq(sandboxRuntime.state, "running"), lte(sandboxRuntime.lastActivityAt, cutoff)));
  if (rows.length === 0) return [];
  // Never pause a sandbox whose mission still has an in-flight work card: the
  // agent runner executes INSIDE the sandbox, so pausing would freeze the task
  // mid-run and make its files vanish from the artifacts view.
  const activeCardRows = await db
    .select({ missionId: workCards.missionId })
    .from(workCards)
    .where(inArray(workCards.status, ["running", "allocated", "assigned"]));
  const activeCardMissionIds = new Set(activeCardRows.map((row: { missionId: string }) => row.missionId));
  const idle: Array<{ mission: MissionRow; ref: SandboxRef; target: "mission" | "private"; instanceId?: string }> = [];
  for (const row of rows) {
    if (activeCardMissionIds.has(row.missionId)) continue;
    const instanceId = row.instanceId ?? undefined;
    const mission = await getMissionWithRuntimeSandboxes(row.missionId);
    idle.push({ mission, ref: sandboxRefFromRuntime(row), target: row.tier === "mission" ? "mission" : "private", instanceId });
  }
  return idle;
}
