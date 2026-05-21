import { create } from 'zustand';
import type {
  AdminOverview,
  AdminUser,
  BudgetSettings,
  MissionEvent,
  MissionChatMessage,
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
  missionChats: Record<string, MissionChatMessage[]>;
  setSession: (session: Session | null) => void;
  setMissions: (missions: MissionSummary[]) => void;
  setWorkroom: (missionId: string, workroom: WorkroomReadModel) => void;
  setBudget: (budget: BudgetSettings | null) => void;
  setSpend: (spend: MissionSpendBreakdown[]) => void;
  setAdmin: (data: Partial<Pick<AppState, 'adminOverview' | 'adminUsers' | 'adminWhitelist' | 'adminMissions'>>) => void;
  applyEvent: (event: MissionEvent) => void;
  setMissionChat: (missionId: string, messages: MissionChatMessage[]) => void;
  appendMissionChat: (missionId: string, message: MissionChatMessage) => void;
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
  missionChats: {},
  setSession: (session) => set({ session }),
  setMissions: (missions) => set({ missions }),
  setWorkroom: (missionId, workroom) => set((state) => ({ workrooms: { ...state.workrooms, [missionId]: workroom } })),
  setBudget: (budget) => set({ budget }),
  setSpend: (spend) => set({ spend }),
  setAdmin: (data) => set(data),
  setMissionChat: (missionId, messages) => set((state) => ({ missionChats: { ...state.missionChats, [missionId]: messages } })),
  appendMissionChat: (missionId, message) => set((state) => ({ missionChats: { ...state.missionChats, [missionId]: [...(state.missionChats[missionId] ?? []), message] } })),
  applyEvent: (event) =>
    set((state) => {
      const events = [event, ...state.events].slice(0, 30);
      const missionId = event.missionId;
      const chatMessage = event.type === 'mission_chat_message_sent' ? event.payload?.message ?? event.payload?.chatMessage : undefined;
      const missionChats = missionId && chatMessage
        ? { ...state.missionChats, [missionId]: [...(state.missionChats[missionId] ?? []), chatMessage] }
        : state.missionChats;
      if (!missionId) return { events, missionChats };
      const workroom = state.workrooms[missionId];
      if (!workroom) return { events, missionChats };
      const cost = event.payload?.costCents ?? 0;
      const burn = event.payload?.burnRateCentsPerMinute;
      return {
        events,
        missionChats,
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
