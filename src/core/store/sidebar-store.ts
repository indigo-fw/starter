import { create } from 'zustand';

interface SidebarState {
  isOpen: boolean;        // mobile overlay only
  isL2Collapsed: boolean; // desktop L2 panel collapse
  toggleSidebar: () => void;
  closeSidebar: () => void;
  toggleL2Collapsed: () => void;
}

export const useSidebarStore = create<SidebarState>((set) => ({
  isOpen: false,
  isL2Collapsed: false,
  toggleSidebar: () => set((s) => ({ isOpen: !s.isOpen })),
  closeSidebar: () => set({ isOpen: false }),
  toggleL2Collapsed: () => set((s) => ({ isL2Collapsed: !s.isL2Collapsed })),
}));
