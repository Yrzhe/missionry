import { createOpenAI } from "@ai-sdk/openai";
import { secret } from "edgespark";
import { streamText } from "ai";
import { loadAgentBootFiles } from "../agents/files";
import { emitCostEvent } from "../sse/events";
import { BudgetService, recordAudit } from "../state/missionState";
import { missionryToolKit } from "../tools";

export type AgentTurnContext = {
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
  const pricing = model.includes("gpt-5.5") ? { inputPerMillion: 5, outputPerMillion: 30 } : model.includes("mini") ? { inputPerMillion: 0.15, outputPerMillion: 0.6 } : { inputPerMillion: 10, outputPerMillion: 30 };
  const dollars = (promptTokens * pricing.inputPerMillion + completionTokens * pricing.outputPerMillion) / 1_000_000;
  return Math.max(1, Math.ceil(dollars * 100));
}

export async function streamAgentTurn(turn: AgentTurnContext): Promise<Response> {
  await BudgetService.assertCanSpend(turn.missionId, 1);
  const apiKey = await secret.get("OPENAI_API_KEY");
  if (!apiKey) return Response.json({ code: "error.secret.openai_missing" }, { status: 500 });

  const boot = await loadAgentBootFiles(turn.agentId);
  const modelName = boot.baseConfig.model ?? "gpt-4o-mini";
  const openai = createOpenAI({ apiKey });

  const result = streamText({
    model: openai(modelName),
    system: [
      boot.soul,
      boot.identity,
      `Skill index: ${JSON.stringify(boot.skillsIndex)}`,
      `Mission context: ${turn.missionContext ?? "Phase 1 demo"}`,
    ].join("\n\n"),
    messages: turn.messages,
    tools: missionryToolKit(turn),
    onFinish: async ({ usage, finishReason }) => {
      const usageRecord = usage as unknown as Record<string, unknown>;
      await emitCostEvent({
        missionId: turn.missionId,
        clientActionId: turn.clientActionId,
        agentId: turn.agentId,
        instanceId: turn.instanceId,
        model: modelName,
        promptTokens: Number(usageRecord.promptTokens ?? usageRecord.inputTokens ?? 0),
        completionTokens: Number(usageRecord.completionTokens ?? usageRecord.outputTokens ?? 0),
        costCents: estimateLlmCostCents(modelName, usageRecord),
        eventType: "cost_event",
      });
      if (finishReason === "error") {
        await recordAudit({
          missionId: turn.missionId,
          subjectType: "mission",
          subjectId: turn.missionId,
          actor: { type: "system", id: "runtime" },
          action: "stream_error",
          diffSummary: "error.stream.failed",
        });
      }
    },
  });

  return result.toTextStreamResponse();
}
