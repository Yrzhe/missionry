import type {
  AdminOverview,
  AdminUser,
  AgentLibraryItem,
  BudgetSettings,
  CreateAgentInput,
  CreateMissionInput,
  CreateWorkCardInput,
  DirectThreadReadModel,
  AgentWorkCardList,
  MissionChatMessage,
  MissionEvent,
  MissionEnvironment,
  MissionEnvironmentVariable,
  MissionFileContent,
  MissionArtifact,
  Schedule,
  CreateScheduleInput,
  ConciergeChatMessage,
  ConciergeOverview,
  SkillListItem,
  SkillDetail,
  MissionAgentRequest,
  MissionSpendBreakdown,
  MissionSummary,
  Session,
  UpdateAgentInput,
  WhitelistEntry,
  WorkroomReadModel,
} from './types';

const rawBase = import.meta.env.VITE_API_BASE_URL || '';
export const API_BASE_URL = rawBase.replace(/\/$/, '');
const publicBase = `${API_BASE_URL}/api/public`;

export class ApiError extends Error {
  status: number;
  code?: string;
  messageKey?: string;

  constructor(status: number, message: string, code?: string, messageKey?: string) {
    super(message);
    this.status = status;
    this.code = code;
    this.messageKey = messageKey;
  }
}

function parseAuthError(status: number, body: unknown, fallback: string) {
  const payload = body as {
    code?: string;
    message?: string;
    messageKey?: string;
    error?: string | { code?: string; message?: string; messageKey?: string };
  } | undefined;
  const errorObject = typeof payload?.error === 'object' ? payload.error : undefined;
  const code = errorObject?.code ?? payload?.code ?? (typeof payload?.error === 'string' ? payload.error : undefined);
  const messageKey = errorObject?.messageKey ?? payload?.messageKey;
  const message = errorObject?.message ?? payload?.message ?? code ?? fallback;
  return new ApiError(status, message, code, messageKey);
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${publicBase}${path}`, {
    credentials: 'include',
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
    ...init,
  });
  const text = await response.text();
  let body: { error?: { code?: string; messageKey?: string } } | undefined;
  try {
    body = text ? JSON.parse(text) : undefined;
  } catch {
    if (!response.ok) {
      throw new ApiError(response.status, response.statusText);
    }
    throw new ApiError(response.status, 'invalid_json_response');
  }
  if (!response.ok) {
    const code = body?.error?.code ?? body?.error?.messageKey;
    throw new ApiError(response.status, code ?? response.statusText, code, body?.error?.messageKey);
  }
  return body as T;
}

async function optional<T>(path: string, empty: T): Promise<T> {
  try {
    return await request<T>(path);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return empty;
    throw error;
  }
}

export async function login(email: string, password: string) {
  const response = await fetch(`${API_BASE_URL}/api/_es/auth/sign-in/email`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => undefined);
    throw parseAuthError(response.status, body, response.statusText);
  }
}

export async function changePassword(currentPassword: string, newPassword: string) {
  const response = await fetch(`${API_BASE_URL}/api/_es/auth/change-password`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ currentPassword, newPassword }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => undefined);
    throw parseAuthError(response.status, body, response.statusText);
  }
}

export async function updateMe(input: { name: string }): Promise<Session> {
  return request<Session>('/me', {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export async function signUp(email: string, password: string, name: string) {
  const gate = await fetch(`${publicBase}/auth/whitelist-check`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  if (!gate.ok) {
    const body = await gate.json().catch(() => undefined);
    throw parseAuthError(gate.status, body, gate.statusText);
  }
  const response = await fetch(`${API_BASE_URL}/api/_es/auth/sign-up/email`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password, name }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => undefined);
    throw parseAuthError(response.status, body, response.statusText);
  }
  return response.json().catch(() => ({ ok: true }));
}

export async function resolveSession(): Promise<Session> {
  const session = await request<Session>('/me');
  return {
    userId: session.userId,
    email: session.email,
    name: session.name,
    role: session.role,
  };
}

function normalizeMission(row: MissionSummary & Record<string, unknown>): MissionSummary {
  const stateJson = row.stateJson as { sharedSandbox?: Record<string, unknown>; issues?: MissionSummary['issues'] } | undefined;
  const ownerDisplayName = row.ownerDisplayName ?? row.ownerName ?? row.ownerEmail ?? row.ownerUserEmail ?? row.ownerAgentName ?? row.ownerAgentDisplayName;
  return {
    ...row,
    owner: row.owner ?? {
      type: row.ownerType === 'user' ? 'user' : 'agent',
      userId: row.ownerUserId as string | undefined,
      agentId: row.ownerAgentId as string | undefined,
      agentInstanceId: row.ownerInstanceId as string | undefined,
      displayName: String(ownerDisplayName ?? '-'),
    },
    issues: row.issues ?? stateJson?.issues,
    sandboxSummary: row.sandboxSummary ?? stateJson?.sharedSandbox,
    spentCents: row.spentCents ?? (row.missionSpendCents as number | undefined),
    budgetCapCents: row.budgetCapCents ?? (row.dailyBudgetCents as number | undefined),
  };
}

type RawMissionChatMessage = {
  id: string;
  missionId: string;
  body: string;
  author?: { type?: string; id?: string };
  authorType?: string;
  authorName?: string;
  authorInstanceId?: string;
  replyToMessageId?: string | null;
  createdAt: string;
};

type RawMissionFileEntry = {
  name?: string;
  path: string;
  relativePath?: string;
  type: 'file' | 'dir' | 'directory' | string;
  size?: number;
  updatedAt?: string;
};

type RawMissionEnvironment = Partial<MissionEnvironment> & {
  variables?: MissionEnvironmentVariable[] | Record<string, string | { value?: string; masked?: boolean; isSecret?: boolean; updatedAt?: string }>;
  env?: Record<string, string>;
};

function workspaceRelativePath(path: string) {
  return path.replace(/^\/?workspace\/?/, '').replace(/^\/+/, '');
}

function normalizeMissionChatMessage(row: RawMissionChatMessage): MissionChatMessage {
  const authorType = row.author?.type ?? row.authorType ?? 'system';
  const authorId = row.author?.id ?? row.authorName ?? 'system';
  const isAgentInstance = authorType === 'agent_instance' || authorType === 'agent';
  return {
    id: row.id,
    missionId: row.missionId,
    body: row.body,
    authorType: isAgentInstance ? 'agent' : authorType === 'user' ? 'user' : 'system',
    authorName: row.authorName ?? authorId,
    authorInstanceId: row.authorInstanceId ?? (isAgentInstance ? authorId : undefined),
    replyToMessageId: row.replyToMessageId ?? undefined,
    createdAt: row.createdAt,
  };
}

function normalizeMissionEnvironment(row: RawMissionEnvironment | undefined): MissionEnvironment {
  const rawVariables = row?.variables ?? row?.env ?? {};
  const variables = Array.isArray(rawVariables)
    ? rawVariables
    : Object.entries(rawVariables).map(([key, value]) => {
      if (typeof value === 'object' && value) return { key, ...(value as { value?: string; masked?: boolean; isSecret?: boolean; updatedAt?: string }) };
      return { key, value: String(value), masked: true };
    });
  return {
    versionId: row?.versionId,
    updatedAt: row?.updatedAt,
    variables: variables.map((item) => ({
      key: item.key,
      value: item.value,
      masked: item.masked ?? item.isSecret ?? true,
      isSecret: item.isSecret,
      updatedAt: item.updatedAt,
    })),
  };
}

export const api = {
  missions: async () => {
    const response = await request<{ items: Array<MissionSummary & Record<string, unknown>> }>('/missions');
    return { items: response.items.map(normalizeMission) };
  },
  mission: async (missionId: string) => normalizeMission(await request<MissionSummary & Record<string, unknown>>(`/missions/${missionId}`)),
  workroom: async (missionId: string) => {
    const response = await request<WorkroomReadModel & { mission: MissionSummary & Record<string, unknown> }>(`/missions/${missionId}/workroom`);
    return { ...response, mission: normalizeMission(response.mission) };
  },
  deleteMission: (missionId: string) => request<{ status?: string }>(`/missions/${missionId}`, { method: 'DELETE' }),
  createMission: (input: CreateMissionInput) => request<{ missionId: string; ownerInstanceId?: string | null }>('/missions', {
    method: 'POST',
    body: JSON.stringify({
      title: input.title,
      objective: input.objective,
      dailyBudgetCents: input.dailyBudgetCents,
      leaderMode: input.leaderMode,
      leaderAgentId: input.leaderAgentId,
      ...(input.leaderMode === 'human'
        ? { owner: { type: 'user' }, ownerType: 'user' }
        : input.leaderAgentId
          ? { owner: { type: 'agent', agentId: input.leaderAgentId }, ownerType: 'agent', ownerAgentId: input.leaderAgentId }
          : {}),
    }),
  }),
  createWorkCard: (missionId: string, input: CreateWorkCardInput) => request<{ workCardId: string; status?: string }>(`/missions/${missionId}/work-cards`, {
    method: 'POST',
    body: JSON.stringify({ ...input, sandboxTarget: input.sandboxAffinity.tier }),
  }),
  agents: () => request<{ items: AgentLibraryItem[] }>('/agents'),
  agentWorkCards: (agentId: string) => request<AgentWorkCardList>(`/agents/${agentId}/work-cards`),
  createAgent: (input: CreateAgentInput) => request<{ agent?: AgentLibraryItem; agentId?: string }>('/agents', {
    method: 'POST',
    body: JSON.stringify(input),
  }),
  updateAgent: (agentId: string, input: UpdateAgentInput) => request<{ agent?: AgentLibraryItem; status?: string }>(`/agents/${agentId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  }),
  recruitAgentToMission: (missionId: string, agentId: string) => request<{ instanceId?: string; status?: string }>(`/missions/${missionId}/agent-instances`, {
    method: 'POST',
    body: JSON.stringify({ agentId }),
  }),
  startMissionSandbox: (missionId: string) => request<{ status?: string }>(`/missions/${missionId}/sandbox/start`, { method: 'POST', body: '{}' }),
  pauseMissionSandbox: (missionId: string) => request<{ status?: string }>(`/missions/${missionId}/sandbox/pause`, { method: 'POST', body: '{}' }),
  startAgentSandbox: (missionId: string, instanceId: string) => request<{ status?: string }>(`/missions/${missionId}/agent-instances/${instanceId}/sandbox/start`, { method: 'POST', body: '{}' }),
  pauseAgentSandbox: (missionId: string, instanceId: string) => request<{ status?: string }>(`/missions/${missionId}/agent-instances/${instanceId}/sandbox/pause`, { method: 'POST', body: '{}' }),
  missionEnvironment: async (missionId: string) => normalizeMissionEnvironment(await optional<RawMissionEnvironment>(`/missions/${missionId}/environment`, { variables: [] })),
  updateMissionEnvironment: async (missionId: string, variables: MissionEnvironmentVariable[]) => normalizeMissionEnvironment(await request<RawMissionEnvironment>(`/missions/${missionId}/environment`, {
    method: 'PUT',
    body: JSON.stringify({ variables }),
  })),
  missionEvents: (missionId: string) => optional<{ items: MissionEvent[] }>(`/missions/${missionId}/events`, { items: [] }),
  missionAgentRequests: (missionId: string) => optional<{ items: MissionAgentRequest[] }>(`/missions/${missionId}/agent-requests`, { items: [] }),
  approveAgentRequest: (missionId: string, requestId: string) => request<{ status?: string; agentId?: string; instanceId?: string }>(`/missions/${missionId}/agent-requests/${requestId}/approve`, { method: 'POST', body: '{}' }),
  declineAgentRequest: (missionId: string, requestId: string) => request<{ status?: string }>(`/missions/${missionId}/agent-requests/${requestId}/decline`, { method: 'POST', body: '{}' }),
  missionFiles: async (missionId: string, path = '') => {
    const response = await request<{ path: string; state?: string; entries?: RawMissionFileEntry[] }>(`/missions/${missionId}/sandbox/files?path=${encodeURIComponent(workspaceRelativePath(path))}`);
    return {
      items: (response.entries ?? []).map((entry) => {
        const path = workspaceRelativePath(entry.relativePath ?? entry.path);
        return {
          name: entry.name ?? path.split('/').filter(Boolean).at(-1) ?? path,
          path,
          type: entry.type === 'dir' ? 'directory' as const : entry.type === 'directory' ? 'directory' as const : 'file' as const,
          size: entry.size,
          updatedAt: entry.updatedAt,
        };
      }),
    };
  },
  missionFileContent: (missionId: string, path: string) => request<MissionFileContent>(`/missions/${missionId}/sandbox/file?path=${encodeURIComponent(workspaceRelativePath(path))}`),
  missionArtifacts: (missionId: string) => request<{ items: MissionArtifact[] }>(`/missions/${missionId}/artifacts`),
  missionArtifactFile: (missionId: string, path: string) => request<{ path: string; content: string; found: boolean }>(`/missions/${missionId}/artifacts/file?path=${encodeURIComponent(path)}`),
  decomposeMission: (missionId: string) => request<{ actionId?: string; status?: string; created?: Array<{ workCardId: string; status: string }> }>(`/missions/${missionId}/decompose`, { method: 'POST', body: '{}' }),
  startWorkCard: (missionId: string, workCardId: string) => request<{ actionId?: string; status?: string; workCard?: unknown; workCardId?: string }>(`/missions/${missionId}/work-cards/${workCardId}/start`, { method: 'POST', body: '{}' }),
  assignWorkCard: (missionId: string, workCardId: string, assigneeInstanceId: string) => request<{ actionId?: string; status?: string; workCard?: unknown; workCardId?: string }>(`/missions/${missionId}/work-cards/${workCardId}/assign`, {
    method: 'POST',
    body: JSON.stringify({ assigneeInstanceId }),
  }),
  missionChat: async (missionId: string) => {
    const response = await request<{ items: RawMissionChatMessage[] }>(`/missions/${missionId}/chat`);
    return { items: response.items.map(normalizeMissionChatMessage) };
  },
  sendMissionChat: async (missionId: string, body: string, replyToMessageId?: string) => {
    const response = await request<{ message?: RawMissionChatMessage; agentReplies?: RawMissionChatMessage[] }>(`/missions/${missionId}/chat`, {
      method: 'POST',
      body: JSON.stringify({ body, replyToMessageId }),
    });
    return {
      message: response.message ? normalizeMissionChatMessage(response.message) : undefined,
      agentReplies: (response.agentReplies ?? []).map(normalizeMissionChatMessage),
    };
  },
  skills: () => request<{ items: SkillListItem[] }>(`/skills`),
  skill: (skillId: string) => request<SkillDetail>(`/skills/${skillId}`),
  setSkillAgents: (skillId: string, agentIds: string[]) => request<{ status: string; equippedAgentIds: string[] }>(`/skills/${skillId}/agents`, { method: 'PUT', body: JSON.stringify({ agentIds }) }),
  schedules: (missionId?: string) => request<{ items: Schedule[] }>(`/schedules${missionId ? `?missionId=${encodeURIComponent(missionId)}` : ''}`),
  createSchedule: (input: CreateScheduleInput) => request<Schedule>(`/schedules`, { method: 'POST', body: JSON.stringify(input) }),
  updateSchedule: (id: string, patch: Partial<Pick<Schedule, 'enabled' | 'intervalMinutes' | 'title' | 'prompt'>>) => request<Schedule>(`/schedules/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  deleteSchedule: (id: string) => request<{ status: string; id: string }>(`/schedules/${id}`, { method: 'DELETE' }),
  conciergeOverview: () => request<ConciergeOverview>(`/concierge/overview`),
  conciergeChat: () => request<{ items: ConciergeChatMessage[] }>(`/concierge/chat`),
  sendConciergeChat: (body: string) => request<{ message: ConciergeChatMessage; reply: ConciergeChatMessage }>(`/concierge/chat`, { method: 'POST', body: JSON.stringify({ body }) }),
  agentMemory: (agentId: string) => request<{ memory: string }>(`/agents/${agentId}/memory`),
  updateAgentMemory: (agentId: string, content: string) => request<{ memory: string }>(`/agents/${agentId}/memory`, { method: 'PUT', body: JSON.stringify({ content }) }),
  memoryProfile: () => request<{ profile: string }>(`/me/memory-profile`),
  updateMemoryProfile: (content: string) => request<{ profile: string }>(`/me/memory-profile`, { method: 'PUT', body: JSON.stringify({ content }) }),
  workCardMessages: async (missionId: string, cardId: string) => {
    const response = await request<{ items: RawMissionChatMessage[] }>(`/missions/${missionId}/work-cards/${cardId}/messages`);
    return { items: response.items.map(normalizeMissionChatMessage) };
  },
  sendWorkCardMessage: async (missionId: string, cardId: string, body: string) => {
    const response = await request<{ message?: RawMissionChatMessage; agentReplies?: RawMissionChatMessage[] }>(`/missions/${missionId}/work-cards/${cardId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ body }),
    });
    return {
      message: response.message ? normalizeMissionChatMessage(response.message) : undefined,
      agentReplies: (response.agentReplies ?? []).map(normalizeMissionChatMessage),
    };
  },
  directThread: (threadId: string) => request<DirectThreadReadModel>(`/direct-threads/${threadId}/messages`),
  createDirectThread: (missionId: string, instanceId: string) => request<{ chatThreadId: string; created?: boolean }>(`/missions/${missionId}/agent-instances/${instanceId}/direct-thread`, { method: 'POST', body: '{}' }),
  sendDirectThreadMessage: (threadId: string, body: string) => request<{ message?: DirectThreadReadModel['messages'][number]; agentReply?: DirectThreadReadModel['messages'][number] }>(`/direct-threads/${threadId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ body, clientActionId: `web_${Date.now()}` }),
  }),
  rollbackAuditEvent: (auditEventId: string) => request<{ status?: string; rollbackAuditEventId?: string }>(`/audit-events/${auditEventId}/rollback`, { method: 'POST', body: '{}' }),
  createDemoMission: () => request<{ mission?: MissionSummary; missionId?: string }>('/missions/demo', { method: 'POST', body: '{}' }),
  budget: () => optional<BudgetSettings>('/settings/budget', {
    dailyBudgetCents: 0,
    globalCapCents: 0,
    currentSpendCents: { total: 0, llm: 0, sandbox: 0, other: 0 },
  }),
  missionSpend: () => optional<{ items: MissionSpendBreakdown[] }>('/settings/budget/missions', { items: [] }),
  adminOverview: () => request<AdminOverview>('/admin/overview'),
  adminUsers: () => request<{ items: AdminUser[] }>('/admin/users'),
  adminWhitelist: () => request<{ items: WhitelistEntry[] }>('/admin/whitelist'),
  addWhitelistEntry: (type: WhitelistEntry['type'], value: string) => request<{ entry: WhitelistEntry; status?: string }>('/admin/whitelist', {
    method: 'POST',
    body: JSON.stringify({ type, value }),
  }),
  removeWhitelistEntry: (id: string) => request<{ status?: string }>(`/admin/whitelist/${id}`, { method: 'DELETE' }),
  adminMissions: () => request<{ items: MissionSpendBreakdown[] }>('/admin/missions'),
};

export function eventUrl(missionId: string) {
  return `${publicBase}/missions/${missionId}/events`;
}
