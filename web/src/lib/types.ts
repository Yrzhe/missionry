export type Role = 'admin' | 'user';
export type SandboxState = 'none' | 'starting' | 'running' | 'paused' | 'resuming' | 'killed' | 'error';

export type Session = {
  email: string;
  role: Role;
};

export type MissionOwner = {
  type: 'user' | 'agent';
  userId?: string;
  agentId?: string;
  agentInstanceId?: string;
  displayName: string;
};

export type CreateMissionInput = {
  title: string;
  objective: string;
  dailyBudgetCents: number;
};

export type MissionSummary = {
  id: string;
  title: string;
  objective: string;
  status: string;
  updatedAt?: string;
  updated?: string;
  owner?: MissionOwner;
  leaderInstanceId?: string;
  agentCount?: number;
  pendingCount?: number;
  artifactCount?: number;
  issues?: {
    total: number;
    completed: number;
    open: number;
    addedAfterDone?: number;
    completedRatio?: number;
  };
  budgetCapCents?: number;
  dailyBudgetCents?: number;
  spentCents?: number;
  missionSpendCents?: number;
  sandboxSummary?: Partial<MissionSandboxReadModel>;
};

export type AgentRef = {
  id: string;
  displayName: string;
  avatar?: Record<string, unknown>;
  globalIdentity?: {
    role?: string;
    baseConfigSummary?: string;
    version?: string;
    updatedAt?: string;
  };
};

export type AgentLibraryItem = AgentRef & {
  slug?: string;
  role?: string;
  model?: string;
  skills?: string[];
  updatedAt?: string;
  createdAt?: string;
};

export type CreateAgentInput = {
  displayName: string;
  role: string;
  avatarSeed: string;
};

export type MissionAgentRow = {
  agent: AgentRef;
  instance: {
    id: string;
    missionId: string;
    agentId: string;
    displayAlias?: string;
    workState?: { status?: string; currentWorkCardId?: string; lastActivityAt?: string };
    sandboxSummary?: Partial<MissionSandboxReadModel>;
    lastSelfUpdateAt?: string;
    hasUnreviewedSelfUpdates?: boolean;
  };
  role: string;
  chatThreadId?: string;
};

export type WorkCard = {
  id: string;
  title: string;
  description?: string;
  assigneeInstanceId?: string;
  status: string;
  priority?: string;
  dependencies?: string[];
  issueIds?: string[];
  sandboxAffinity?: {
    tier: 'tier0' | 'mission' | 'private';
    reason: string;
    sandboxId?: string;
    requiresIsolation?: boolean;
  };
  cost?: {
    estimatedCents?: number;
    spentCents?: number;
    burnRateCentsPerMinute?: number;
  };
  createdAt?: string;
  updatedAt?: string;
};

export type CreateWorkCardInput = {
  title: string;
  description?: string;
  assigneeInstanceId: string;
  sandboxAffinity: {
    tier: 'tier0' | 'mission' | 'private';
    reason: string;
  };
};

export type MissionSandboxReadModel = {
  sandboxId?: string;
  state: SandboxState;
  active?: boolean;
  activeSandboxCount?: number;
  burnRateCentsPerMinute?: number;
  environmentVersionId?: string;
  injectedCredentialIds?: string[];
  injectedVariableKeys?: string[];
  environmentAccessMode?: 'inherit' | 'restricted' | 'blocked';
  repoPath?: string;
  r2SnapshotKey?: string;
  lastActivityAt?: string;
  processes?: Array<{
    id: string;
    command: string;
    status: string;
    terminalSessionId?: string;
    streamId?: string;
  }>;
};

export type MissionChatMessage = {
  id: string;
  missionId: string;
  body: string;
  authorType: 'user' | 'agent' | 'system';
  authorName: string;
  authorInstanceId?: string;
  replyToMessageId?: string;
  createdAt: string;
};

export type DirectThreadMessage = {
  id: string;
  threadId: string;
  missionId: string;
  agentInstanceId: string;
  sender: {
    type: 'user' | 'agent' | 'system';
    id: string;
  };
  body: string;
  createdAt: string;
  auditEventId?: string;
};

export type DirectThreadReadModel = {
  threadId: string;
  missionId: string;
  agentInstanceId: string;
  messages: DirectThreadMessage[];
  unreadCount?: number;
  lastMessageAt?: string;
};

export type WorkroomReadModel = {
  mission: MissionSummary;
  metricStrip: {
    activeSandboxCount: number;
    burnRateCentsPerMinute: number;
    missionSpendCents: number;
    dailyBudgetCents: number;
    privateCap: {
      maxConcurrentPrivateSandboxes: number;
      activePrivateSandboxes: number;
    };
  };
  workCards: WorkCard[];
  missionSandbox: MissionSandboxReadModel;
  agentInstances: MissionAgentRow[];
  openIssues: number;
  costGuardrailStatus?: { state: string; message?: string };
  updatedAt?: string;
};

export type BudgetSettings = {
  dailyBudgetCents: number;
  globalCapCents: number;
  currency?: string;
  resetAt?: string;
  currentSpendCents?: { total: number; llm: number; sandbox: number; other: number };
  burnRateCentsPerMinute?: number;
};

export type MissionSpendBreakdown = {
  missionId: string;
  title: string;
  owner?: MissionOwner;
  ownerEmail?: string;
  capCents?: number;
  spentCents?: number;
  spendCents?: number;
  llmSpentCents?: number;
  sandboxSpentCents?: number;
  otherSpentCents?: number;
  burnRateCentsPerMinute?: number;
  status?: string;
  sandboxSummary?: Partial<MissionSandboxReadModel>;
};

export type AdminOverview = {
  totalSpendCents?: number;
  missionCount?: number;
  activeUserCount?: number;
  top5UsersBySpend?: AdminUser[];
};

export type AdminUser = {
  userId: string;
  email: string;
  role: Role;
  dailyBudgetCents: number;
  dailySpendCents?: number;
  todaySpendCents?: number;
};

export type WhitelistEntry = {
  id: string;
  type: 'email' | 'suffix';
  value: string;
  enabled: boolean | number;
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type MissionEvent = {
  type: string;
  missionId?: string;
  payload?: {
    costCents?: number;
    sandboxSeconds?: number;
    sandboxId?: string;
    burnRateCentsPerMinute?: number;
    agentId?: string;
    instanceId?: string;
    model?: string;
    message?: MissionChatMessage;
    chatMessage?: MissionChatMessage;
    subjectType?: string;
    subjectId?: string;
    actor?: {
      type?: string;
      id?: string;
    };
    diffSummary?: string;
    payloadRef?: {
      r2Key?: string;
      previousBody?: string;
    };
  };
  auditEventId?: string;
  occurredAt?: string;
};

export type MissionFileEntry = {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
  updatedAt?: string;
};

export type MissionFileContent = {
  path: string;
  content: string;
  mimeType?: string;
  updatedAt?: string;
};
