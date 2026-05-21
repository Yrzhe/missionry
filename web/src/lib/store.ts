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
  workroomLoading: Record<string, boolean>;
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
  setWorkroomLoading: (missionId: string, loading: boolean) => void;
  setBudget: (budget: BudgetSettings | null) => void;
  setSpend: (spend: MissionSpendBreakdown[]) => void;
  setAdmin: (data: Partial<Pick<AppState, 'adminOverview' | 'adminUsers' | 'adminWhitelist' | 'adminMissions'>>) => void;
  applyEvent: (event: MissionEvent) => void;
  setMissionChat: (missionId: string, messages: MissionChatMessage[]) => void;
  appendMissionChat: (missionId: string, message: MissionChatMessage) => void;
};

function mergeChatMessages(existing: MissionChatMessage[], incoming: MissionChatMessage[]) {
  const byId = new Map<string, MissionChatMessage>();
  [...existing, ...incoming].forEach((message) => byId.set(message.id, message));
  return Array.from(byId.values()).sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
}

export const useAppStore = create<AppState>((set) => ({
  session: null,
  missions: [],
  workrooms: {},
  workroomLoading: {},
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
  setWorkroom: (missionId, workroom) => set((state) => ({ workrooms: { ...state.workrooms, [missionId]: workroom }, workroomLoading: { ...state.workroomLoading, [missionId]: false } })),
  setWorkroomLoading: (missionId, loading) => set((state) => ({ workroomLoading: { ...state.workroomLoading, [missionId]: loading } })),
  setBudget: (budget) => set({ budget }),
  setSpend: (spend) => set({ spend }),
  setAdmin: (data) => set(data),
  setMissionChat: (missionId, messages) => set((state) => ({ missionChats: { ...state.missionChats, [missionId]: mergeChatMessages([], messages) } })),
  appendMissionChat: (missionId, message) => set((state) => ({ missionChats: { ...state.missionChats, [missionId]: mergeChatMessages(state.missionChats[missionId] ?? [], [message]) } })),
  applyEvent: (event) =>
    set((state) => {
      const events = [event, ...state.events].slice(0, 30);
      const missionId = event.missionId;
      const chatMessage = event.type === 'mission_chat_message_sent' ? event.payload?.message ?? event.payload?.chatMessage : undefined;
      const missionChats = missionId && chatMessage
        ? { ...state.missionChats, [missionId]: mergeChatMessages(state.missionChats[missionId] ?? [], [chatMessage as MissionChatMessage]) }
        : state.missionChats;
      return { events, missionChats };
    }),
}));
