import { tool } from "ai";
import { z } from "zod";
import type { EdgeSparkContext, EdgeSparkDb, EdgeSparkSecret, EdgeSparkStorage, EdgeSparkVars } from "../defs/runtime";
import * as e2b from "../sandbox/e2b";
import { emitCostEvent } from "../sse/events";
import { getMission, recordAudit, updateMission, type SandboxRef } from "../state/missionState";
import { loadSkill } from "../agents/files";

export type ToolContext = {
  missionId: string;
  agentId: string;
  instanceId: string;
  turnId: string;
  clientActionId?: string;
  workCardId?: string;
  db: EdgeSparkDb;
  storage: EdgeSparkStorage;
  secret: EdgeSparkSecret;
  vars: EdgeSparkVars;
  ctx: EdgeSparkContext;
};

const sandboxCtx = (ctx: ToolContext) => ({
  db: ctx.db,
  storage: ctx.storage,
  secret: ctx.secret,
  vars: ctx.vars,
});

async function resolveSandbox(ctx: ToolContext, target: "mission" | "private"): Promise<SandboxRef> {
  const mission = await getMission(ctx.db, ctx.missionId);
  if (target === "private") {
    const existing = mission.stateJson.privateSandboxes[ctx.instanceId];
    if (existing?.state === "running") return existing;
    return e2b.startPrivate(sandboxCtx(ctx), ctx.missionId, ctx.instanceId);
  }
  if (mission.stateJson.sharedSandbox.state === "running") return mission.stateJson.sharedSandbox;
  return e2b.startShared(sandboxCtx(ctx), ctx.missionId);
}

