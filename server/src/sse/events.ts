import { db } from "edgespark";
import { eq, desc } from "drizzle-orm";
import { agentInstances, agents, auditEvents, missionSpend, usersProfile } from "../defs/db_schema";
import { BudgetService, recordAudit, recordCost, type AuditRecord, type CostRecord } from "../state/missionState";

export type MissionSseEvent = {
  type: string;
  missionId: string;
  auditEventId?: string;
  actor?: { type: "agent" | "user" | "system"; id: string };
  authorName: string;
  actionLabel: string;
  payload: Record<string, unknown>;
  occurredAt: string;
};

const ACTION_LABELS: Record<string, string> = {
  cost_event: "Recorded LLM usage",
  sandbox_burn: "Recorded sandbox usage",
  cost_event_recorded: "Recorded LLM usage",
  sandbox_burn_recorded: "Recorded sandbox usage",
  message_sent: "Sent a direct message",
  mission_chat_message_sent: "Sent a mission message",
  work_card_started: "Started a work card",
  work_card_completed: "Completed a work card",
  work_card_failed: "Work card failed",
  direct_thread_created: "Opened a direct thread",
  sandbox_paused: "Paused a sandbox",
};

function actionLabel(action: string) {
  return ACTION_LABELS[action] ?? action.replace(/_/g, " ");
}

async function resolveActorName(actor?: { type: "agent" | "user" | "system"; id: string }, instanceId?: string | null, agentId?: string | null) {
  if (actor?.type === "system") return "system";
  const instanceLookup = instanceId ?? (actor?.type === "agent" ? actor.id : undefined);
  if (instanceLookup) {
    const [row] = await db
      .select({ alias: agentInstances.displayAlias, displayName: agents.displayName })
      .from(agentInstances)
      .innerJoin(agents, eq(agents.id, agentInstances.agentId))
      .where(eq(agentInstances.id, instanceLookup))
      .limit(1);
    if (row) return row.alias || row.displayName;
  }
  const agentLookup = agentId ?? (actor?.type === "agent" ? actor.id : undefined);
  if (agentLookup) {
    const [row] = await db.select({ displayName: agents.displayName }).from(agents).where(eq(agents.id, agentLookup)).limit(1);
    if (row?.displayName) return row.displayName;
  }
  if (actor?.type === "user") {
    const [row] = await db.select({ email: usersProfile.email }).from(usersProfile).where(eq(usersProfile.userId, actor.id)).limit(1);
    return row?.email || "user";
  }
  return actor?.type ?? "system";
}

export async function emitAuditEvent(event: AuditRecord): Promise<string> {
  return recordAudit(event);
}

export async function emitCostEvent(event: CostRecord): Promise<MissionSseEvent> {
  if (event.costCents > 0) await BudgetService.assertCanSpend(event.missionId, event.costCents);
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
    actor: { type: "system", id: "runtime" },
    authorName: "system",
    actionLabel: actionLabel(event.eventType),
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
  const spendRows = await db
    .select()
    .from(missionSpend)
    .where(eq(missionSpend.missionId, missionId))
    .orderBy(desc(missionSpend.createdAt))
    .limit(50);
  const auditRows = await db
    .select()
    .from(auditEvents)
    .where(eq(auditEvents.missionId, missionId))
    .orderBy(desc(auditEvents.createdAt))
    .limit(50);
  const spendEvents = await Promise.all(spendRows.map(async (row: typeof missionSpend.$inferSelect) => {
    const actor = { type: "system" as const, id: "runtime" };
    return {
      type: row.eventType,
      missionId,
      actor,
      authorName: await resolveActorName(actor, row.instanceId, row.agentId),
      actionLabel: actionLabel(row.eventType),
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
    };
  }));
  const auditSseEvents = await Promise.all(auditRows.map(async (row: typeof auditEvents.$inferSelect) => {
    const actor = JSON.parse(row.actorJson) as { type: "agent" | "user" | "system"; id: string };
    const type =
      row.action === "message_sent"
        ? "direct_thread_message_sent"
        : row.action === "mission_chat_message_sent"
          ? "mission_chat_message_sent"
          : row.action === "work_card_completed"
            ? "work_card_completed"
            : row.action === "direct_thread_created"
              ? "direct_thread_ready"
              : row.action;
    return {
      type,
      missionId,
      auditEventId: row.eventId,
      actor,
      authorName: await resolveActorName(actor),
      actionLabel: actionLabel(row.action),
      occurredAt: row.createdAt,
      payload: {
        subjectType: row.subjectType,
        subjectId: row.subjectId,
        actor,
        clientActionId: row.clientActionId ?? undefined,
        diffSummary: row.diffSummary,
        payloadRef: row.payloadRefJson ? JSON.parse(row.payloadRefJson) : undefined,
      },
    };
  }));
  return [...spendEvents, ...auditSseEvents]
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
    .slice(0, 50);
}
