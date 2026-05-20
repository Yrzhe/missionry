import { createOpenAI } from "@ai-sdk/openai";
import { streamText } from "ai";
import { loadAgentBootFiles } from "../agents/files";
import type { EdgeSparkRuntime } from "../defs/runtime";
import { emitCostEvent } from "../sse/events";
import { missionryToolKit } from "../tools";

export type AgentTurnContext = EdgeSparkRuntime & {
  missionId: string;
  agentId: string;
  instanceId: string;
  turnId: string;
  clientActionId?: string;
  workCardId?: string;
  messages: Array<{ role: "user" | "assistant" | "system"; content: string }>;
  missionContext?: string;
};

function estimateLlmCostCents(model: string, usage: Record<string, unknown>) {
  const promptTokens = Number(usage.promptTokens ?? usage.inputTokens ?? 0);
  const completionTokens = Number(usage.completionTokens ?? usage.outputTokens ?? 0);
  const cheapRate = model.includes("mini") ? 0.000001 : 0.00001;
  return Math.max(1, Math.ceil((promptTokens + completionTokens) * cheapRate));
}

export async function streamAgentTurn(ctx: AgentTurnContext): Promise<Response> {
  const apiKey = await ctx.secret.get("OPENAI_API_KEY");
  if (!apiKey) {
    return Response.json({ code: "error.secret.openai_missing" }, { status: 500 });
  }

  const boot = await loadAgentBootFiles(ctx.storage, ctx.agentId);
  const modelName = boot.baseConfig.model ?? "gpt-4o-mini";
  const openai = createOpenAI({ apiKey });

  const result = streamText({
    model: openai(modelName),
    system: [
      boot.soul,
      boot.identity,
      `Skill index: ${JSON.stringify(boot.skillsIndex)}`,
      `Mission context: ${ctx.missionContext ?? "Phase 1 demo"}`,
    ].join("\n\n"),
    messages: ctx.messages,
    tools: missionryToolKit({
      missionId: ctx.missionId,
      agentId: ctx.agentId,
      instanceId: ctx.instanceId,
      turnId: ctx.turnId,
      clientActionId: ctx.clientActionId,
      workCardId: ctx.workCardId,
      db: ctx.db,
      storage: ctx.storage,
      secret: ctx.secret,
      vars: ctx.vars,
      ctx: ctx.ctx,
    }),
    onFinish: async ({ usage, finishReason }) => {
      const usageRecord = usage as unknown as Record<string, unknown>;
      const costCents = estimateLlmCostCents(modelName, usageRecord);
      await emitCostEvent(ctx.db, {
        missionId: ctx.missionId,
        clientActionId: ctx.clientActionId,
        agentId: ctx.agentId,
        instanceId: ctx.instanceId,
        model: modelName,
        promptTokens: Number(usageRecord.promptTokens ?? usageRecord.inputTokens ?? 0),
        completionTokens: Number(usageRecord.completionTokens ?? usageRecord.outputTokens ?? 0),
        costCents,
        eventType: "cost_event",
      });
      if (finishReason === "error") {
        await ctx.db
          .prepare("insert into audit_events (id, event_id, subject_type, subject_id, actor_json, action, diff_summary, reversible, rollback_available, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
          .bind(
            crypto.randomUUID(),
            `evt_${crypto.randomUUID()}`,
            "mission",
            ctx.missionId,
            JSON.stringify({ type: "system", id: "runtime" }),
            "stream_error",
            "error.stream.failed",
            0,
            0,
            new Date().toISOString(),
          )
          .run();
      }
    },
  });

  return result.toTextStreamResponse();
}
