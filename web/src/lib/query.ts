import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      gcTime: 5 * 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

export const queryKeys = {
  session: ['session'] as const,
  missions: ['missions'] as const,
  workroom: (missionId: string) => ['missions', missionId, 'workroom'] as const,
  missionEnvironment: (missionId: string) => ['missions', missionId, 'environment'] as const,
  missionChat: (missionId: string) => ['missions', missionId, 'chat'] as const,
  missionEvents: (missionId: string) => ['missions', missionId, 'events'] as const,
  missionAgentRequests: (missionId: string) => ['missions', missionId, 'agent-requests'] as const,
  missionFiles: (missionId: string, path = '') => ['missions', missionId, 'files', path] as const,
  missionFileContent: (missionId: string, path: string) => ['missions', missionId, 'file', path] as const,
  agents: ['agents'] as const,
  agentWorkCards: (agentId: string) => ['agents', agentId, 'work-cards'] as const,
  directThread: (threadId: string) => ['direct-threads', threadId] as const,
  budget: ['budget'] as const,
  missionSpend: ['budget', 'missions'] as const,
  adminOverview: ['admin', 'overview'] as const,
  adminUsers: ['admin', 'users'] as const,
  adminWhitelist: ['admin', 'whitelist'] as const,
  adminMissions: ['admin', 'missions'] as const,
};

export function invalidateMission(missionId: string) {
  void queryClient.invalidateQueries({ queryKey: ['missions', missionId] });
  void queryClient.invalidateQueries({ queryKey: queryKeys.missionEnvironment(missionId) });
  void queryClient.invalidateQueries({ queryKey: queryKeys.missions });
  void queryClient.invalidateQueries({ queryKey: queryKeys.budget });
  void queryClient.invalidateQueries({ queryKey: queryKeys.missionSpend });
}
