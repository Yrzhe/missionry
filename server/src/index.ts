import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { ensureAgentInstanceFiles } from "./agents/files";
import { createRuntime, type EdgeSparkEnv } from "./defs/runtime";
import { createDemoWorkCard, ensureSchema, seedDemo } from "./seed";
import * as e2b from "./sandbox/e2b";
import { emitCostEvent, recentMissionEvents } from "./sse/events";
import { getMission, listIdleSandboxes, recordAudit, updateMission } from "./state/missionState";

type AppBindings = {
  Bindings: EdgeSparkEnv;
};

const app = new Hono<AppBindings>();

function jsonError(code: string, status = 400) {
  return Response.json({ error: { code, messageKey: code } }, { status });
}

app.get("/api/health", async (c) => {
  const runtime = createRuntime(c.env, c.executionCtx);
  await ensureSchema(runtime.db);
  return c.json({ ok: true, service: "missionry-api", runtime: "edgespark", contract: "v0.5" });
});

app.post("/api/missions", async (c) => {
  const runtime = createRuntime(c.env, c.executionCtx);
  const body = await c.req.json().catch(() => ({})) as { missionId?: string };
  const seeded = await seedDemo(runtime, body.missionId);
  return c.json({ actionId: crypto.randomUUID(), status: "completed", ...seeded });
});

app.get("/api/missions/:id/workroom", async (c) => {
  const runtime = createRuntime(c.env, c.executionCtx);
  await ensureSchema(runtime.db);
  const mission = await getMission(runtime.db, c.req.param("id"));
  const agents = await runtime.db
    .prepare(
      `select ai.id as instance_id, ai.mission_id, ai.agent_id, ai.role, ai.display_alias, ai.work_state_json,
              a.display_name, a.avatar_json, a.global_identity_json
       from agent_instances ai join agents a on a.id = ai.agent_id
       where ai.mission_id = ? order by ai.created_at`,
    )
    .bind(mission.id)
    .all();
  const cards = await runtime.db.prepare("select * from work_cards where mission_id = ? order by created_at").bind(mission.id).all();

  const workCards = (cards.results ?? []).map((row) => ({
    id: row.id,
    missionId: row.mission_id,
    title: row.title,
    assigneeInstanceId: row.assignee_instance_id,
    status: row.status,
    priority: row.priority,
    sandboxAffinity: JSON.parse(String(row.sandbox_affinity_json)),
    dependencies: JSON.parse(String(row.dependencies_json)),
    issueIds: JSON.parse(String(row.issue_ids_json)),
    cost: JSON.parse(String(row.cost_json)),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));

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
        agentId: mission.ownerAgentId,
        agentInstanceId: mission.ownerInstanceId,
        displayName: "Forge",
        avatar: { avatarSource: "random", avatarSeed: "forge" },
      },
      agentCount: agents.results?.length ?? 0,
      pendingCount: workCards.filter((card) => card.status !== "done").length,
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
    workCards,
    missionSandbox: {
      ...mission.stateJson.sharedSandbox,
      active: mission.stateJson.sharedSandbox.state === "running",
      repoPath: "/workspace/repos/demo",
      r2SnapshotKey: mission.stateJson.snapshots.sharedLatestR2Key,
      processes: [],
    },
    agentInstances: (agents.results ?? []).map((row) => ({
      agent: {
        id: row.agent_id,
        displayName: row.display_name,
        avatar: JSON.parse(String(row.avatar_json)),
        globalIdentity: JSON.parse(String(row.global_identity_json)),
      },
      instance: {
        id: row.instance_id,
        missionId: row.mission_id,
        agentId: row.agent_id,
        displayAlias: row.display_alias,
        workState: JSON.parse(String(row.work_state_json)),
        sandboxSummary: mission.stateJson.privateSandboxes[String(row.instance_id)] ?? { state: "none", active: false, burnRateCentsPerMinute: 0 },
      },
      role: row.role,
    })),
    openIssues: mission.stateJson.issues.open,
    costGuardrailStatus: { state: mission.stateJson.costGuardrailStatus },
    updatedAt: mission.updatedAt,
  });
});

