import { createOpenAI } from "@ai-sdk/openai";
import { db, storage, secret, vars, ctx } from "edgespark";
import { auth } from "edgespark/http";
import { and, asc, desc, eq, ne } from "drizzle-orm";
import { generateText } from "ai";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { ensureAgentFiles, ensureAgentInstanceFiles } from "./agents/files";
import { agentInstances, agents, auditEvents, missionSpend, missions, usersProfile, whitelistEntries, workCards } from "./defs/db_schema";
import { buckets } from "./defs/storage_schema";
import { seedDemo } from "./seed";
import * as e2b from "./sandbox/e2b";
import { emitCostEvent, recentMissionEvents } from "./sse/events";
import {
  defaultMissionState,
  getMission,
  listIdleSandboxes,
  privateSandboxSlot,
  recordAudit,
  reserveMissionSandboxSlot,
  reservePrivateSandboxSlot,
  updateMission,
} from "./state/missionState";

type OwnerInput = { type: "user" | "agent"; agentId?: string; userId?: string };
type SandboxAffinityInput = { tier: "tier0" | "mission" | "private"; reason: string };
type WorkCardInput = {
  title: string;
  description?: string;
  assigneeInstanceId: string;
  sandboxAffinity: SandboxAffinityInput;
  demoAction?: string;
  path?: string;
  content?: string;
  command?: string;
  activate?: boolean;
};
type UserProfile = typeof usersProfile.$inferSelect;

const app = new Hono();
const now = () => new Date().toISOString();
const SUPER_ADMIN_EMAIL = "qq1514337391@gmail.com";
const DAY_MS = 24 * 60 * 60 * 1000;

app.onError((err, c) => {
  console.error("HANDLER ERROR:", err);
  const message = String(err instanceof Error ? err.message : err);
  if (message.startsWith("error.")) {
    const status = message === "error.user.daily_cap_hit" ? 402 : 400;
    return c.json({ error: { code: message, messageKey: message } }, status as never);
  }
  return c.json({ error: { code: "error.internal", messageKey: "error.internal" }, detail: message }, 500);
});

function jsonError(c: any, code: string, status = 400) {
  return c.json({ error: { code, messageKey: code } }, status);
}

function currentUserProfile(c: any): UserProfile {
  return c.get("userProfile") as UserProfile;
}

function isDevAdminOverride() {
  return vars.get("EDGESPARK_DEV_AS_ADMIN") === "true";
}

async function resolveSessionUser() {
  // EdgeSpark dev curl smoke has no browser login, so EDGESPARK_DEV_AS_ADMIN
  // intentionally treats the request as the hardcoded super-admin.
  if (isDevAdminOverride()) return { userId: "dev_super_admin", email: SUPER_ADMIN_EMAIL };
  const authAny = auth as any;
  const raw = typeof authAny.user === "function" ? await authAny.user() : authAny.user;
  const user = raw?.user ?? raw;
  const userId = user?.id ?? user?.userId;
  const email = user?.email;
  if (!userId || !email) return null;
  return { userId: String(userId), email: String(email).toLowerCase() };
}

async function resolveRole(email: string) {
  const normalized = email.toLowerCase();
  if (normalized === SUPER_ADMIN_EMAIL) return "admin";
  const entries = await db.select().from(whitelistEntries).where(eq(whitelistEntries.enabled, 1));
  const allowed = entries.some((entry: typeof whitelistEntries.$inferSelect) => {
    const value = entry.value.toLowerCase();
    return entry.type === "email" ? normalized === value : normalized.endsWith(value);
  });
  return allowed ? "user" : null;
}