async function withUsageAndSpend<T>(name: string, ctx: ToolContext, handler: () => Promise<T>) {
  const started = Date.now();
  try {
    const result = await handler();
    const elapsed = Math.max(1, (Date.now() - started) / 1000);
    if (["run_command", "write_file", "read_file"].includes(name)) {
      await emitCostEvent(ctx.db, {
        missionId: ctx.missionId,
        clientActionId: ctx.clientActionId,
        agentId: ctx.agentId,
        instanceId: ctx.instanceId,
        costCents: Math.ceil(elapsed * 0.01),
        sandboxSeconds: elapsed,
        eventType: "sandbox_burn",
      });
    }
    return result;
  } catch (error) {
    await recordAudit(ctx.db, {
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

export function missionryToolKit(ctx: ToolContext) {
  return {
    run_command: tool({
      description: "Run a shell command in the shared or private E2B sandbox.",
      inputSchema: z.object({
        command: z.string(),
        sandbox_target: z.enum(["mission", "private"]).default("mission"),
      }),
      execute: (input) =>
        withUsageAndSpend("run_command", ctx, async () => {
          const ref = await resolveSandbox(ctx, input.sandbox_target);
          return e2b.runCommand(sandboxCtx(ctx), ref, input.command);
        }),
    }),
    write_file: tool({
      description: "Write a file in the shared or private sandbox.",
      inputSchema: z.object({
        path: z.string(),
        content: z.string(),
        sandbox_target: z.enum(["mission", "private"]).default("mission"),
      }),
      execute: (input) =>
        withUsageAndSpend("write_file", ctx, async () => {
          const ref = await resolveSandbox(ctx, input.sandbox_target);
          await e2b.writeFile(sandboxCtx(ctx), ref, input.path, input.content);
          return { path: input.path, sandboxId: ref.sandboxId };
        }),
    }),
    read_file: tool({
      description: "Read a file from the shared or private sandbox.",
      inputSchema: z.object({
        path: z.string(),
        sandbox_target: z.enum(["mission", "private"]).default("mission"),
      }),
      execute: (input) =>
        withUsageAndSpend("read_file", ctx, async () => {
          const ref = await resolveSandbox(ctx, input.sandbox_target);
          return { path: input.path, content: await e2b.readFile(sandboxCtx(ctx), ref, input.path), sandboxId: ref.sandboxId };
        }),
    }),
    read_artifact: tool({
      description: "Read a Mission artifact from storage.",
      inputSchema: z.object({ artifactId: z.string(), filename: z.string() }),
      execute: (input) =>
        withUsageAndSpend("read_artifact", ctx, async () => {
          const key = `missions/${ctx.missionId}/artifacts/${input.artifactId}/${input.filename}`;
          const object = await ctx.storage.get(key);
          return { key, content: object ? await object.text() : null };
        }),
    }),
    write_artifact: tool({
      description: "Write a Mission artifact to storage.",
      inputSchema: z.object({ artifactId: z.string(), filename: z.string(), content: z.string() }),
      execute: (input) =>
        withUsageAndSpend("write_artifact", ctx, async () => {
          const key = `missions/${ctx.missionId}/artifacts/${input.artifactId}/${input.filename}`;
          await ctx.storage.put(key, input.content);
          return { key };
        }),
    }),
    escalate_to_private_sandbox: tool({
      description: "Create or resume this AgentInstance's Tier 2 private sandbox.",
      inputSchema: z.object({ reason: z.string() }),
      execute: (input) =>
        withUsageAndSpend("escalate_to_private_sandbox", ctx, async () => {
          const ref = await e2b.startPrivate(sandboxCtx(ctx), ctx.missionId, ctx.instanceId);
          await recordAudit(ctx.db, {
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
      inputSchema: z.object({ workCardId: z.string(), status: z.string() }),
      execute: (input) =>
        withUsageAndSpend("report_progress", ctx, async () => {
          await ctx.db.prepare("update work_cards set status = ?, updated_at = ? where id = ? and mission_id = ?")
            .bind(input.status, new Date().toISOString(), input.workCardId, ctx.missionId)
            .run();
          return { workCardId: input.workCardId, status: input.status };
        }),
    }),
    commit_self_update: tool({
      description: "Commit an Agent self-update markdown file to storage.",
      inputSchema: z.object({ file: z.string(), content: z.string(), reason: z.string() }),
      execute: (input) =>
        withUsageAndSpend("commit_self_update", ctx, async () => {
          const key = `agents/${ctx.agentId}/${input.file}`;
          await ctx.storage.put(key, input.content);
          const auditEventId = await recordAudit(ctx.db, {
            missionId: ctx.missionId,
            subjectType: "agent",
            subjectId: ctx.agentId,
            actor: { type: "agent", id: ctx.agentId },
            action: "agent_self_update_recorded",
            clientActionId: ctx.clientActionId,
            diffSummary: input.reason,
            payloadRef: { r2Key: key },
            reversible: true,
            rollbackAvailable: true,
          });
          return { key, auditEventId };
        }),
    }),
    use_skill: tool({
      description: "Load a skill body lazily from storage.",
      inputSchema: z.object({ skill_id: z.string() }),
      execute: (input) => withUsageAndSpend("use_skill", ctx, async () => ({ body: await loadSkill(ctx.storage, ctx.agentId, input.skill_id) })),
    }),
    web_fetch: tool({
      description: "Fetch a URL without opening a sandbox.",
      inputSchema: z.object({ url: z.string().url() }),
      execute: (input) => withUsageAndSpend("web_fetch", ctx, async () => ({ url: input.url, text: await (await fetch(input.url)).text() })),
    }),
    web_search: tool({
      description: "Phase 1 search stub.",
      inputSchema: z.object({ query: z.string() }),
      execute: (input) => withUsageAndSpend("web_search", ctx, async () => ({ query: input.query, results: [] })),
    }),
    terminal_create: tool({
      description: "Phase 1 terminal stub.",
      inputSchema: z.object({ command: z.string() }),
      execute: (input) => withUsageAndSpend("terminal_create", ctx, async () => ({ terminalSessionId: crypto.randomUUID(), command: input.command })),
    }),
    terminal_input: tool({
      description: "Phase 1 terminal input stub.",
      inputSchema: z.object({ terminalSessionId: z.string(), input: z.string() }),
      execute: (input) => withUsageAndSpend("terminal_input", ctx, async () => ({ terminalSessionId: input.terminalSessionId, accepted: true })),
    }),
    git_clone: tool({
      description: "Phase 1 git clone stub.",
      inputSchema: z.object({ repoUrl: z.string() }),
      execute: (input) => withUsageAndSpend("git_clone", ctx, async () => ({ repoPath: `/workspace/repos/${input.repoUrl.split("/").pop() ?? "repo"}` })),
    }),
    git_commit: tool({
      description: "Phase 1 git commit stub.",
      inputSchema: z.object({ message: z.string() }),
      execute: (input) => withUsageAndSpend("git_commit", ctx, async () => ({ commit: "demo", message: input.message })),
    }),
    git_push: tool({
      description: "Phase 1 git push stub.",
      inputSchema: z.object({ remote: z.string().default("origin") }),
      execute: (input) => withUsageAndSpend("git_push", ctx, async () => ({ remote: input.remote, pushed: false })),
    }),
    request_cross_project_read: tool({
      description: "Phase 1 cross-project read request stub.",
      inputSchema: z.object({ sourceMissionId: z.string(), purpose: z.string() }),
      execute: (input) => withUsageAndSpend("request_cross_project_read", ctx, async () => ({ requestId: crypto.randomUUID(), status: "pending", ...input })),
    }),
  };
}
