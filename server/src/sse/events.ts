import { db } from "edgespark";
import { eq, desc } from "drizzle-orm";
import { missionSpend } from "../defs/db_schema";
import { recordAudit, recordCost, type AuditRecord, type CostRecord } from "../state/missionState";

export type MissionSseEvent = {
  type: string;
  missionId: string;
  auditEventId?: string;
  payload: Record<string, unknown>;
  occurredAt: string;
};

export async function emitAuditEvent(event: AuditRecord): Promise<string> {
  return recordAudit(event);
}

export async function emitCostEvent(event: CostRecord): Promise<MissionSseEvent> {
  await recordCost(event);
  const auditEventId = await recordAudit({
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

export async function recentMissionEvents(missionId: string): Promise<MissionSseEvent[]> {
  const rows = await db
    .select()
    .from(missionSpend)
    .where(eq(missionSpend.missionId, missionId))
    .orderBy(desc(missionSpend.createdAt))
    .limit(20);
  return rows.reverse().map((row: typeof missionSpend.$inferSelect) => ({
    type: row.eventType,
    missionId,
    occurredAt: row.createdAt,
    payload: {
      clientActionId: row.clientActionId ?? undefined,
      agentId: row.agentId ?? undefined,
      instanceId: row.instanceId ?? undefined,
      model: row.model ?? undefined,
      promptTokens: row.promptTokens ?? undefined,
      completionTokens: row.completionTokens ?? undefined,
      costCents: row.costCents,
      sandboxId: row.sandboxId ?? undefined,
      sandboxSeconds: row.sandboxSeconds ?? undefined,
    },
  }));
}