async function upsertUserProfile(userId: string, email: string, role: "admin" | "user") {
  const timestamp = now();
  const [existing] = await db.select().from(usersProfile).where(eq(usersProfile.userId, userId)).limit(1);
  if (!existing) {
    await db.insert(usersProfile).values({
      userId,
      email,
      role,
      dailyBudgetCents: 2000,
      dailySpendCents: 0,
      dailyWindowStartAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    return (await db.select().from(usersProfile).where(eq(usersProfile.userId, userId)).limit(1))[0] as UserProfile;
  }
  const shouldReset = Date.now() - Date.parse(existing.dailyWindowStartAt) >= DAY_MS;
  const [updated] = await db
    .update(usersProfile)
    .set({
      email,
      role,
      dailySpendCents: shouldReset ? 0 : existing.dailySpendCents,
      dailyWindowStartAt: shouldReset ? timestamp : existing.dailyWindowStartAt,
      updatedAt: timestamp,
    })
    .where(eq(usersProfile.userId, userId))
    .returning();
  return updated as UserProfile;
}

async function resolveRequestProfile(c: any) {
  const session = await resolveSessionUser();
  if (!session) return null;
  const role = await resolveRole(session.email);
  if (!role) return null;
  return upsertUserProfile(session.userId, session.email, role);
}

function requireAdmin(c: any) {
  const profile = currentUserProfile(c);
  if (profile.role !== "admin") return jsonError(c, "error.auth.admin_required", 403);
  return null;
}

function rowMission(row: typeof missions.$inferSelect) {
  return { ...row, stateJson: JSON.parse(row.stateJson) };
}

function workCardJson(row: typeof workCards.$inferSelect) {
  return {
    id: row.id,
    missionId: row.missionId,
    title: row.title,
    description: row.description,
    assigneeInstanceId: row.assigneeInstanceId,
    status: row.status,
    priority: row.priority,
    sandboxAffinity: JSON.parse(row.sandboxAffinityJson),
    dependencies: JSON.parse(row.dependenciesJson),
    issueIds: JSON.parse(row.issueIdsJson),
    cost: JSON.parse(row.costJson),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function ensureAgent(agentId: string, displayName = agentId) {
  await ensureAgentFiles(agentId, displayName);
  const [existing] = await db.select().from(agents).where(eq(agents.id, agentId)).limit(1);
  if (existing) return;
  await db.insert(agents).values({
    id: agentId,
    slug: agentId.replace(/^agt_/, ""),
    displayName,
    avatarJson: JSON.stringify({ avatarSource: "random", avatarSeed: agentId }),
    globalIdentityJson: JSON.stringify({ displayName, role: "agent", version: "v1" }),
    equippedSkillIdsJson: JSON.stringify(["demo-sandbox"]),
    r2Prefix: `agents/${agentId}/`,
    auditHeadId: null,
    createdAt: now(),
    updatedAt: now(),
  });
}

async function attachInstance(missionId: string, agentId: string, role = "member") {
  await ensureAgent(agentId, agentId.replace(/^agt_/, ""));
  const [existing] = await db
    .select()
    .from(agentInstances)
    .where(and(eq(agentInstances.missionId, missionId), eq(agentInstances.agentId, agentId)))
    .limit(1);
  if (existing) return existing.id;

  const instanceId = `ins_${missionId}_${agentId.replace(/^agt_/, "")}`;
  await ensureAgentInstanceFiles(missionId, instanceId);
  await db.insert(agentInstances).values({
    id: instanceId,
    missionId,
    agentId,
    role,
    displayAlias: agentId,
    workStateJson: JSON.stringify({ status: "idle" }),
    isolationJson: JSON.stringify({ defaultPolicy: "deny_cross_project", allowedReadGrantIds: [] }),
    equippedSkillOverridesJson: JSON.stringify({ addSkillIds: [], removeSkillIds: [], effectiveSkillIds: ["demo-sandbox"] }),
    r2Prefix: `missions/${missionId}/agent-instances/${instanceId}/`,
    createdAt: now(),
    updatedAt: now(),
  });
  await updateMission(missionId, (mission) => {
    mission.stateJson.privateSandboxes[instanceId] = privateSandboxSlot(missionId, instanceId);
    return mission;
  });
  await reservePrivateSandboxSlot(missionId, instanceId);
  return instanceId;
}

async function agentForInstance(instanceId: string) {
  const [row] = await db.select().from(agentInstances).where(eq(agentInstances.id, instanceId)).limit(1);
  if (!row) throw new Error("error.agent_instance.not_found");
  return row.agentId;
}

async function hasRunningCard(agentId: string, excludeCardId?: string) {
  const clauses = [eq(agentInstances.agentId, agentId), eq(workCards.status, "running")];
  if (excludeCardId) clauses.push(ne(workCards.id, excludeCardId));
  const rows = await db
    .select({ id: workCards.id })
    .from(workCards)
    .innerJoin(agentInstances, eq(agentInstances.id, workCards.assigneeInstanceId))
    .where(and(...clauses))
    .limit(1);
  return rows.length > 0;
}

async function createQueuedWorkCard(missionId: string, input: WorkCardInput) {
  const agentId = await agentForInstance(input.assigneeInstanceId);
  const status = input.activate === false || (await hasRunningCard(agentId)) ? "pending" : "running";
  const workCardId = `wc_${crypto.randomUUID().slice(0, 8)}`;
  await db.insert(workCards).values({
    id: workCardId,
    missionId,
    title: input.title,
    description: input.description ?? null,
    pmInstanceId: input.assigneeInstanceId,
    assigneeInstanceId: input.assigneeInstanceId,
    status,
    priority: "medium",
    sandboxAffinityJson: JSON.stringify(input.sandboxAffinity),
    dependenciesJson: JSON.stringify([]),
    issueIdsJson: JSON.stringify([]),
    costJson: JSON.stringify({ spentCents: 0 }),
    createdAt: now(),
    updatedAt: now(),
  });
  if (status === "running") {
    try {
      await triggerWorkCard(missionId, workCardId, input);
    } catch (error) {
      await db.update(workCards).set({ status: "failed", updatedAt: now() }).where(eq(workCards.id, workCardId));
      throw error;
    }
  }
  return { workCardId, status };
}

async function triggerWorkCard(missionId: string, workCardId: string, input: WorkCardInput) {
  await recordAudit({
    missionId,
    subjectType: "work_card",
    subjectId: workCardId,
    actor: { type: "system", id: "queue" },
    action: "work_card_allocated",
    diffSummary: "work_card.running",
  });
  if (!input.demoAction) return;
  if (input.demoAction === "run_shared") {
    const ref = await e2b.startShared(missionId);
    const result = await e2b.runCommand(ref, input.command ?? "pwd");
    await emitCostEvent({
      missionId,
      instanceId: input.assigneeInstanceId,
      costCents: 1,
      sandboxId: ref.sandboxId,
      sandboxSeconds: 1,
      eventType: "sandbox_burn",
    });
    await recordAudit({
      missionId,
      subjectType: "work_card",
      subjectId: workCardId,
      actor: { type: "system", id: "runtime" },
      action: result.exitCode === 0 ? "tool_completed" : "tool_failed",
      diffSummary: JSON.stringify({ exitCode: result.exitCode, stderr: result.stderr }),
    });
  }
  if (input.demoAction === "write_shared") {
    const ref = await e2b.startShared(missionId);
    await e2b.writeFile(ref, input.path ?? "/workspace/shared.txt", input.content ?? "shared");
  }
  if (input.demoAction === "read_shared") {
    const ref = await e2b.startShared(missionId);
    await e2b.readFile(ref, input.path ?? "/workspace/shared.txt");
  }
  if (input.demoAction === "escalate_private") {
    const ref = await e2b.startPrivate(missionId, input.assigneeInstanceId);
    await e2b.writeFile(ref, input.path ?? "/workspace/private.txt", input.content ?? "private");
  }
}

async function promoteNextPending(agentId: string) {
  const rows = await db
    .select({ card: workCards })
    .from(workCards)
    .innerJoin(agentInstances, eq(agentInstances.id, workCards.assigneeInstanceId))
    .where(and(eq(agentInstances.agentId, agentId), eq(workCards.status, "pending")))
    .orderBy(asc(workCards.createdAt))
    .limit(1);
  const row = rows[0]?.card;
  if (!row) return null;
  await db.update(workCards).set({ status: "running", updatedAt: now() }).where(eq(workCards.id, row.id));
  await triggerWorkCard(row.missionId, row.id, {
    title: row.title,
    assigneeInstanceId: row.assigneeInstanceId ?? "",
    sandboxAffinity: JSON.parse(row.sandboxAffinityJson),
  });
  return row.id;
}

async function createMission(input: { title: string; objective: string; owner: OwnerInput; dailyBudgetCents?: number; requestUserId?: string }) {
  const missionId = `mis_${crypto.randomUUID().slice(0, 10)}`;
  const state = defaultMissionState(missionId);
  const timestamp = now();
  let ownerInstanceId: string | null = null;
  await db.insert(missions).values({
    id: missionId,
    title: input.title,
    objective: input.objective,
    status: "active",
    ownerType: input.owner.type,
    ownerUserId: input.owner.type === "user" ? input.owner.userId ?? input.requestUserId ?? "user_local" : input.requestUserId ?? null,
    ownerAgentId: input.owner.type === "agent" ? input.owner.agentId ?? null : null,
    ownerInstanceId: null,
    version: 0,
    stateJson: JSON.stringify(state),
    missionSpendCents: 0,
    llmSpendCents: 0,
    sandboxSpendCents: 0,
    burnRateCentsPerMinute: 0,
    dailyBudgetCents: input.dailyBudgetCents ?? 500,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  await reserveMissionSandboxSlot(missionId);
  if (input.owner.type === "agent" && input.owner.agentId) {
    ownerInstanceId = await attachInstance(missionId, input.owner.agentId, "owner");
    await db.update(missions).set({ ownerInstanceId, updatedAt: now() }).where(eq(missions.id, missionId));
  }
  return { missionId, ownerInstanceId };
}

async function decomposeMission(missionId: string) {
  const mission = await getMission(missionId);
  if (mission.ownerType !== "agent" || !mission.ownerInstanceId || !mission.ownerAgentId) return { created: [] as Array<{ workCardId: string; status: string }> };
  const apiKey = await Promise.resolve(secret.get("OPENAI_API_KEY")).catch(() => undefined);
  if (apiKey) {
    const openai = createOpenAI({ apiKey });
    ctx.runInBackground(
      generateText({
        model: openai("gpt-4o-mini"),
        prompt: `Decompose this Missionry objective into 2-4 concise work cards. Return terse titles only.\nObjective: ${mission.objective}`,
      }).then(() => undefined).catch(() => undefined),
    );
  }
  const cards = [
    await createQueuedWorkCard(missionId, {
      title: "Define execution plan",
      assigneeInstanceId: mission.ownerInstanceId,
      sandboxAffinity: { tier: "tier0", reason: "planning" },
      activate: false,
    }),
    await createQueuedWorkCard(missionId, {
      title: "Run shared workspace smoke",
      assigneeInstanceId: mission.ownerInstanceId,
      sandboxAffinity: { tier: "mission", reason: "shared execution" },
      activate: false,
    }),
  ];
  return { created: cards };
}

app.use("/api/public/*", async (c, next) => {
  if (c.req.path === "/api/public/health") return next();
  const profile = await resolveRequestProfile(c);
  if (!profile) return jsonError(c, "error.auth.not_whitelisted", 403);
  (c as any).set("userProfile", profile);
  await next();
});

app.get("/api/public/health", (c) => c.json({ ok: true, service: "missionry-api", runtime: "edgespark", contract: "v0.6" }));

app.get("/api/public/admin/overview", async (c) => {
  const denied = requireAdmin(c);
  if (denied) return denied;
  const spendRows = await db.select().from(missionSpend);
  const missionRows = await db.select().from(missions);
  const userRows = await db.select().from(usersProfile);
  const totalSpendCents = spendRows.reduce((sum: number, row: typeof missionSpend.$inferSelect) => sum + row.costCents, 0);
  return c.json({
    totalSpendCents,
    missionCount: missionRows.length,
    activeUserCount: userRows.length,
    top5UsersBySpend: userRows
      .slice()
      .sort((a: UserProfile, b: UserProfile) => b.dailySpendCents - a.dailySpendCents)
      .slice(0, 5)
      .map((user: UserProfile) => ({
        userId: user.userId,
        email: user.email,
        role: user.role,
        dailySpendCents: user.dailySpendCents,
        dailyBudgetCents: user.dailyBudgetCents,
      })),
  });
});

app.get("/api/public/admin/missions", async (c) => {
  const denied = requireAdmin(c);
  if (denied) return denied;
  const rows = await db
    .select({ mission: missions, owner: usersProfile })
    .from(missions)
    .leftJoin(usersProfile, eq(usersProfile.userId, missions.ownerUserId))
    .orderBy(desc(missions.updatedAt));
  return c.json({
    items: rows.map(({ mission, owner }: any) => ({
      ...rowMission(mission),
      ownerEmail: owner?.email ?? null,
      spendCents: mission.missionSpendCents,
    })),
  });
});

app.get("/api/public/admin/users", async (c) => {
  const denied = requireAdmin(c);
  if (denied) return denied;
  const rows = await db.select().from(usersProfile).orderBy(desc(usersProfile.updatedAt));
  return c.json({
    items: rows.map((user: UserProfile) => ({
      ...user,
      todaySpendCents: user.dailySpendCents,
    })),
  });
});

app.patch("/api/public/admin/users/:userId", async (c) => {
  const denied = requireAdmin(c);
  if (denied) return denied;
  const body = (await c.req.json().catch(() => ({}))) as { role?: "admin" | "user"; daily_budget_cents?: number; dailyBudgetCents?: number };
  const patch: Record<string, unknown> = { updatedAt: now() };
  if (body.role) patch.role = body.role;
  const dailyBudgetCents = body.dailyBudgetCents ?? body.daily_budget_cents;
  if (dailyBudgetCents !== undefined) patch.dailyBudgetCents = dailyBudgetCents;
  const [updated] = await db.update(usersProfile).set(patch).where(eq(usersProfile.userId, c.req.param("userId"))).returning();
  if (!updated) return jsonError(c, "error.user.not_found", 404);
  return c.json({ actionId: crypto.randomUUID(), status: "completed", user: updated });
});

app.get("/api/public/admin/whitelist", async (c) => {
  const denied = requireAdmin(c);
  if (denied) return denied;
  return c.json({ items: await db.select().from(whitelistEntries).orderBy(desc(whitelistEntries.updatedAt)) });
});

app.post("/api/public/admin/whitelist", async (c) => {
  const denied = requireAdmin(c);
  if (denied) return denied;
  const body = (await c.req.json().catch(() => ({}))) as { type?: "email" | "suffix"; value?: string };
  if (!body.type || !body.value || !["email", "suffix"].includes(body.type)) return jsonError(c, "error.request.invalid", 400);
  const timestamp = now();
  const [entry] = await db
    .insert(whitelistEntries)
    .values({
      id: `wl_${crypto.randomUUID().slice(0, 10)}`,
      type: body.type,
      value: body.value.toLowerCase(),
      enabled: 1,
      createdBy: currentUserProfile(c).userId,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .returning();
  return c.json({ actionId: crypto.randomUUID(), status: "completed", entry });
});

app.patch("/api/public/admin/whitelist/:id", async (c) => {
  const denied = requireAdmin(c);
  if (denied) return denied;
  const body = (await c.req.json().catch(() => ({}))) as { enabled?: boolean | number; value?: string; type?: "email" | "suffix" };
  const patch: Record<string, unknown> = { updatedAt: now() };
  if (body.enabled !== undefined) patch.enabled = body.enabled ? 1 : 0;
  if (body.value) patch.value = body.value.toLowerCase();
  if (body.type) patch.type = body.type;
  const [entry] = await db.update(whitelistEntries).set(patch).where(eq(whitelistEntries.id, c.req.param("id"))).returning();
  if (!entry) return jsonError(c, "error.whitelist.not_found", 404);
  return c.json({ actionId: crypto.randomUUID(), status: "completed", entry });
});

app.delete("/api/public/admin/whitelist/:id", async (c) => {
  const denied = requireAdmin(c);
  if (denied) return denied;
  await db.delete(whitelistEntries).where(eq(whitelistEntries.id, c.req.param("id")));
  return c.json({ actionId: crypto.randomUUID(), status: "completed" });
});

app.get("/api/public/missions", async (c) => {
  const agentId = c.req.query("agentId");
  const ownerAgentId = c.req.query("ownerAgentId");
  const rows = agentId
    ? await db
        .select({ mission: missions })
        .from(missions)
        .innerJoin(agentInstances, eq(agentInstances.missionId, missions.id))
        .where(eq(agentInstances.agentId, agentId))
        .orderBy(desc(missions.updatedAt))
    : ownerAgentId
      ? await db.select().from(missions).where(eq(missions.ownerAgentId, ownerAgentId)).orderBy(desc(missions.updatedAt))
      : await db.select().from(missions).orderBy(desc(missions.updatedAt));
  const items = rows.map((row: any) => row.mission ? rowMission(row.mission) : rowMission(row));
  return c.json({ items });
});

app.post("/api/public/missions/demo", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { missionId?: string };
  return c.json({ actionId: crypto.randomUUID(), status: "completed", ...(await seedDemo(body.missionId)) });
});

app.post("/api/public/missions", async (c) => {
  if (c.req.query("seed") === "true") return c.json({ actionId: crypto.randomUUID(), status: "completed", ...(await seedDemo()) });
  const body = (await c.req.json()) as { title?: string; objective?: string; owner?: OwnerInput; dailyBudgetCents?: number };
  if (!body.title || !body.objective || !body.owner) return jsonError(c, "error.request.invalid", 400);
  const mission = await createMission({
    title: body.title,
    objective: body.objective,
    owner: body.owner,
    dailyBudgetCents: body.dailyBudgetCents,
    requestUserId: currentUserProfile(c).userId,
  });
  if (body.owner.type === "agent") await decomposeMission(mission.missionId);
  return c.json({ actionId: crypto.randomUUID(), status: "completed", ...mission });
});

app.get("/api/public/missions/:id", async (c) => c.json(await getMission(c.req.param("id"))));

app.patch("/api/public/missions/:id", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { title?: string; objective?: string; status?: string; dailyBudgetCents?: number };
  const mission = await updateMission(c.req.param("id"), (current) => ({
    ...current,
    title: body.title ?? current.title,
    objective: body.objective ?? current.objective,
    status: body.status ?? current.status,
    dailyBudgetCents: body.dailyBudgetCents ?? current.dailyBudgetCents,
  }));
  return c.json({ actionId: crypto.randomUUID(), status: "completed", mission });
});

app.post("/api/public/missions/:id/agents/:agentId/instances", async (c) => {
  const instanceId = await attachInstance(c.req.param("id"), c.req.param("agentId"));
  return c.json({ actionId: crypto.randomUUID(), status: "completed", instanceId });
});

app.post("/api/public/missions/:id/decompose", async (c) => c.json({ actionId: crypto.randomUUID(), status: "completed", ...(await decomposeMission(c.req.param("id"))) }));

app.get("/api/public/missions/:id/workroom", async (c) => {
  const mission = await getMission(c.req.param("id"));
  const instanceRows = await db
    .select({ instance: agentInstances, agent: agents })
    .from(agentInstances)
    .innerJoin(agents, eq(agents.id, agentInstances.agentId))
    .where(eq(agentInstances.missionId, mission.id))
    .orderBy(asc(agentInstances.createdAt));
  const cardRows = await db.select().from(workCards).where(eq(workCards.missionId, mission.id)).orderBy(asc(workCards.createdAt));
  const workCardsJson = cardRows.map(workCardJson);
  const activePrivateSandboxes = Object.values(mission.stateJson.privateSandboxes).filter((ref) => ref.state === "running").length;
  return c.json({
    mission: {
      id: mission.id,
      title: mission.title,
      objective: mission.objective,
      status: mission.status,
      updatedAt: mission.updatedAt,
      owner: {
        type: mission.ownerType,
        userId: mission.ownerUserId,
        agentId: mission.ownerAgentId,
        agentInstanceId: mission.ownerInstanceId,
        displayName: mission.ownerAgentId ?? mission.ownerUserId ?? "owner",
        avatar: { avatarSource: "random", avatarSeed: mission.ownerAgentId ?? "user" },
      },
      agentCount: instanceRows.length,
      pendingCount: workCardsJson.filter((card: { status: string }) => card.status !== "done").length,
      artifactCount: 0,
      issues: { ...mission.stateJson.issues, completedRatio: mission.stateJson.issues.total ? mission.stateJson.issues.completed / mission.stateJson.issues.total : 0 },
      budgetCapCents: mission.dailyBudgetCents,
      spentCents: mission.missionSpendCents,
      sandboxSummary: mission.stateJson.sharedSandbox,
    },
    metricStrip: {
      activeSandboxCount: (mission.stateJson.sharedSandbox.state === "running" ? 1 : 0) + activePrivateSandboxes,
      burnRateCentsPerMinute: mission.burnRateCentsPerMinute,
      missionSpendCents: mission.missionSpendCents,
      dailyBudgetCents: mission.dailyBudgetCents,
      privateCap: { maxConcurrentPrivateSandboxes: 2, activePrivateSandboxes },
    },
    workCards: workCardsJson,
    missionSandbox: {
      ...mission.stateJson.sharedSandbox,
      active: mission.stateJson.sharedSandbox.state === "running",
      repoPath: "/workspace/repos/demo",
      r2SnapshotKey: mission.stateJson.snapshots.sharedLatestR2Key,
      processes: [],
    },
    agentInstances: instanceRows.map(({ instance, agent }: any) => ({
      agent: {
        id: agent.id,
        displayName: agent.displayName,
        avatar: JSON.parse(agent.avatarJson),
        globalIdentity: JSON.parse(agent.globalIdentityJson),
      },
      instance: {
        id: instance.id,
        missionId: instance.missionId,
        agentId: instance.agentId,
        displayAlias: instance.displayAlias,
        workState: JSON.parse(instance.workStateJson),
        sandboxSummary: mission.stateJson.privateSandboxes[instance.id] ?? { sandboxId: `agent:${mission.id}:${instance.id}`, state: "none", active: false, burnRateCentsPerMinute: 0 },
      },
      role: instance.role,
    })),
    openIssues: mission.stateJson.issues.open,
    costGuardrailStatus: { state: mission.stateJson.costGuardrailStatus },
    updatedAt: mission.updatedAt,
  });
});

app.post("/api/public/missions/:id/work-cards", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as Partial<WorkCardInput>;
  if (!body.assigneeInstanceId) return jsonError(c, "error.work_card.assignee_required");
  const created = await createQueuedWorkCard(c.req.param("id"), {
    title: body.title ?? "Work card",
    description: body.description,
    assigneeInstanceId: body.assigneeInstanceId,
    sandboxAffinity: body.sandboxAffinity ?? { tier: "tier0", reason: "manual" },
    demoAction: body.demoAction,
    path: body.path,
    content: body.content,
    command: body.command,
    activate: true,
  });
  return c.json({ actionId: crypto.randomUUID(), operationStatus: "completed", ...created });
});

app.patch("/api/public/missions/:id/work-cards/:workCardId", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { status?: string };
  const workCardId = c.req.param("workCardId");
  const [before] = await db.select().from(workCards).where(eq(workCards.id, workCardId)).limit(1);
  if (!before) return jsonError(c, "error.work_card.not_found", 404);
  await db.update(workCards).set({ status: body.status ?? before.status, updatedAt: now() }).where(eq(workCards.id, workCardId));
  let promoted: string | null = null;
  if (body.status === "done" || body.status === "failed") promoted = await promoteNextPending(await agentForInstance(before.assigneeInstanceId ?? ""));
  return c.json({ actionId: crypto.randomUUID(), status: "completed", workCardId, promoted });
});

app.get("/api/public/missions/:id/events", async (c) => {
  const missionId = c.req.param("id");
  return streamSSE(c, async (stream) => {
    let sent = 0;
    while (sent < 30) {
      const events = await recentMissionEvents(missionId);
      for (const event of events) await stream.writeSSE({ event: event.type, data: JSON.stringify(event) });
      sent += 1;
      await stream.sleep(1000);
    }
  });
});

app.post("/api/public/internal/reap", async (c) => {
  const expected = vars.get("INTERNAL_REAP_TOKEN");
  if (expected && c.req.header("x-internal-token") !== expected) return jsonError(c, "error.internal.unauthorized", 401);
  const idleMs = Number(vars.get("MISSIONRY_IDLE_MS") ?? 45000);
  const idle = await listIdleSandboxes(idleMs);
  const snapshotKeys: string[] = [];
  for (const item of idle) {
    const paused = await e2b.pauseIfIdle(item.ref);
    const snapshotKey =
      item.target === "mission"
        ? `missions/${item.mission.id}/snapshots/shared/latest.json`
        : `missions/${item.mission.id}/snapshots/private/${item.instanceId}/latest.json`;
    await storage.from(buckets.missionryWorkspaces).put(snapshotKey, JSON.stringify({ sandboxId: item.ref.sandboxId, pausedAt: now(), state: paused.state }, null, 2));
    if (!(await storage.from(buckets.missionryWorkspaces).get(snapshotKey))) throw new Error("error.snapshot.write_failed");
    snapshotKeys.push(snapshotKey);
    await updateMission(item.mission.id, (mission) => {
      if (item.target === "mission") {
        mission.stateJson.sharedSandbox = paused;
        mission.stateJson.snapshots.sharedLatestR2Key = snapshotKey;
      } else if (item.instanceId) {
        mission.stateJson.privateSandboxes[item.instanceId] = paused;
        mission.stateJson.snapshots.privateLatestR2Keys[item.instanceId] = snapshotKey;
      }
      mission.stateJson.snapshots.lastSnapshotAt = now();
      return mission;
    });
    await emitCostEvent({
      missionId: item.mission.id,
      instanceId: item.instanceId,
      sandboxId: item.ref.sandboxId,
      sandboxSeconds: item.ref.activeSince ? Math.max(1, (Date.now() - Date.parse(item.ref.activeSince)) / 1000) : 1,
      costCents: 1,
      eventType: "sandbox_burn",
    });
  }
  return c.json({ checkedMissions: new Set(idle.map((item) => item.mission.id)).size, pausedSandboxes: idle.length, snapshotKeys, recoverableErrors: [] });
});

app.post("/api/public/audit-events/:auditEventId/rollback", async (c) => {
  const auditEventId = c.req.param("auditEventId");
  const [row] = await db.select().from(auditEvents).where(eq(auditEvents.eventId, auditEventId)).limit(1);
  if (!row?.payloadRefJson) return jsonError(c, "error.audit.rollback_unavailable", 404);
  const payload = JSON.parse(row.payloadRefJson) as { r2Key?: string };
  if (!payload.r2Key) return jsonError(c, "error.audit.rollback_unavailable", 404);
  const bucket = storage.from(buckets.missionryWorkspaces);
  const versions = bucket.listVersions ? await bucket.listVersions(payload.r2Key) : [];
  if (versions.length > 1 && bucket.restoreObjectVersion) await bucket.restoreObjectVersion(payload.r2Key, versions[1].versionId);
  const rollbackAuditEventId = await recordAudit({
    missionId: row.missionId ?? undefined,
    subjectType: row.subjectType,
    subjectId: row.subjectId,
    actor: { type: "user", id: "user_local" },
    action: "rollback_completed",
    diffSummary: `rollback:${row.eventId}`,
    payloadRef: { r2Key: payload.r2Key },
  });
  return c.json({ actionId: crypto.randomUUID(), status: "completed", rollbackAuditEventId, restoredR2Key: payload.r2Key });
});

export default app;
