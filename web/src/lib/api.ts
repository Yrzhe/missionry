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

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
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
    throw new ApiError(response.status, code ?? response.statusText, code);
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
    throw new ApiError(response.status, response.statusText);
  }
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
