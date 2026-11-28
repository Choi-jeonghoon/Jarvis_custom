import { create } from 'zustand';

/** Which full-screen overlays are open. Kept outside page state so the sidebar
 * can open the dashboard from any route. */
interface ModalStore {
  dashboardOpen: boolean;
  historyOpen: boolean;
  setDashboardOpen: (open: boolean) => void;
  setHistoryOpen: (open: boolean) => void;
}

export const useModalStore = create<ModalStore>((set) => ({
  dashboardOpen: false,
  historyOpen: false,
  setDashboardOpen: (dashboardOpen) => set({ dashboardOpen }),
  setHistoryOpen: (historyOpen) => set({ historyOpen }),
}));
