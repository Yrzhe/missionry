import { storage, db, secret } from "edgespark";
import { tool } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { eq, and } from "drizzle-orm";
import { generateText } from "ai";
import { z } from "zod";
import { ensureAgentInstanceFiles, loadAgentBootFiles, loadSkill } from "../agents/files";
import { agentInstances, agents, auditEvents, growthCandidates, missionChatMessages, workCards } from "../defs/db_schema";
import { buckets } from "../defs/storage_schema";
import { assertSafeId, assertSafeRelativePath } from "../lib/safe-paths";
import * as e2b from "../sandbox/e2b";
import { getMissionWithRuntimeSandboxes, recordAudit, reservePrivateSandboxSlot, type SandboxRef } from "../state/missionState";

export type ToolContext = {
  missionId: string;
  agentId: string;
  instanceId: string;
  turnId: string;
  clientActionId?: string;
  workCardId?: string;
};

const sandboxAffinitySchema = z.object({
  tier: z.enum(["tier0", "mission", "private"]),
  reason: z.string().default("leader assignment"),
});

async function resolveSandbox(ctx: ToolContext, target: "mission" | "private"): Promise<SandboxRef> {
  await e2b.assertInstanceInMission(ctx.missionId, ctx.instanceId);
  const mission = await getMissionWithRuntimeSandboxes(ctx.missionId);
  if (target === "private") {
    const existing = mission.stateJson.privateSandboxes[ctx.instanceId];
    if (existing?.state === "running") return existing;
    return e2b.startPrivate(ctx.missionId, ctx.instanceId);
  }
  if (mission.stateJson.sharedSandbox.state === "running") return mission.stateJson.sharedSandbox;
  return e2b.startShared(ctx.missionId);
}

// storage.put needs an ArrayBuffer (a raw string stores an EMPTY body).
function textBytes(text: string): ArrayBuffer {
  const u8 = new TextEncoder().encode(text);
  return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer;
}

// EdgeSpark storage.get() returns { body: ArrayBuffer, metadata } (no .text()).
async function decodeStorageValue(value: unknown): Promise<string | null> {
  if (value == null) return null;
  if (typeof value === "string") return value;
  if (value instanceof Uint8Array) return new TextDecoder().decode(value);
  if (value instanceof ArrayBuffer) return new TextDecoder().decode(new Uint8Array(value));
  if (ArrayBuffer.isView(value)) return new TextDecoder().decode(new Uint8Array((value as ArrayBufferView).buffer));
  const v = value as Record<string, unknown>;
  if (typeof v.text === "function") return await (v.text as () => Promise<string>).call(value);
  if (typeof v.arrayBuffer === "function") return new TextDecoder().decode(await (v.arrayBuffer as () => Promise<ArrayBuffer>).call(value));
  return null;
}

async function storageObjectText(obj: unknown): Promise<string> {
  if (obj == null) return "";
  const direct = await decodeStorageValue(obj);
  if (direct != null) return direct;
  const wrapped = obj as Record<string, unknown>;
  for (const key of ["body", "content", "data", "value"]) {
    const decoded = await decodeStorageValue(wrapped[key]);
    if (decoded != null) return decoded;
  }
  return "";
}

async function withUsageAndSpend<T>(name: string, ctx: ToolContext, handler: () => Promise<T>) {
  try {
    return await handler();
  } catch (error) {
    await recordAudit({
      missionId: ctx.missionId,
      subjectType: "tool",
      subjectId: name,
      actor: { type: "agent", id: ctx.agentId },
      action: "tool_failed",
      clientActionId: ctx.clientActionId,
      diffSummary: error instanceof Error ? error.message : "error.tool.failed",
    });
    throw error;
  }
}

