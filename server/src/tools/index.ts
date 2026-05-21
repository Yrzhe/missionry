import { storage, db, secret } from "edgespark";
import { tool } from "ai";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { loadSkill } from "../agents/files";
import { agents, auditEvents, workCards } from "../defs/db_schema";
import { buckets } from "../defs/storage_schema";
import { assertSafeId, assertSafeRelativePath } from "../lib/safe-paths";
import * as e2b from "../sandbox/e2b";
import { getMission, recordAudit, type SandboxRef } from "../state/missionState";

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
  const mission = await getMission(ctx.missionId);
  if (target === "private") {
    const existing = mission.stateJson.privateSandboxes[ctx.instanceId];
    if (existing?.state === "running") return existing;
    return e2b.startPrivate(ctx.missionId, ctx.instanceId);
  }
  if (mission.stateJson.sharedSandbox.state === "running") return mission.stateJson.sharedSandbox;
  return e2b.startShared(ctx.missionId);
}

async function storageObjectText(obj: unknown): Promise<string> {
  const wrapped = obj as Record<string, unknown> | null;
  const maybeText = wrapped?.text;
  if (typeof maybeText === "function") return maybeText.call(obj);
  if (typeof maybeText === "string") return maybeText;
  const maybeArrayBuffer = wrapped?.arrayBuffer;
  if (typeof maybeArrayBuffer === "function") return new TextDecoder().decode(await maybeArrayBuffer.call(obj));
  for (const key of ["body", "content", "data", "value"]) {
    const value = wrapped?.[key];
    if (typeof value === "string") return value;
    if (value instanceof Uint8Array) return new TextDecoder().decode(value);
    if (value && typeof value === "object") {
      const nestedText = (value as Record<string, unknown>).text;
      if (typeof nestedText === "function") return nestedText.call(value);
      if (typeof nestedText === "string") return nestedText;
    }
  }
  return String(obj ?? "");
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
          await storage.from(buckets.missionryWorkspaces).put(key, input.content);
          return { key, capabilityStatus: "real" as const };
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
      description: "Update work-card status.",
      inputSchema: z.object({ workCardId: z.string(), status: z.enum(["running", "blocked", "done", "failed"]) }),
      execute: (input) =>
        withUsageAndSpend("report_progress", ctx, async () => {
          await db
            .update(workCards)
            .set({ status: input.status, updatedAt: new Date().toISOString() })
            .where(and(eq(workCards.id, input.workCardId), eq(workCards.missionId, ctx.missionId)));
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
                .where(and(eq(workCards.id, workCardId), eq(workCards.missionId, ctx.missionId), eq(workCards.status, "proposed")))
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
          await storage.from(buckets.missionryWorkspaces).put(key, input.content);
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
          return { repoPath: `/workspace/${repoPath}`, stdout: result.stdout, stderr: result.stderr, exitCode: result.exitCode, sandboxId: ref.sandboxId, capabilityStatus: "real" as const };
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
