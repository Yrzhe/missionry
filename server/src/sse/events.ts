import type { EdgeSparkDb } from "../defs/runtime";
import { recordAudit, recordCost, type AuditRecord, type CostRecord } from "../state/missionState";

export type MissionSseEvent = {
  type: string;
  missionId: string;
  auditEventId?: string;
  payload: Record<string, unknown>;
  occurredAt: string;
};

export async function emitAuditEvent(db: EdgeSparkDb, event: AuditRecord): Promise<string> {
  return recordAudit(db, event);
}

export async function emitCostEvent(db: EdgeSparkDb, event: CostRecord): Promise<MissionSseEvent> {
  await recordCost(db, event);
  const auditEventId = await recordAudit(db, {
    missionId: event.missionId,
    subjectType: "cost",
    subjectId: event.sandboxId ?? event.instanceId ?? event.agentId ?? event.missionId,
    actor: { type: "system", id: "runtime" },
    action: event.eventType === "sandbox_burn" ? "sandbox_burn_recorded" : "cost_event_recorded",
    clientActionId: event.clientActionId,
    diffSummary: event.eventType,
    reversible: false,
    rollbackAvailable: false,
  });
  return {
    type: event.eventType,
    missionId: event.missionId,
    auditEventId,
    occurredAt: new Date().toISOString(),
    payload: {
      clientActionId: event.clientActionId,
      agentId: event.agentId,
      instanceId: event.instanceId,
      model: event.model,
      promptTokens: event.promptTokens,
      completionTokens: event.completionTokens,
      costCents: event.costCents,
      sandboxId: event.sandboxId,
      sandboxSeconds: event.sandboxSeconds,
    },
  };
}

export async function recentMissionEvents(db: EdgeSparkDb, missionId: string): Promise<MissionSseEvent[]> {
  const spend = await db
    .prepare("select * from mission_spend where mission_id = ? order by created_at desc limit 20")
    .bind(missionId)
    .all();
  return (spend.results ?? []).reverse().map((row) => ({
    type: String(row.event_type),
    missionId,
    occurredAt: String(row.created_at),
    payload: {
      clientActionId: row.client_action_id ?? undefined,
      agentId: row.agent_id ?? undefined,
      instanceId: row.instance_id ?? undefined,
      model: row.model ?? undefined,
      promptTokens: row.prompt_tokens ?? undefined,
      completionTokens: row.completion_tokens ?? undefined,
      costCents: Number(row.cost_cents),
      sandboxId: row.sandbox_id ?? undefined,
      sandboxSeconds: row.sandbox_seconds ?? undefined,
    },
  }));
}