function shellQuote(value: string) {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

async function repoUrlForClone(repoUrl: string) {
  const parsed = new URL(repoUrl);
  const token = parsed.hostname === "github.com" ? await Promise.resolve(secret.get("GITHUB_TOKEN" as any)).catch(() => undefined) : undefined;
  if (token && parsed.protocol === "https:") parsed.username = token;
  return parsed.toString();
}

function repoDirName(repoUrl: string) {
  const parsed = new URL(repoUrl);
  const last = parsed.pathname.split("/").filter(Boolean).at(-1)?.replace(/\.git$/i, "") || "repo";
  return assertSafeRelativePath(last.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "repo");
}

async function attachInstanceToMission(missionId: string, agentId: string, role = "member") {
  missionId = assertSafeId(missionId, "mission_id");
  agentId = assertSafeId(agentId, "agent_id");
  const [agent] = await db.select().from(agents).where(eq(agents.id, agentId)).limit(1);
  if (!agent) throw new Error("error.agent.not_found");
  const [existing] = await db.select().from(agentInstances).where(and(eq(agentInstances.missionId, missionId), eq(agentInstances.agentId, agentId))).limit(1);
  if (existing) return existing.id;
  const instanceId = `ins_${missionId}_${agentId.replace(/^agt_/, "")}`;
  const timestamp = new Date().toISOString();
  await ensureAgentInstanceFiles(missionId, instanceId);
  await db.insert(agentInstances).values({
    id: instanceId,
    missionId,
    agentId,
    role,
    displayAlias: agent.displayName,
    workStateJson: JSON.stringify({ status: "idle" }),
    isolationJson: JSON.stringify({ defaultPolicy: "deny_cross_project", allowedReadGrantIds: [] }),
    equippedSkillOverridesJson: JSON.stringify({ addSkillIds: [], removeSkillIds: [], effectiveSkillIds: JSON.parse(agent.equippedSkillIdsJson) }),
    r2Prefix: `missions/${missionId}/agent-instances/${instanceId}/`,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  await reservePrivateSandboxSlot(missionId, instanceId);
  return instanceId;
}

async function persistAgentChat(missionId: string, instanceId: string, body: string) {
  const timestamp = new Date().toISOString();
  const [message] = await db.insert(missionChatMessages).values({
    id: `mcm_${crypto.randomUUID().slice(0, 10)}`,
    missionId,
    authorType: "agent_instance",
    authorId: instanceId,
    body,
    mentionsJson: JSON.stringify([]),
    isSilent: 0,
    replyToMessageId: null,
    createdAt: timestamp,
  }).returning();
  await recordAudit({
    missionId,
    subjectType: "mission_chat_message",
    subjectId: message.id,
    actor: { type: "agent", id: instanceId },
    action: "mission_chat_message_sent",
    diffSummary: body,
  });
  return message;
}

async function decideRecruitment(input: { agentId: string; missionTitle: string; missionObjective: string; reason: string }) {
  const apiKey = await Promise.resolve(secret.get("OPENAI_API_KEY")).catch(() => undefined);
  if (!apiKey) return { decision: "accept" as const, reason: `Accepted: ${input.reason}` };
  const boot = await loadAgentBootFiles(input.agentId).catch(() => null);
  const openai = createOpenAI({ apiKey });
  const result = await generateText({
    model: openai(boot?.baseConfig.model ?? "gpt-5.5"),
    prompt: [
      boot?.soul ?? "You are a Missionry agent deciding whether to join a mission.",
      boot?.identity ?? "",
      "Return JSON only: {\"decision\":\"accept|decline\",\"reason\":\"one short sentence\"}.",
      `Mission: ${input.missionTitle}`,
      `Objective: ${input.missionObjective}`,
      `Invitation reason: ${input.reason}`,
    ].filter(Boolean).join("\n\n"),
  });
  try {
    const parsed = JSON.parse(result.text.trim().match(/```(?:json)?\s*([\s\S]*?)```/)?.[1] ?? result.text.trim());
    return {
      decision: parsed.decision === "decline" ? "decline" as const : "accept" as const,
      reason: String(parsed.reason ?? input.reason).slice(0, 240),
    };
  } catch {
    return { decision: "accept" as const, reason: result.text.trim().slice(0, 240) || `Accepted: ${input.reason}` };
  }
}

export function missionryToolKit(ctx: ToolContext) {
  ctx = {
    ...ctx,
    missionId: assertSafeId(ctx.missionId, "mission_id"),
    agentId: assertSafeId(ctx.agentId, "agent_id"),
    instanceId: assertSafeId(ctx.instanceId, "instance_id"),
    turnId: assertSafeId(ctx.turnId, "turn_id"),
    workCardId: ctx.workCardId ? assertSafeId(ctx.workCardId, "work_card_id") : undefined,
  };
  return {
    run_command: tool({
      description: "Run a shell command in the shared or private E2B sandbox.",
      inputSchema: z.object({ command: z.string(), sandbox_target: z.enum(["mission", "private"]).default("mission") }),
      execute: (input) =>
        withUsageAndSpend("run_command", ctx, async () => {
          const ref = await resolveSandbox(ctx, input.sandbox_target);
          const result = await e2b.runCommand(ref, input.command);
          return { ...result, sandboxId: ref.sandboxId, capabilityStatus: "real" as const };
        }),
    }),
    write_file: tool({
      description: "Write a file in the shared or private sandbox.",
      inputSchema: z.object({ path: z.string(), content: z.string(), sandbox_target: z.enum(["mission", "private"]).default("mission") }),
      execute: (input) =>
        withUsageAndSpend("write_file", ctx, async () => {
          const ref = await resolveSandbox(ctx, input.sandbox_target);
          const path = assertSafeRelativePath(input.path);
          await e2b.writeFile(ref, path, input.content);
          return { path, sandboxId: ref.sandboxId, capabilityStatus: "real" as const };
        }),
    }),
    read_file: tool({
      description: "Read a file from the shared or private sandbox.",
      inputSchema: z.object({ path: z.string(), sandbox_target: z.enum(["mission", "private"]).default("mission") }),
      execute: (input) =>
        withUsageAndSpend("read_file", ctx, async () => {
          const ref = await resolveSandbox(ctx, input.sandbox_target);
          const path = assertSafeRelativePath(input.path);
          return { path, content: await e2b.readFile(ref, path), sandboxId: ref.sandboxId, capabilityStatus: "real" as const };
        }),
    }),
    read_artifact: tool({
      description: "Read a Mission artifact from storage.",
      inputSchema: z.object({ artifactId: z.string(), filename: z.string() }),
      execute: (input) =>
        withUsageAndSpend("read_artifact", ctx, async () => {
          const artifactId = assertSafeId(input.artifactId, "artifact_id");
          const filename = assertSafeRelativePath(input.filename);
          const key = `missions/${ctx.missionId}/artifacts/${artifactId}/${filename}`;
          const object = await storage.from(buckets.missionryWorkspaces).get(key);
          return { key, content: object ? await storageObjectText(object) : null };
        }),
    }),
    write_artifact: tool({
      description: "Write a Mission artifact to storage.",
      inputSchema: z.object({ artifactId: z.string(), filename: z.string(), content: z.string() }),
      execute: (input) =>
        withUsageAndSpend("write_artifact", ctx, async () => {
          const artifactId = assertSafeId(input.artifactId, "artifact_id");
          const filename = assertSafeRelativePath(input.filename);
          const key = `missions/${ctx.missionId}/artifacts/${artifactId}/${filename}`;
          await storage.from(buckets.missionryWorkspaces).put(key, textBytes(input.content));
          return { key, capabilityStatus: "real" as const };
        }),
    }),
    list_artifacts: tool({
      description: "List the REAL saved artifact file paths for this mission (from completed work cards). ALWAYS call this before telling the user where a file/report/output is — never guess or invent a path.",
      inputSchema: z.object({}),
      execute: () =>
        withUsageAndSpend("list_artifacts", ctx, async () => {
          const cards = await db.select().from(workCards).where(eq(workCards.missionId, ctx.missionId)) as Array<typeof workCards.$inferSelect>;
          const byPath = new Map<string, { path: string; size?: number; card: string }>();
          for (const card of cards) {
            let files: Array<{ path?: string; size?: number }> = [];
            try { files = (JSON.parse(card.costJson) as { runner?: { resultFiles?: Array<{ path?: string; size?: number }> } }).runner?.resultFiles ?? []; } catch { /* skip */ }
            for (const f of files) if (typeof f.path === "string" && f.path.trim()) byPath.set(f.path, { path: f.path, size: f.size, card: card.title });
          }
          const items = Array.from(byPath.values());
          return { count: items.length, artifacts: items, capabilityStatus: "real" as const };
        }),
    }),
    list_workspace_files: tool({
      description: "List the files currently in the live sandbox workspace (relative paths). Use to see what actually exists right now.",
      inputSchema: z.object({ sandbox_target: z.enum(["mission", "private"]).default("mission") }),
      execute: (input) =>
        withUsageAndSpend("list_workspace_files", ctx, async () => {
          const ref = await resolveSandbox(ctx, input.sandbox_target);
          const result = await e2b.runCommand(ref, "find . -type f -not -path '*/.*' | sed 's|^\\./||' | head -200");
          const files = result.stdout.split("\n").map((s) => s.trim()).filter(Boolean);
          return { count: files.length, files, sandboxId: ref.sandboxId, capabilityStatus: "real" as const };
        }),
    }),
    escalate_to_private_sandbox: tool({
      description: "Create or resume this AgentInstance's Tier 2 private sandbox.",
      inputSchema: z.object({ reason: z.string() }),
      execute: (input) =>
        withUsageAndSpend("escalate_to_private_sandbox", ctx, async () => {
          const ref = await e2b.startPrivate(ctx.missionId, ctx.instanceId);
          await recordAudit({
            missionId: ctx.missionId,
            subjectType: "sandbox",
            subjectId: ref.sandboxId,
            actor: { type: "agent", id: ctx.agentId },
            action: "private_sandbox_started",
            clientActionId: ctx.clientActionId,
            diffSummary: input.reason,
          });
          return ref;
        }),
    }),
    report_progress: tool({
      description: "Update the status of a work card assigned to YOU.",
      inputSchema: z.object({ workCardId: z.string(), status: z.enum(["running", "blocked", "done", "failed"]) }),
      execute: (input) =>
        withUsageAndSpend("report_progress", ctx, async () => {
          // Only the assignee may update its own card — prevents an agent from
          // marking another agent's card done (which also bypasses billing/dequeue).
          const [updated] = await db
            .update(workCards)
            .set({ status: input.status, updatedAt: new Date().toISOString() })
            .where(and(
              eq(workCards.id, input.workCardId),
              eq(workCards.missionId, ctx.missionId),
              eq(workCards.assigneeInstanceId, ctx.instanceId),
            ))
            .returning();
          if (!updated) return { workCardId: input.workCardId, status: input.status, capabilityStatus: "denied" as const, error: "not your work card" };
          return { workCardId: input.workCardId, status: input.status, capabilityStatus: "real" as const };
        }),
    }),
    assign_work_card: tool({
      description: "Leader-only assignment tool. Assign an existing proposed work card to a Mission agent instance, or create a new queued work card for that instance.",
      inputSchema: z.object({
        workCardId: z.string().optional(),
        title: z.string().optional(),
        description: z.string().optional(),
        assigneeInstanceId: z.string(),
        sandboxAffinity: sandboxAffinitySchema.optional(),
      }),
      execute: (input) =>
        withUsageAndSpend("assign_work_card", ctx, async () => {
          const assigneeInstanceId = assertSafeId(input.assigneeInstanceId, "instance_id");
          await e2b.assertInstanceInMission(ctx.missionId, assigneeInstanceId);
          const timestamp = new Date().toISOString();
          const sandboxAffinity = input.sandboxAffinity ?? { tier: "mission" as const, reason: "leader assignment" };
          const auditId = crypto.randomUUID();
          const auditEventId = `evt_${auditId}`;
          if (input.workCardId) {
            const workCardId = assertSafeId(input.workCardId, "work_card_id");
            const [updated, _audit] = await db.batch([
              db
                .update(workCards)
                .set({
                  ...(input.title ? { title: input.title } : {}),
                  ...(input.description !== undefined ? { description: input.description } : {}),
                  pmInstanceId: ctx.instanceId,
                  assigneeInstanceId,
                  status: "queued",
                  sandboxAffinityJson: JSON.stringify(sandboxAffinity),
                  updatedAt: timestamp,
                })
                // Any card in the mission can be (re)assigned — including done/failed
                // ones, so the leader can re-run a finished pipeline on request.
                .where(and(eq(workCards.id, workCardId), eq(workCards.missionId, ctx.missionId)))
                .returning(),
              db.insert(auditEvents).values({
                id: auditId,
                eventId: auditEventId,
                missionId: ctx.missionId,
                subjectType: "work_card",
                subjectId: workCardId,
                actorJson: JSON.stringify({ type: "agent", id: ctx.agentId }),
                action: "work_card_assigned",
                clientActionId: ctx.clientActionId ?? null,
                diffSummary: `assignee:${assigneeInstanceId};status:queued`,
                payloadRefJson: null,
                reversible: 0,
                rollbackAvailable: 0,
                createdAt: timestamp,
              }),
            ]);
            if (updated.length !== 1) throw new Error("error.work_card.assign_failed");
            return { workCardId, status: "queued", assigneeInstanceId, auditEventId, capabilityStatus: "real" as const };
          }
          if (!input.title) throw new Error("error.request.invalid");
          const workCardId = `wc_${crypto.randomUUID().slice(0, 8)}`;
          await db.batch([
            db.insert(workCards).values({
              id: workCardId,
              missionId: ctx.missionId,
              title: input.title,
              description: input.description ?? null,
              pmInstanceId: ctx.instanceId,
              assigneeInstanceId,
              reviewerInstanceId: null,
              status: "queued",
              priority: "medium",
              sandboxAffinityJson: JSON.stringify(sandboxAffinity),
              dependenciesJson: JSON.stringify([]),
              issueIdsJson: JSON.stringify([]),
              costJson: JSON.stringify({ spentCents: 0 }),
              createdAt: timestamp,
              updatedAt: timestamp,
            }),
            db.insert(auditEvents).values({
              id: auditId,
              eventId: auditEventId,
              missionId: ctx.missionId,
              subjectType: "work_card",
              subjectId: workCardId,
              actorJson: JSON.stringify({ type: "agent", id: ctx.agentId }),
              action: "work_card_created_assigned",
              clientActionId: ctx.clientActionId ?? null,
              diffSummary: `assignee:${assigneeInstanceId};status:queued`,
              payloadRefJson: null,
              reversible: 0,
              rollbackAvailable: 0,
              createdAt: timestamp,
            }),
          ]);
          return { workCardId, status: "queued", assigneeInstanceId, auditEventId, capabilityStatus: "real" as const };
        }),
    }),
    recruit_agent_to_mission: tool({
      description: "Leader-only recruitment tool. Invite an existing global agent to this mission. The invited agent decides whether to join before an instance is created.",
      inputSchema: z.object({ agentId: z.string(), reason: z.string() }),
      execute: (input) =>
        withUsageAndSpend("recruit_agent_to_mission", ctx, async () => {
          await e2b.assertInstanceInMission(ctx.missionId, ctx.instanceId);
          const agentId = assertSafeId(input.agentId, "agent_id");
          const [agent] = await db.select().from(agents).where(eq(agents.id, agentId)).limit(1);
          if (!agent) throw new Error("error.agent.not_found");
          const mission = await getMissionWithRuntimeSandboxes(ctx.missionId);
          const decision = await decideRecruitment({ agentId, missionTitle: mission.title, missionObjective: mission.objective, reason: input.reason });
          if (decision.decision === "decline") {
            await persistAgentChat(ctx.missionId, agentId, `${agent.displayName} declines invitation: ${decision.reason}`);
            await recordAudit({
              missionId: ctx.missionId,
              subjectType: "agent",
              subjectId: agentId,
              actor: { type: "agent", id: ctx.agentId },
              action: "agent_invitation_declined",
              clientActionId: ctx.clientActionId,
              diffSummary: decision.reason,
            });
            return { agentId, accepted: false, reason: decision.reason, capabilityStatus: "real" as const };
          }
          const instanceId = await attachInstanceToMission(ctx.missionId, agentId, "member");
          await persistAgentChat(ctx.missionId, instanceId, `${agent.displayName} joins the mission: ${decision.reason}`);
          const auditEventId = await recordAudit({
            missionId: ctx.missionId,
            subjectType: "agent_instance",
            subjectId: instanceId,
            actor: { type: "agent", id: ctx.agentId },
            action: "agent_joined",
            clientActionId: ctx.clientActionId,
            diffSummary: `agent:${agentId};reason:${decision.reason}`,
          });
          return { agentId, instanceId, accepted: true, reason: decision.reason, auditEventId, capabilityStatus: "real" as const };
        }),
    }),
    request_new_agent: tool({
      description: "Leader-only tool. Ask the user to create a new agent when no existing mission or global agent has the needed role or skills.",
      inputSchema: z.object({ role: z.string(), displayName: z.string().optional(), reason: z.string() }),
      execute: (input) =>
        withUsageAndSpend("request_new_agent", ctx, async () => {
          await e2b.assertInstanceInMission(ctx.missionId, ctx.instanceId);
          const role = input.role.trim();
          const reason = input.reason.trim();
          if (!role || !reason) throw new Error("error.request.invalid");
          const requestId = `agr_${crypto.randomUUID().slice(0, 10)}`;
          const timestamp = new Date().toISOString();
          const title = input.displayName?.trim() || role;
          const payload = {
            role,
            displayName: input.displayName?.trim() || null,
            reason,
            requestedByAgentId: ctx.agentId,
            requestedByInstanceId: ctx.instanceId,
            missionId: ctx.missionId,
          };
          const chatBody = `Leader requests a new agent: ${role} — ${reason}`;
          await db.batch([
            db.insert(growthCandidates).values({
              id: requestId,
              type: "agent_request",
              title,
              rationale: JSON.stringify(payload),
              evidenceEventIdsJson: JSON.stringify([]),
              sourceMissionIdsJson: JSON.stringify([ctx.missionId]),
              scope: "mission",
              status: "pending",
              estimatedFutureCostHint: null,
              createdAt: timestamp,
              enabledAt: null,
              enabledBy: null,
            }),
            db.insert(missionChatMessages).values({
              id: `mcm_${crypto.randomUUID().slice(0, 10)}`,
              missionId: ctx.missionId,
              authorType: "system",
              authorId: "agent_request",
              body: chatBody,
              mentionsJson: JSON.stringify([]),
              isSilent: 0,
              replyToMessageId: null,
              createdAt: timestamp,
            }),
          ]);
          const auditEventId = await recordAudit({
            missionId: ctx.missionId,
            subjectType: "agent_request",
            subjectId: requestId,
            actor: { type: "agent", id: ctx.agentId },
            action: "agent_requested",
            clientActionId: ctx.clientActionId,
            diffSummary: chatBody,
          });
          return { requestId, status: "pending", role, displayName: input.displayName ?? null, reason, auditEventId, capabilityStatus: "real" as const };
        }),
    }),
    commit_self_update: tool({
      description: "Commit an Agent self-update markdown file to storage.",
      inputSchema: z.object({ file: z.string(), content: z.string(), reason: z.string() }),
      execute: (input) =>
        withUsageAndSpend("commit_self_update", ctx, async () => {
          const file = assertSafeRelativePath(input.file);
          const key = `agents/${ctx.agentId}/${file}`;
          const before = await storage.from(buckets.missionryWorkspaces).get(key);
          const previousBody = before ? await storageObjectText(before) : "";
          const [agentBeforeUpdate] = await db.select({ auditHeadId: agents.auditHeadId }).from(agents).where(eq(agents.id, ctx.agentId)).limit(1);
          await storage.from(buckets.missionryWorkspaces).put(key, textBytes(input.content));
          const auditEventId = await recordAudit({
            missionId: ctx.missionId,
            subjectType: "agent",
            subjectId: ctx.agentId,
            actor: { type: "agent", id: ctx.agentId },
            action: "self_update",
            clientActionId: ctx.clientActionId,
            diffSummary: input.reason,
            payloadRef: { r2Key: key, previousBody, authoredAgainstAuditHeadId: agentBeforeUpdate?.auditHeadId ?? null },
            reversible: true,
            rollbackAvailable: true,
          });
          return { key, auditEventId };
        }),
    }),
    use_skill: tool({
      description: "Load a skill body lazily from storage.",
      inputSchema: z.object({ skill_id: z.string() }),
      execute: (input) => withUsageAndSpend("use_skill", ctx, async () => ({ body: await loadSkill(ctx.agentId, assertSafeId(input.skill_id, "skill_id")), capabilityStatus: "real" as const })),
    }),
    web_fetch: tool({
      description: "Fetch a URL without opening a sandbox.",
      inputSchema: z.object({ url: z.string().url() }),
      execute: (input) => withUsageAndSpend("web_fetch", ctx, async () => ({ url: input.url, text: await (await fetch(input.url)).text(), capabilityStatus: "real" as const })),
    }),
    web_search: tool({
      description: "Phase 1 search stub.",
      inputSchema: z.object({ query: z.string() }),
      execute: (input) => withUsageAndSpend("web_search", ctx, async () => ({ query: input.query, results: [], capabilityStatus: "stub" as const })),
    }),
    terminal_create: tool({
      description: "Phase 1 terminal stub.",
      inputSchema: z.object({ command: z.string() }),
      execute: (input) => withUsageAndSpend("terminal_create", ctx, async () => ({ terminalSessionId: crypto.randomUUID(), command: input.command, capabilityStatus: "stub" as const })),
    }),
    terminal_input: tool({
      description: "Phase 1 terminal input stub.",
      inputSchema: z.object({ terminalSessionId: z.string(), input: z.string() }),
      execute: (input) => withUsageAndSpend("terminal_input", ctx, async () => ({ terminalSessionId: input.terminalSessionId, accepted: true, capabilityStatus: "stub" as const })),
    }),
    git_clone: tool({
      description: "Clone a Git repository into /workspace/repos inside the mission sandbox.",
      inputSchema: z.object({ repoUrl: z.string().url(), directory: z.string().optional() }),
      execute: (input) =>
        withUsageAndSpend("git_clone", ctx, async () => {
          const ref = await resolveSandbox(ctx, "mission");
          const directory = input.directory ? assertSafeRelativePath(input.directory) : repoDirName(input.repoUrl);
          const repoPath = `repos/${directory}`;
          const cloneUrl = await repoUrlForClone(input.repoUrl);
          const result = await e2b.runCommand(ref, `mkdir -p repos && if [ -d ${shellQuote(repoPath + "/.git")} ]; then git -C ${shellQuote(repoPath)} fetch --all --prune; else git clone --depth 1 ${shellQuote(cloneUrl)} ${shellQuote(repoPath)}; fi`);
          return { repoPath: `${e2b.WORKSPACE_ROOT}/${repoPath}`, stdout: result.stdout, stderr: result.stderr, exitCode: result.exitCode, sandboxId: ref.sandboxId, capabilityStatus: "real" as const };
        }),
    }),
    git_commit: tool({
      description: "Phase 1 git commit stub.",
      inputSchema: z.object({ message: z.string() }),
      execute: (input) => withUsageAndSpend("git_commit", ctx, async () => ({ commit: null, message: input.message, capabilityStatus: "stub" as const })),
    }),
    git_push: tool({
      description: "Phase 1 git push stub.",
      inputSchema: z.object({ remote: z.string().default("origin") }),
      execute: (input) => withUsageAndSpend("git_push", ctx, async () => ({ remote: input.remote, pushed: false, capabilityStatus: "stub" as const })),
    }),
    request_cross_project_read: tool({
      description: "Phase 1 cross-project read request stub.",
      inputSchema: z.object({ sourceMissionId: z.string(), purpose: z.string() }),
      execute: (input) => withUsageAndSpend("request_cross_project_read", ctx, async () => ({ requestId: crypto.randomUUID(), status: "pending", capabilityStatus: "stub" as const, ...input })),
    }),
  };
}
