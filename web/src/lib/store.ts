import { create } from 'zustand';
import type {
  AdminOverview,
  AdminUser,
  BudgetSettings,
  MissionEvent,
  MissionSpendBreakdown,
  MissionSummary,
  Session,
  WhitelistEntry,
  WorkroomReadModel,
} from './types';

type AppState = {
  session: Session | null;
  missions: MissionSummary[];
  workrooms: Record<string, WorkroomReadModel>;
  budget: BudgetSettings | null;
  spend: MissionSpendBreakdown[];
  adminOverview: AdminOverview | null;
  adminUsers: AdminUser[];
  adminWhitelist: WhitelistEntry[];
  adminMissions: MissionSpendBreakdown[];
  events: MissionEvent[];
  setSession: (session: Session | null) => void;
  setMissions: (missions: MissionSummary[]) => void;
  setWorkroom: (missionId: string, workroom: WorkroomReadModel) => void;
  setBudget: (budget: BudgetSettings | null) => void;
  setSpend: (spend: MissionSpendBreakdown[]) => void;
  setAdmin: (data: Partial<Pick<AppState, 'adminOverview' | 'adminUsers' | 'adminWhitelist' | 'adminMissions'>>) => void;
  applyEvent: (event: MissionEvent) => void;
};

export const useAppStore = create<AppState>((set) => ({
  session: null,
  missions: [],
  workrooms: {},
  budget: null,
  spend: [],
  adminOverview: null,
  adminUsers: [],
  adminWhitelist: [],
  adminMissions: [],
  events: [],
  setSession: (session) => set({ session }),
  setMissions: (missions) => set({ missions }),
  setWorkroom: (missionId, workroom) => set((state) => ({ workrooms: { ...state.workrooms, [missionId]: workroom } })),
  setBudget: (budget) => set({ budget }),
  setSpend: (spend) => set({ spend }),
  setAdmin: (data) => set(data),
  applyEvent: (event) =>
    set((state) => {
      const events = [event, ...state.events].slice(0, 30);
      const missionId = event.missionId;
      if (!missionId) return { events };
      const workroom = state.workrooms[missionId];
      if (!workroom) return { events };
      const cost = event.payload?.costCents ?? 0;
      const burn = event.payload?.burnRateCentsPerMinute;
      return {
        events,
        workrooms: {
          ...state.workrooms,
          [missionId]: {
            ...workroom,
            metricStrip: {
              ...workroom.metricStrip,
              missionSpendCents: workroom.metricStrip.missionSpendCents + cost,
              burnRateCentsPerMinute: burn ?? workroom.metricStrip.burnRateCentsPerMinute,
            },
          },
        },
      };
    }),
}));
