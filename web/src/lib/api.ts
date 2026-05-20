import type {
  AdminOverview,
  AdminUser,
  BudgetSettings,
  MissionSpendBreakdown,
  MissionSummary,
  Session,
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
  const body = text ? JSON.parse(text) : undefined;
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
  if (!response.ok && response.status !== 404) {
    const body = await response.json().catch(() => undefined);
    throw parseAuthError(response.status, body, response.statusText);
  }
}

export async function signUp(email: string, password: string, name: string) {
  const response = await fetch(`${publicBase}/auth/sign-up`, {
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
  await request('/health');
  try {
    await request<AdminOverview>('/admin/overview');
    return { email: 'qq1514337391@gmail.com', role: 'admin' };
  } catch (error) {
    if (error instanceof ApiError && error.status === 403) {
      await request('/missions');
      return { email: 'user', role: 'user' };
    }
    throw error;
  }
}

function normalizeMission(row: MissionSummary & Record<string, unknown>): MissionSummary {
  const stateJson = row.stateJson as { sharedSandbox?: Record<string, unknown>; issues?: MissionSummary['issues'] } | undefined;
  return {
    ...row,
    owner: row.owner ?? {
      type: row.ownerType === 'user' ? 'user' : 'agent',
      userId: row.ownerUserId as string | undefined,
      agentId: row.ownerAgentId as string | undefined,
      agentInstanceId: row.ownerInstanceId as string | undefined,
      displayName: String(row.ownerAgentId ?? row.ownerUserId ?? '-'),
    },
    issues: row.issues ?? stateJson?.issues,
    sandboxSummary: row.sandboxSummary ?? stateJson?.sharedSandbox,
    spentCents: row.spentCents ?? (row.missionSpendCents as number | undefined),
    budgetCapCents: row.budgetCapCents ?? (row.dailyBudgetCents as number | undefined),
  };
}

export const api = {
  missions: async () => {
    const response = await request<{ items: Array<MissionSummary & Record<string, unknown>> }>('/missions');
    return { items: response.items.map(normalizeMission) };
  },
  mission: (missionId: string) => request<MissionSummary>(`/missions/${missionId}`),
  workroom: (missionId: string) => request<WorkroomReadModel>(`/missions/${missionId}/workroom`),
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
  adminMissions: () => request<{ items: MissionSpendBreakdown[] }>('/admin/missions'),
};

export function eventUrl(missionId: string) {
  return `${publicBase}/missions/${missionId}/events`;
}
