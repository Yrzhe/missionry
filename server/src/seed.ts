import { db } from "edgespark";
import { ensureAgentFiles, ensureAgentInstanceFiles } from "./agents/files";
import { agentInstances, agents, missions, workCards } from "./defs/db_schema";
import { defaultMissionState, reserveMissionSandboxSlot, reservePrivateSandboxSlot } from "./state/missionState";

const now = () => new Date().toISOString();

export async function seedDemo(requestedMissionId?: string) {
  const missionId = requestedMissionId ?? `mis_${crypto.randomUUID().slice(0, 8)}`;
  const agentA = "agt_forge";
  const agentB = "agt_pixel";
  const instanceA = `ins_${missionId}_forge`;
  const instanceB = `ins_${missionId}_pixel`;
  const timestamp = now();

  await ensureAgentFiles(agentA, "Forge");
  await ensureAgentFiles(agentB, "Pixel");
  await ensureAgentInstanceFiles(missionId, instanceA);
  await ensureAgentInstanceFiles(missionId, instanceB);

  await upsertAgent(agentA, "forge", "Forge", timestamp);
  await upsertAgent(agentB, "pixel", "Pixel", timestamp);

  const state = defaultMissionState(missionId);
  state.issues = { total: 2, completed: 0, open: 2, reopened: 0, addedAfterDone: 0 };
  await db.insert(missions).values({
    id: missionId,
    title: `Phase 1 demo ${missionId}`,
    objective: "Prove EdgeSpark + E2B lazy dual-sandbox isolation",
    status: "active",
    ownerType: "agent",
    ownerUserId: null,
    ownerAgentId: agentA,
    ownerInstanceId: instanceA,
    version: 0,
    stateJson: JSON.stringify(state),
    missionSpendCents: 0,
    llmSpendCents: 0,
    sandboxSpendCents: 0,
    burnRateCentsPerMinute: 0,
    dailyBudgetCents: 500,
    createdAt: timestamp,
    updatedAt: timestamp,
  }).onConflictDoNothing();
  await reserveMissionSandboxSlot(missionId);

  await upsertInstance(missionId, instanceA, agentA, "owner", "Forge", timestamp);
  await upsertInstance(missionId, instanceB, agentB, "member", "Pixel", timestamp);
  await reservePrivateSandboxSlot(missionId, instanceA);
  await reservePrivateSandboxSlot(missionId, instanceB);
  await createDemoWorkCard(missionId, `wc_shared_${missionId}`, instanceA, "mission", "Shared Tier 1 command and file");
  await createDemoWorkCard(missionId, `wc_private_${missionId}`, instanceA, "private", "Private Tier 2 escalation");
  return { missionId, agents: [agentA, agentB], instances: [instanceA, instanceB] };
}

export async function createDemoWorkCard(
  missionId: string,
  workCardId: string,
  assigneeInstanceId: string,
  tier: "mission" | "private" | "tier0",
  title: string,
) {
  const timestamp = now();
  await db.insert(workCards).values({
    id: workCardId,
    missionId,
    title,
    description: null,
    pmInstanceId: assigneeInstanceId,
    assigneeInstanceId,
    status: "pending",
    priority: "high",
    sandboxAffinityJson: JSON.stringify({ tier, reason: "Phase 1 demo" }),
    dependenciesJson: JSON.stringify([]),
    issueIdsJson: JSON.stringify([]),
    costJson: JSON.stringify({ spentCents: 0 }),
    createdAt: timestamp,
    updatedAt: timestamp,
  }).onConflictDoNothing();
}

async function upsertAgent(agentId: string, slug: string, name: string, timestamp: string) {
  await db.insert(agents).values({
    id: agentId,
    slug,
    displayName: name,
    avatarJson: JSON.stringify({ avatarSource: "random", avatarSeed: agentId }),
    globalIdentityJson: JSON.stringify({ displayName: name, role: "demo agent", version: "v1" }),
    equippedSkillIdsJson: JSON.stringify(agentId === "agt_forge" ? ["demo-sandbox", "prd-template-v2"] : ["demo-sandbox"]),
    r2Prefix: `agents/${agentId}/`,
    auditHeadId: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  }).onConflictDoNothing();
}

async function upsertInstance(missionId: string, instanceId: string, agentId: string, role: string, alias: string, timestamp: string) {
  await db.insert(agentInstances).values({
    id: instanceId,
    missionId,
    agentId,
    role,
    displayAlias: alias,
    workStateJson: JSON.stringify({ status: "idle" }),
    isolationJson: JSON.stringify({ defaultPolicy: "deny_cross_project", allowedReadGrantIds: [] }),
    equippedSkillOverridesJson: JSON.stringify({ addSkillIds: [], removeSkillIds: [], effectiveSkillIds: ["demo-sandbox"] }),
    r2Prefix: `missions/${missionId}/agent-instances/${instanceId}/`,
    createdAt: timestamp,
    updatedAt: timestamp,
  }).onConflictDoNothing();
}