app.post("/api/missions/:id/work-cards", async (c) => {
  const runtime = createRuntime(c.env, c.executionCtx);
  await ensureSchema(runtime.db);
  const missionId = c.req.param("id");
  const body = await c.req.json().catch(() => ({})) as {
    title?: string;
    assigneeInstanceId?: string;
    sandboxAffinity?: { tier: "tier0" | "mission" | "private"; reason: string };
    demoAction?: "run_shared" | "write_shared" | "read_shared" | "escalate_private" | "read_private";
    path?: string;
    content?: string;
    command?: string;
  };
  const assignee = body.assigneeInstanceId ?? `ins_${missionId}_forge`;
  const workCardId = `wc_${crypto.randomUUID().slice(0, 8)}`;
  await createDemoWorkCard(runtime, missionId, workCardId, assignee, body.sandboxAffinity?.tier ?? "mission", body.title ?? "Demo work card");

  let demoResult: unknown = null;
  if (body.demoAction) {
    await ensureAgentInstanceFiles(runtime.storage, missionId, assignee);
    if (body.demoAction === "run_shared") {
      const ref = await e2b.startShared(runtime, missionId);
      demoResult = await e2b.runCommand(runtime, ref, body.command ?? "pwd");
      await emitCostEvent(runtime.db, { missionId, instanceId: assignee, costCents: 1, sandboxId: ref.sandboxId, sandboxSeconds: 1, eventType: "sandbox_burn" });
    }
    if (body.demoAction === "write_shared") {
      const ref = await e2b.startShared(runtime, missionId);
      await e2b.writeFile(runtime, ref, body.path ?? "/workspace/shared.txt", body.content ?? "shared from second agent");
      demoResult = { path: body.path ?? "/workspace/shared.txt", sandboxId: ref.sandboxId };
    }
    if (body.demoAction === "read_shared") {
      const ref = await e2b.startShared(runtime, missionId);
      demoResult = { content: await e2b.readFile(runtime, ref, body.path ?? "/workspace/shared.txt") };
    }
    if (body.demoAction === "escalate_private") {
      const ref = await e2b.startPrivate(runtime, missionId, assignee);
      await e2b.writeFile(runtime, ref, body.path ?? "/workspace/private.txt", body.content ?? "private");
      demoResult = { sandboxId: ref.sandboxId, path: body.path ?? "/workspace/private.txt" };
    }
    if (body.demoAction === "read_private") {
      const ref = await e2b.startPrivate(runtime, missionId, assignee);
      demoResult = { content: await e2b.readFile(runtime, ref, body.path ?? "/workspace/private.txt") };
    }
  }

  const auditEventId = await recordAudit(runtime.db, {
    missionId,
    subjectType: "work_card",
    subjectId: workCardId,
    actor: { type: "agent", id: "agt_forge" },
    action: "work_card_allocated",
    diffSummary: "demo.work_card_allocated",
  });
  return c.json({ actionId: crypto.randomUUID(), status: "completed", workCardId, auditEventId, demoResult });
});

app.get("/api/missions/:id/events", async (c) => {
  const runtime = createRuntime(c.env, c.executionCtx);
  const missionId = c.req.param("id");
  return streamSSE(c, async (stream) => {
    let sent = 0;
    while (sent < 30) {
      const events = await recentMissionEvents(runtime.db, missionId);
      for (const event of events) {
        await stream.writeSSE({ event: event.type, data: JSON.stringify(event) });
      }
      sent += 1;
      await stream.sleep(1000);
    }
  });
});

app.post("/api/internal/reap", async (c) => {
  const runtime = createRuntime(c.env, c.executionCtx);
  await ensureSchema(runtime.db);
  const expected = runtime.vars.get("INTERNAL_REAP_TOKEN");
  if (expected && c.req.header("x-internal-token") !== expected) return jsonError("error.internal.unauthorized", 401);

  const idleMs = Number(runtime.vars.get("MISSIONRY_IDLE_MS") ?? 45000);
  const idle = await listIdleSandboxes(runtime.db, idleMs);
  const snapshotKeys: string[] = [];
  for (const item of idle) {
    const paused = await e2b.pauseIfIdle(runtime, item.ref);
    const snapshotKey =
      item.target === "mission"
        ? `missions/${item.mission.id}/snapshots/shared/latest.json`
        : `missions/${item.mission.id}/snapshots/private/${item.instanceId}/latest.json`;
    await runtime.storage.put(snapshotKey, JSON.stringify({ sandboxId: item.ref.sandboxId, pausedAt: new Date().toISOString(), state: paused.state }, null, 2));
    const roundTrip = await runtime.storage.get(snapshotKey);
    if (!roundTrip) throw new Error("error.snapshot.write_failed");
    snapshotKeys.push(snapshotKey);
    await updateMission(runtime.db, item.mission.id, (mission) => {
      if (item.target === "mission") {
        mission.stateJson.sharedSandbox = paused;
        mission.stateJson.snapshots.sharedLatestR2Key = snapshotKey;
      } else if (item.instanceId) {
        mission.stateJson.privateSandboxes[item.instanceId] = paused;
        mission.stateJson.snapshots.privateLatestR2Keys[item.instanceId] = snapshotKey;
      }
      mission.stateJson.snapshots.lastSnapshotAt = new Date().toISOString();
      return mission;
    });
    await emitCostEvent(runtime.db, {
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

export default app;
