import { relations } from "drizzle-orm";
import { agentInstances, agents, auditEvents, directThreadMessages, directThreads, missionSpend, missions, sandboxRuntime, workCards } from "./db_schema";

export const missionRelations = relations(missions, ({ many }) => ({
  agentInstances: many(agentInstances),
  workCards: many(workCards),
  directThreads: many(directThreads),
  auditEvents: many(auditEvents),
  spendEvents: many(missionSpend),
  sandboxes: many(sandboxRuntime),
}));

export const directThreadRelations = relations(directThreads, ({ one, many }) => ({
  mission: one(missions, {
    fields: [directThreads.missionId],
    references: [missions.id],
  }),
  agentInstance: one(agentInstances, {
    fields: [directThreads.agentInstanceId],
    references: [agentInstances.id],
  }),
  messages: many(directThreadMessages),
}));

export const directThreadMessageRelations = relations(directThreadMessages, ({ one }) => ({
  thread: one(directThreads, {
    fields: [directThreadMessages.threadId],
    references: [directThreads.id],
  }),
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
