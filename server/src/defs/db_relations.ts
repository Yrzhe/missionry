import { relations } from "drizzle-orm";
import { agentInstances, agents, auditEvents, missionSpend, missions, workCards } from "./db_schema";

export const missionRelations = relations(missions, ({ many }) => ({
  agentInstances: many(agentInstances),
  workCards: many(workCards),
  auditEvents: many(auditEvents),
  spendEvents: many(missionSpend),
}));

export const agentRelations = relations(agents, ({ many }) => ({
  instances: many(agentInstances),
}));

export const agentInstanceRelations = relations(agentInstances, ({ one }) => ({
  mission: one(missions, {
    fields: [agentInstances.missionId],
    references: [missions.id],
  }),
  agent: one(agents, {
    fields: [agentInstances.agentId],
    references: [agents.id],
  }),
}));

export const workCardRelations = relations(workCards, ({ one }) => ({
  mission: one(missions, {
    fields: [workCards.missionId],
    references: [missions.id],
  }),
}));
