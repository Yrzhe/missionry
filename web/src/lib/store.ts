import { create } from 'zustand';
import type { Session } from './types';

type AppState = {
  session: Session | null;
  setSession: (session: Session | null) => void;
};

export const useAppStore = create<AppState>((set) => ({
  session: null,
  setSession: (session) => set({ session }),
}));
