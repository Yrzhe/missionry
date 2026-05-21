import { z } from "zod";

export const missionEventSchema = z.object({
  type: z.string(),
  missionId: z.string(),
  auditEventId: z.string().optional(),
  actor: z.object({ type: z.enum(["agent", "user", "system"]), id: z.string() }).optional(),
  authorName: z.string(),
  actionLabel: z.string(),
  payload: z.record(z.string(), z.unknown()),
  occurredAt: z.string(),
});

export const missionEventsResponseSchema = z.object({
  items: z.array(missionEventSchema),
});

export const sandboxFileEntrySchema = z.object({
  name: z.string(),
  path: z.string(),
  displayPath: z.string().optional(),
  type: z.enum(["dir", "file"]),
  size: z.number().optional(),
});

export const sandboxFilesResponseSchema = z.object({
  path: z.string(),
  state: z.enum(["running", "none"]),
  entries: z.array(sandboxFileEntrySchema),
});

export const sandboxFileResponseSchema = z.object({
  path: z.string(),
  state: z.enum(["running", "none"]),
  content: z.string(),
});

export const directThreadCreateResponseSchema = z.object({
  actionId: z.string(),
  status: z.literal("completed"),
  chatThreadId: z.string(),
  created: z.boolean(),
  auditEventId: z.string().optional(),
});

export const workCardStatusSchema = z.enum(["proposed", "approved", "queued", "pending", "running", "done", "failed", "cancelled", "blocked"]);

export const workCardResponseSchema = z.object({
  id: z.string(),
  missionId: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  assigneeInstanceId: z.string().nullable(),
  reviewerInstanceId: z.string().nullable(),
  status: workCardStatusSchema,
  priority: z.string(),
  sandboxAffinity: z.object({
    tier: z.enum(["tier0", "mission", "private"]),
    reason: z.string(),
  }),
  dependencies: z.array(z.unknown()),
  issueIds: z.array(z.unknown()),
  cost: z.record(z.string(), z.unknown()),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const startWorkCardResponseSchema = z.object({
  actionId: z.string(),
  status: z.literal("completed"),
  workCard: workCardResponseSchema,
  workroom: z.object({
    mission: z.record(z.string(), z.unknown()),
    workCards: z.array(workCardResponseSchema),
    agentInstances: z.array(z.record(z.string(), z.unknown())),
  }),
});

export const agentWorkCardsResponseSchema = z.object({
  running: workCardResponseSchema.nullable(),
  queued: z.array(workCardResponseSchema),
  recentDone: z.array(workCardResponseSchema),
});

export type MissionEventsResponse = z.infer<typeof missionEventsResponseSchema>;
export type SandboxFilesResponse = z.infer<typeof sandboxFilesResponseSchema>;
export type SandboxFileResponse = z.infer<typeof sandboxFileResponseSchema>;
export type StartWorkCardResponse = z.infer<typeof startWorkCardResponseSchema>;
export type DirectThreadCreateResponse = z.infer<typeof directThreadCreateResponseSchema>;
export type AgentWorkCardsResponse = z.infer<typeof agentWorkCardsResponseSchema>;
